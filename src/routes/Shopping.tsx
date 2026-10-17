import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, parse, today, weekStart } from '../lib/dates'
import { useDishes, useEntries, useMe } from '../lib/data'
import { send } from '../lib/outbox'
import { buildShoppingList, groupByCategory, guessCategory, itemLabel, toExportText } from '../lib/shopping'
import { supabase } from '../lib/supabase'
import type { ShoppingItem } from '../lib/shopping'
import { Button, Card, Empty, H1, Input } from '../components/ui'

type Extra = { id: string; name: string; category: string; have: boolean; added_by_name: string | null; have_by_name: string | null; quantity: number | null; unit: string }
type Staple = { name_key: string; name: string; category: string; pinned: boolean; uses: number }

const UNITS = ['', 'pcs', 'g', 'kg', 'ml', 'l', 'pack', 'can', 'bottle', 'bag', 'box', 'bunch']

/** "2 kg rice" / "3 apples" -> quantity, unit, name (null when there's no leading number) */
const parseQuick = (t: string) => {
  const m = t.trim().match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|pcs|pack|can|bottle|bag|box|bunch|x)?\s+(.+)$/i)
  return m ? { quantity: Number(m[1].replace(',', '.')), unit: (m[2] ?? '').toLowerCase().replace(/^x$/, ''), name: m[3] } : null
}

