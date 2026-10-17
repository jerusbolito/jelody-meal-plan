import { useSyncExternalStore } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

/**
 * Offline-safe writes. Callers update the query cache optimistically, then `send` an op:
 * it is saved to localStorage and replayed in order until the server accepts it.
 */
export type Op =
  | { kind: 'insert'; table: string; values: Record<string, unknown> }
  | { kind: 'upsert'; table: string; values: Record<string, unknown>; onConflict?: string }
  | { kind: 'update'; table: string; values: Record<string, unknown>; match: Record<string, unknown> }
  | { kind: 'delete'; table: string; match: Record<string, unknown>; ids?: string[] }

const KEY = 'outbox:v1'
const listeners = new Set<() => void>()
let flushing = false
let client: QueryClient | null = null
let queue: Op[] = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] } })()

const emit = () => listeners.forEach((l) => l())
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(queue)) } catch { /* private mode */ } emit() }

export const pendingCount = () => queue.length

async function run(op: Op) {
  const t = supabase.from(op.table)
  const filter = <T extends { eq: (c: string, v: unknown) => T; in: (c: string, v: unknown[]) => T }>(q: T, m: Record<string, unknown>, ids?: string[]) => {
    let r = q
    for (const [c, v] of Object.entries(m)) r = r.eq(c, v)
    return ids ? r.in('id', ids) : r
  }
  if (op.kind === 'insert') return t.insert(op.values)
  if (op.kind === 'upsert') return t.upsert(op.values, { onConflict: op.onConflict })
  if (op.kind === 'update') return filter(t.update(op.values), op.match)
  return filter(t.delete(), op.match, op.ids)
}

export async function flush() {
  if (flushing || !queue.length) return
  flushing = true
  try {
    while (queue.length) {
      const { error } = await run(queue[0]).catch((e) => ({ error: { code: '', message: String(e) } }))
      // no error code = never reached the server (offline): keep the op and retry later
      if (error && !error.code) break
      queue.shift() // success, or rejected by the server (retrying would never help)
      save()
    }
  } finally {
    flushing = false
    if (!queue.length) for (const k of ['extras', 'checks', 'staples']) client?.invalidateQueries({ queryKey: [k] })
  }
}

export function send(op: Op) {
  queue.push(op)
  save()
  return flush()
}

export function startOutbox(qc: QueryClient) {
  client = qc
  window.addEventListener('online', flush)
  setInterval(flush, 15_000)
  flush()
}

const subscribe = (l: () => void) => { listeners.add(l); window.addEventListener('online', l); window.addEventListener('offline', l); return () => { listeners.delete(l); window.removeEventListener('online', l); window.removeEventListener('offline', l) } }
export const usePending = () => useSyncExternalStore(subscribe, () => queue.length)
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine)
