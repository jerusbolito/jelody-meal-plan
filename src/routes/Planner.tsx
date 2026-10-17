import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { addDays, parse, today, weekStart } from '../lib/dates'
import { ensurePlan, logEvent, saveWeek, useDishes, useEntries, usePrefs, useStats, useTemplate } from '../lib/data'
import { generateWeeks, isAllowed, rankAlternatives } from '../lib/planner'
import { supabase } from '../lib/supabase'
import type { PlanEntry } from '../lib/types'
import { Link } from 'react-router-dom'
import { Button, Card, H1, Input } from '../components/ui'

const fmt = (s: string) => parse(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

export default function Planner({ householdId }: { householdId: string }) {
  const qc = useQueryClient()
  const [ws, setWs] = useState(() => addDays(weekStart(today()), 7)) // default: next week
  const [weeks, setWeeks] = useState(1)
  const [swapping, setSwapping] = useState<PlanEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const [movingDay, setMovingDay] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [moving, setMoving] = useState<PlanEntry | null>(null)

  const dishes = useDishes()
  const stats = useStats()
  const prefs = usePrefs()
  const template = useTemplate()
  const entries = useEntries(addDays(ws, -28), addDays(ws, 6 + (weeks - 1) * 7))

  const days = Array.from({ length: 7 * weeks }, (_, i) => addDays(ws, i))
  const ready = dishes.data && stats.data && prefs.data && template.data
  const refresh = () => qc.invalidateQueries({ queryKey: ['entries'] })
  const nameOf = (id: string | null) => dishes.data?.find((d) => d.id === id)?.name ?? '—'

  const generate = async () => {
    if (!ready) return
    setBusy(true)
    try {
      const all = entries.data ?? []
      const result = generateWeeks(
        {
          weekStart: ws,
          template: template.data!,
          dishes: dishes.data!,
          stats: stats.data!,
          prefs: prefs.data!,
          existing: all.filter((e) => e.date >= ws && e.date <= addDays(ws, 6)),
          history: all.filter((e) => e.date < ws),
        },
        weeks,
      )
      for (const [start, list] of Object.entries(result)) await saveWeek(householdId, start, list)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const setDish = async (entry: PlanEntry, dish_id: string) => {
    if (entry.dish_id) await logEvent(entry.dish_id, 'swapped_out')
    if (entry.id) await supabase.from('plan_entries').update({ dish_id, status: 'planned' }).eq('id', entry.id)
    else {
      const offset = Math.floor(days.indexOf(entry.date) / 7) * 7
      const planId = await ensurePlan(householdId, addDays(ws, Math.max(offset, 0)))
      await supabase.from('plan_entries').insert({ plan_id: planId, date: entry.date, slot: entry.slot, dish_id })
    }
    setSwapping(null); setQ('')
    refresh()
    qc.invalidateQueries({ queryKey: ['stats'] })
  }

  /** Swap with another planned slot, or move into an empty one. */
  const moveTo = async (target: PlanEntry) => {
    const src = moving
    setMoving(null)
    if (!src?.id || (target.date === src.date && target.slot === src.slot)) return
    if (target.id) {
      await supabase.from('plan_entries').update({ dish_id: target.dish_id }).eq('id', src.id)
      await supabase.from('plan_entries').update({ dish_id: src.dish_id }).eq('id', target.id)
    } else {
      await supabase.from('plan_entries').update({ date: target.date, slot: target.slot }).eq('id', src.id)
    }
    refresh()
  }

  /** Swap every meal between two days. */
  const swapDays = async (a: string, b: string) => {
    setMovingDay(null)
    if (a === b) return
    const ids = (d: string) => planned.filter((e) => e.date === d && e.id).map((e) => e.id!)
    const [ia, ib] = [ids(a), ids(b)]
    const TMP = '1900-01-01' // avoids the unique (plan, date, slot) clash mid-swap
    const move = (list: string[], date: string) => list.length ? supabase.from('plan_entries').update({ date }).in('id', list) : Promise.resolve()
    await move(ia, TMP); await move(ib, a); await move(ia, b)
    refresh()
  }

  const toggleLock = async (e: PlanEntry) => {
    await supabase.from('plan_entries').update({ locked: !e.locked }).eq('id', e.id!)
    refresh()
  }
  const remove = async (e: PlanEntry) => {
    await supabase.from('plan_entries').delete().eq('id', e.id!)
    refresh()
  }

  const planned = entries.data ?? []

  return (
    <div className="space-y-4">
      <H1>Plan</H1>
      <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-slate-50/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between">
          <Button variant="ghost" aria-label="Previous week" className="w-12" onClick={() => setWs(addDays(ws, -7))}>←</Button>
          <label className="flex flex-1 items-center justify-center gap-2 text-sm font-medium">
            Starts
            <input type="date" aria-label="Start date" value={ws} onChange={(e) => e.target.value && setWs(e.target.value)}
              className="min-h-11 rounded-2xl border border-slate-200 bg-white px-2 text-base" />
          </label>
          <Button variant="ghost" aria-label="Next week" className="w-12" onClick={() => setWs(addDays(ws, 7))}>→</Button>
        </div>
        <div className="flex items-center gap-2">
          <select aria-label="Weeks to generate" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3">
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} week{n > 1 ? 's' : ''}</option>)}
          </select>
          <Button className="flex-1" disabled={!ready || busy} onClick={generate}>{busy ? 'Generating…' : '✨ Generate plan'}</Button>
        </div>
      </div>
      {movingDay && (
        <div className="rounded-2xl bg-green-50 p-3 text-sm text-green-800">Swapping <b>{fmt(movingDay)}</b> — tap “Swap with this day” on another day.</div>
      )}
      {moving && (
        <div className="flex items-center justify-between rounded-2xl bg-green-50 p-3 text-sm text-green-800">
          <span>Moving <b>{nameOf(moving.dish_id)}</b> — tap “Swap here” on the meal you want to trade with (on any day).</span>
          <button className="min-h-11 px-2 font-medium" onClick={() => setMoving(null)}>Cancel</button>
        </div>
      )}
      <details className="rounded-2xl bg-white px-3 text-sm shadow-sm">
        <summary className="min-h-11 cursor-pointer py-3 font-medium text-slate-600">What do the buttons do?</summary>
        <ul className="space-y-1 pb-3 text-slate-600">
          <li><b>Keep / 🔒 Kept</b> – Kept meals stay put when you press Generate; everything else gets re-planned.</li>
          <li><b>⇅</b> (on a meal) – Swap it with a meal on any day, or move it to an empty slot.</li>
          <li><b>⇅ Swap day</b> – Swap all meals between two days.</li>
          <li><b>✎</b> – Edit the dish (ingredients, instructions).</li>
          <li><b>✕</b> – Remove the meal from this slot.</li>
          <li>Tap a dish name to pick a different dish.</li>
        </ul>
      </details>
      {dishes.data && dishes.data.filter((d) => d.status === 'active').length < 7 && (
        <p className="text-sm text-amber-700">Add at least 7 dishes for varied plans.</p>
      )}

      <ul className="space-y-2">
        {days.map((date) => {
          const day = planned.filter((e) => e.date === date)
          const slots = template.data?.[(parse(date).getDay() + 6) % 7] ?? []
          return (
            <li key={date}><Card className={`p-3 ${date === today() ? 'ring-2 ring-green-500' : ''}`}>
              <div className="mb-1 flex items-center justify-between text-sm font-semibold text-slate-600">
                <span>{fmt(date)}{date === today() && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Today</span>}</span>
                {movingDay && movingDay !== date
                  ? <button className="min-h-9 rounded-full bg-green-600 px-3 text-xs font-medium text-white" onClick={() => swapDays(movingDay, date)}>Swap with this day</button>
                  : <button className={`min-h-9 rounded-full px-3 text-xs font-medium ${movingDay === date ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'}`}
                      onClick={() => { setMoving(null); setMovingDay(movingDay === date ? null : date) }}>{movingDay === date ? 'Cancel' : '⇅ Swap day'}</button>}
              </div>
              {slots.map((slot) => {
                const e = day.find((x) => x.slot === slot) ?? { date, slot, dish_id: null, locked: false }
                const isSource = moving?.id != null && moving.id === e.id
                if (moving) {
                  // target-picking mode: every row gets one obvious action
                  return (
                    <div key={slot} className={`my-1 flex items-center gap-2 rounded-xl p-1 ${isSource ? 'bg-green-100 ring-2 ring-green-500' : 'bg-slate-50'}`}>
                      <span className="min-w-0 flex-1 py-1 pl-2">
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{slot}</span>
                        <span className="block leading-snug">{e.dish_id ? nameOf(e.dish_id) : <span className="text-slate-400">empty</span>}</span>
                      </span>
                      {isSource
                        ? <span className="w-24 shrink-0 text-center text-xs font-medium text-green-800">Moving</span>
                        : <button className="min-h-11 w-24 shrink-0 rounded-xl bg-green-600 px-2 text-sm font-medium text-white" onClick={() => moveTo(e)}>{e.id ? 'Swap here' : 'Move here'}</button>}
                    </div>
                  )
                }
                return (
                  <div key={slot} className="flex items-center gap-1 border-t border-slate-100 py-1 first:border-t-0">
                    <button className="min-h-12 min-w-0 flex-1 text-left" onClick={() => setSwapping(e)}>
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{slot}</span>
                      {e.dish_id ? <span className="block leading-snug">{nameOf(e.dish_id)}</span> : <span className="block text-slate-400">+ choose a dish</span>}
                    </button>
                    {e.id && (
                      <div className="flex shrink-0 items-center">
                        {e.dish_id ? <Link to={`/dishes/${e.dish_id}`} aria-label="Edit dish" className="flex size-10 items-center justify-center text-slate-400">✎</Link> : <span className="size-10" />}
                        <button aria-label="Move or swap with another day" className="size-10" onClick={() => { setMovingDay(null); setMoving(e) }}>⇅</button>
                        <button
                          aria-label={e.locked ? 'Kept when regenerating. Tap to unlock' : 'Tap to keep this meal when regenerating'}
                          className={`h-8 w-16 shrink-0 rounded-full text-xs font-medium ${e.locked ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'}`}
                          onClick={() => toggleLock(e)}>{e.locked ? '🔒 Kept' : 'Keep'}</button>
                        <button aria-label="Remove" className="size-10 text-slate-400" onClick={() => remove(e)}>✕</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </Card></li>
          )
        })}
      </ul>

      {swapping && ready && (
        <div className="fixed inset-0 z-10 flex items-end bg-black/40" onClick={() => { setSwapping(null); setQ('') }}>
          <div className="mx-auto max-h-[75dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300" />
            <h2 className="mb-2 text-lg font-semibold">Pick for {fmt(swapping.date)} · {swapping.slot}</h2>
            <Input type="search" placeholder="🔍 Search dishes" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
            <ul className="divide-y">
              {swapping.dish_id && (
                <li><button className="min-h-12 w-full py-3 text-left text-red-600" onClick={async () => { if (swapping.id) await supabase.from('plan_entries').delete().eq('id', swapping.id); setSwapping(null); setQ(''); refresh() }}>Clear this slot</button></li>
              )}
              {[
                ...rankAlternatives(swapping, { dishes: dishes.data!, stats: stats.data!, prefs: prefs.data!, planned }),
                // dishes your diet/allergy settings would normally hide: still pickable by hand
                ...dishes.data!.filter((d) => d.status !== 'archived' && d.id !== swapping.dish_id && !isAllowed(d, prefs.data!)),
              ].filter((d) => d.name.toLowerCase().includes(q.toLowerCase())).map((d) => (
                <li key={d.id}>
                  <button className="min-h-12 w-full py-3 text-left" onClick={() => setDish(swapping, d.id)}>
                    {d.name} {d.status === 'idea' && <span className="text-xs text-amber-700">new idea</span>}
                    {!isAllowed(d, prefs.data!) && <span className="text-xs text-red-600"> conflicts with your preferences</span>}
                    <span className="block text-xs text-slate-500">{[d.cuisine, `${d.prep_minutes} min`].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