const fmt = (s: string) => parse(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export default function Shopping({ householdId }: { householdId: string }) {
  const qc = useQueryClient()
  const nextMon = addDays(weekStart(today()), 7)
  const [from, setFrom] = useState(nextMon)
  const [to, setTo] = useState(addDays(nextMon, 6))
  const [headers, setHeaders] = useState(false)
  const [msg, setMsg] = useState('')

  const dishes = useDishes()
  const entries = useEntries(from, to)
  const me = useMe().data ?? null
  const rangeKey = `${from}_${to}`

  // plain objects (not Set/Map) so the persisted offline cache survives JSON
  const checks = useQuery({
    queryKey: ['checks', rangeKey],
    queryFn: async () => {
      const { data, error } = await supabase.from('shopping_checks').select('item_key,have,have_by_name').eq('range_key', rangeKey)
      if (error) throw error
      return Object.fromEntries((data ?? []).filter((r) => r.have).map((r) => [r.item_key, r.have_by_name as string | null]))
    },
  })
  const extras = useQuery({
    queryKey: ['extras'],
    queryFn: async () => {
      const { data, error } = await supabase.from('shopping_extras').select('id,name,category,have,added_by_name,have_by_name,quantity,unit').order('created_at')
      if (error) throw error
      return (data ?? []) as Extra[]
    },
  })
  const staples = useQuery({
    queryKey: ['staples'],
    queryFn: async () => {
      const { data, error } = await supabase.from('shopping_staples').select('name_key,name,category,pinned,uses').order('uses', { ascending: false })
      if (error) throw error
      return (data ?? []) as Staple[]
    },
  })

  const extraItems: ShoppingItem[] = (extras.data ?? []).map((x) => ({ key: `extra:${x.id}`, name: x.name, category: x.category, amounts: x.quantity != null ? [{ family: 'other' as const, qty: x.quantity, unit: x.unit }] : [] }))
  const items = [...buildShoppingList(entries.data ?? [], dishes.data ?? []), ...extraItems]
  const checked = checks.data ?? {}
  const have = new Set([...Object.keys(checked), ...(extras.data ?? []).filter((x) => x.have).map((x) => `extra:${x.id}`)])
  const addedBy = new Map((extras.data ?? []).map((x) => [`extra:${x.id}`, x.added_by_name]))
  const gotBy = (key: string) => (key.startsWith('extra:') ? (extras.data ?? []).find((x) => `extra:${x.id}` === key)?.have_by_name : checked[key]) ?? null

  const [newItem, setNewItem] = useState('')
  const [editStaples, setEditStaples] = useState(false)
  const setExtras = (fn: (x: Extra[]) => Extra[]) => qc.setQueryData<Extra[]>(['extras'], (x) => fn(x ?? []))
  const setStaples = (fn: (x: Staple[]) => Staple[]) => qc.setQueryData<Staple[]>(['staples'], (x) => fn(x ?? []))

  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('')
  const addExtra = (raw: string, amount?: { quantity: number | null; unit: string }) => {
    const parsed = !amount && !qty ? parseQuick(raw) : null
    const name = (parsed?.name ?? raw).trim()
    if (!name) return
    const quantity = amount ? amount.quantity : parsed ? parsed.quantity : qty ? Number(qty.replace(',', '.')) || null : null
    const unitUsed = amount ? amount.unit : parsed ? parsed.unit : quantity != null ? unit : ''
    setNewItem(''); setQty('')
    const key = name.toLowerCase()
    if ((extras.data ?? []).some((x) => !x.have && x.name.toLowerCase() === key)) return // already on the list
    const category = guessCategory(name)
    const row: Extra = { id: crypto.randomUUID(), name, category, have: false, added_by_name: me, have_by_name: null, quantity, unit: unitUsed }
    setExtras((x) => [...x, row])
    send({ kind: 'insert', table: 'shopping_extras', values: { ...row, household_id: householdId } })
    // remember it: staples double as the "recently added" list
    const old = (staples.data ?? []).find((s) => s.name_key === key)
    const next: Staple = { name_key: key, name: old?.name ?? name, category, pinned: old?.pinned ?? false, uses: (old?.uses ?? 0) + 1 }
    setStaples((x) => [...x.filter((s) => s.name_key !== key), next].sort((a, b) => b.uses - a.uses))
    send({ kind: 'upsert', table: 'shopping_staples', onConflict: 'household_id,name_key', values: { ...next, household_id: householdId, last_used: new Date().toISOString() } })
  }
  const removeExtra = (key: string) => {
    const id = key.slice('extra:'.length)
    setExtras((x) => x.filter((r) => r.id !== id))
    send({ kind: 'delete', table: 'shopping_extras', match: { id } })
  }
  const clearTicked = () => {
    const ids = (extras.data ?? []).filter((x) => x.have).map((x) => x.id)
    setExtras((x) => x.filter((r) => !r.have))
    if (ids.length) send({ kind: 'delete', table: 'shopping_extras', match: {}, ids })
  }
  const pinStaple = (s: Staple) => {
    setStaples((x) => x.map((r) => (r.name_key === s.name_key ? { ...r, pinned: !r.pinned } : r)))
    send({ kind: 'update', table: 'shopping_staples', values: { pinned: !s.pinned }, match: { household_id: householdId, name_key: s.name_key } })
  }
  const dropStaple = (s: Staple) => {
    setStaples((x) => x.filter((r) => r.name_key !== s.name_key))
    send({ kind: 'delete', table: 'shopping_staples', match: { household_id: householdId, name_key: s.name_key } })
  }

  const toggle = (key: string) => {
    const nowHave = !have.has(key)
    if (key.startsWith('extra:')) {
      const id = key.slice('extra:'.length)
      const who = nowHave ? me : null
      setExtras((x) => x.map((r) => (r.id === id ? { ...r, have: nowHave, have_by_name: who } : r)))
      send({ kind: 'update', table: 'shopping_extras', values: { have: nowHave, have_by_name: who }, match: { id } })
      return
    }
    qc.setQueryData<Record<string, string | null>>(['checks', rangeKey], (c) => {
      const next = { ...(c ?? {}) }
      if (nowHave) next[key] = me; else delete next[key]
      return next
    })
    if (nowHave) send({ kind: 'upsert', table: 'shopping_checks', values: { household_id: householdId, range_key: rangeKey, item_key: key, have: true, have_by_name: me } })
    else send({ kind: 'delete', table: 'shopping_checks', match: { household_id: householdId, range_key: rangeKey, item_key: key } })
  }

  const text = toExportText(items, have, headers)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMsg('Copied to clipboard.') }
    catch { setMsg('Copy failed — use Share instead.') }
  }
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ text }) } catch { /* cancelled */ } }
    else copy()
  }

  const todo = items.filter((i) => !have.has(i.key))
  const done = items.filter((i) => have.has(i.key))
  const shiftRange = (n: number) => { setFrom(addDays(from, n)); setTo(addDays(to, n)) }
  const onList = new Set([...(extras.data ?? []).filter((x) => !x.have).map((x) => x.name.toLowerCase()), ...todo.map((i) => i.name.toLowerCase())])
  const quick = (staples.data ?? [])
    .filter((s) => (editStaples || !onList.has(s.name_key)) && s.name_key.includes(newItem.trim().toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.uses - a.uses)
    .slice(0, editStaples ? 60 : 14)
  const hasTickedExtras = (extras.data ?? []).some((x) => x.have)

  const row = (i: ShoppingItem) => (
    <li key={i.key} className="flex items-center">
      <label className="flex min-h-14 flex-1 items-center gap-4 px-4 py-2">
        <input type="checkbox" className="tick" checked={have.has(i.key)} onChange={() => toggle(i.key)} />
        <span className="min-w-0 flex-1">
          <span className={`block text-lg ${have.has(i.key) ? 'text-slate-400 line-through' : ''}`}>{itemLabel(i)}</span>
          {(() => {
            const who = have.has(i.key) ? gotBy(i.key) : addedBy.get(i.key)
            return who && who !== me ? <span className="block text-xs text-slate-400">{have.has(i.key) ? 'got by' : 'added by'} {who}</span> : null
          })()}
        </span>
      </label>
      {i.key.startsWith('extra:') && (
        <button type="button" aria-label={`Remove ${i.name}`} className="size-12 shrink-0 text-slate-300" onClick={() => removeExtra(i.key)}>✕</button>
      )}
    </li>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <H1>Shopping</H1>
        {items.length > 0 && <span className="text-sm text-slate-500">{done.length} / {items.length} in basket</span>}
      </div>

      <form className="group sticky top-0 z-10 -mx-4 bg-slate-50/95 px-4 py-2 backdrop-blur" onSubmit={(e) => { e.preventDefault(); addExtra(newItem) }}>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/20">
          <div className="flex items-center gap-2 py-1 pl-4 pr-1.5">
            <input enterKeyHint="done" autoCapitalize="sentences" placeholder="Add an item…" value={newItem} onChange={(e) => setNewItem(e.target.value)}
              className="min-h-11 min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-slate-400" />
            <button type="submit" aria-label="Add item" disabled={!newItem.trim()}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green-600 text-2xl leading-none text-white transition disabled:bg-slate-200 disabled:text-slate-400">+</button>
          </div>
          <div className={`items-center gap-2 border-t border-slate-100 px-4 py-2 text-sm text-slate-500 ${newItem || qty ? 'flex' : 'hidden group-focus-within:flex'}`}>
            <span>Amount</span>
            <input type="text" inputMode="decimal" aria-label="Quantity" placeholder="e.g. 2" value={qty} onChange={(e) => setQty(e.target.value)}
              className="min-h-9 w-16 rounded-lg bg-slate-100 px-2 text-center text-base text-slate-900 outline-none placeholder:text-slate-400" />
            <select aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} className="min-h-9 rounded-lg bg-slate-100 px-2 text-base text-slate-900 outline-none">
              {UNITS.map((u) => <option key={u} value={u}>{u || 'unit'}</option>)}
            </select>
            <span className="ml-auto text-xs text-slate-400">optional</span>
          </div>
        </div>
      </form>

      {quick.length > 0 && (
        <section>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase text-slate-500">Quick add</h2>
            <button className="min-h-9 px-2 text-sm text-green-700" onClick={() => setEditStaples(!editStaples)}>{editStaples ? 'Done' : 'Edit'}</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {quick.map((s) => (
              <span key={s.name_key} className="flex items-center overflow-hidden rounded-full border border-slate-300 bg-white text-sm">
                <button className="min-h-10 px-3" onClick={() => (editStaples ? pinStaple(s) : addExtra(s.name, { quantity: null, unit: '' }))}>
                  {editStaples ? (s.pinned ? '★ ' : '☆ ') : s.pinned ? '★ ' : '+ '}{s.name}
                </button>
                {editStaples && <button aria-label={`Forget ${s.name}`} className="min-h-10 px-2 text-slate-400" onClick={() => dropStaple(s)}>✕</button>}
              </span>
            ))}
          </div>
          {editStaples && <p className="mt-1 text-xs text-slate-500">☆ pins a staple to the front. ✕ forgets it. Items you add are remembered automatically.</p>}
        </section>
      )}

      {items.length > 0 && (
        <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-green-500 transition-all" style={{ width: `${(done.length / items.length) * 100}%` }} /></div>
      )}
      {items.length === 0 && <Empty icon="🛒">Nothing on the list yet.<br />Add an item above, or plan some meals.</Empty>}
      {items.length > 0 && todo.length === 0 && <Empty icon="🎉">Everything's in the basket!</Empty>}

      {groupByCategory(todo).map((g) => (
        <section key={g.category}>
          <h2 className="mb-1 text-sm font-semibold uppercase text-slate-500">{g.category}</h2>
          <Card><ul className="divide-y">{g.items.map(row)}</ul></Card>
        </section>
      ))}

      {done.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold uppercase text-slate-500">
            <span className="transition group-open:rotate-90">▸</span> In basket ({done.length})
          </summary>
          <Card className="mt-1"><ul className="divide-y">{done.map(row)}</ul></Card>
          {hasTickedExtras && <Button variant="danger" className="mt-2 w-full" onClick={clearTicked}>Clear ticked items I added</Button>}
        </details>
      )}

      <section className="space-y-2 rounded-2xl bg-slate-100 p-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" aria-label="Previous week" className="w-12 bg-white" onClick={() => shiftRange(-7)}>←</Button>
          <div className="flex-1 text-center">
            <div className="text-xs uppercase text-slate-500">Meals from</div>
            <div className="text-sm font-medium">{fmt(from)} – {fmt(to)}</div>
          </div>
          <Button variant="ghost" aria-label="Next week" className="w-12 bg-white" onClick={() => shiftRange(7)}>→</Button>
        </div>
        <details>
          <summary className="min-h-10 cursor-pointer py-2 text-center text-sm text-green-700">Custom dates</summary>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            <Input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="ghost" className="bg-white" onClick={() => { const m = weekStart(today()); setFrom(m); setTo(addDays(m, 6)) }}>This week</Button>
            <Button variant="ghost" className="bg-white" onClick={() => { setFrom(nextMon); setTo(addDays(nextMon, 6)) }}>Next week</Button>
          </div>
        </details>
      </section>

      {todo.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-slate-600">Export remaining items</summary>
          <div className="space-y-2">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={headers} onChange={(e) => setHeaders(e.target.checked)} /> Include category headers
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={copy}>Copy</Button>
              <Button variant="ghost" onClick={share}>Share</Button>
            </div>
            {msg && <p className="text-sm text-green-700">{msg}</p>}
          </div>
        </details>
      )}
    </div>
  )
}
