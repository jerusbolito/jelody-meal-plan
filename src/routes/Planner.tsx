import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { addDays, parse, today, weekStart } from '../lib/dates'
import { ensurePlan, logEvent, saveWeek, useDishes, useEntries, usePrefs, useStats, useTemplate } from '../lib/data'
import { generateWeeks, rankAlternatives } from '../lib/planner'
import { supabase } from '../lib/supabase'
import type { PlanEntry } from '../lib/types'
import { Button, Card, H1 } from '../components/ui'

const fmt = (s: string) => parse(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

export default function Planner({ householdId }: { householdId: string }) {
  const qc = useQueryClient()
  const [ws, setWs] = useState(() => addDays(weekStart(today()), 7)) // default: next week
  const [weeks, setWeeks] = useState(1)
  const [swapping, setSwapping] = useState<PlanEntry | null>(null)
  const [busy, setBusy] = useState(false)

  const dishes = useDishes()
  const stats = useStats()
  const prefs = usePrefs()
  const template = useTemplate()
  const entries = useEntries(addDays(ws, -28), addDays(ws, 6 + (weeks - 1) * 7))

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
      const planId = await ensurePlan(householdId, weekStart(entry.date))
      await supabase.from('plan_entries').insert({ plan_id: planId, date: entry.date, slot: entry.slot, dish_id })
    }
    setSwapping(null)
    refresh()
    qc.invalidateQueries({ queryKey: ['stats'] })
  }

  const toggleLock = async (e: PlanEntry) => {
    await supabase.from('plan_entries').update({ locked: !e.locked }).eq('id', e.id!)
    refresh()
  }
  const remove = async (e: PlanEntry) => {
    await supabase.from('plan_entries').delete().eq('id', e.id!)
    refresh()
  }

  const days = Array.from({ length: 7 * weeks }, (_, i) => addDays(ws, i))
  const planned = entries.data ?? []

  return (
    <div className="space-y-4">
      <H1>Plan</H1>
      <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-slate-50/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between">
          <Button variant="ghost" aria-label="Previous week" className="w-12" onClick={() => setWs(addDays(ws, -7))}>←</Button>
          <span className="text-sm font-medium">Week of {fmt(ws)}</span>
          <Button variant="ghost" aria-label="Next week" className="w-12" onClick={() => setWs(addDays(ws, 7))}>→</Button>
        </div>
        <div className="flex items-center gap-2">
          <select aria-label="Weeks to generate" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3">
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} week{n > 1 ? 's' : ''}</option>)}
          </select>
          <Button className="flex-1" disabled={!ready || busy} onClick={generate}>{busy ? 'Generating…' : '✨ Generate plan'}</Button>
        </div>
      </div>
      {dishes.data && dishes.data.filter((d) => d.status === 'active').length < 7 && (
        <p className="text-sm text-amber-700">Add at least 7 dishes for varied plans.</p>
      )}

      <ul className="space-y-2">
        {days.map((date) => {
          const day = planned.filter((e) => e.date === date)
          const slots = template.data?.[(parse(date).getDay() + 6) % 7] ?? []
          return (
            <li key={date}><Card className={`p-3 ${date === today() ? 'ring-2 ring-green-500' : ''}`}>
              <div className="mb-1 text-sm font-semibold text-slate-600">{fmt(date)}{date === today() && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Today</span>}</div>
              {slots.map((slot) => {
                const e = day.find((x) => x.slot === slot) ?? { date, slot, dish_id: null, locked: false }
                return (
                  <div key={slot} className="flex items-center gap-1">
                    <span className="w-16 shrink-0 text-xs uppercase text-slate-500">{slot}</span>
                    <button className="min-h-11 flex-1 text-left" onClick={() => setSwapping(e)}>
                      {e.dish_id ? nameOf(e.dish_id) : <span className="text-slate-400">+ choose</span>}
                    </button>
                    {e.id && (
                      <>
                        <button aria-label={e.locked ? 'Unlock' : 'Lock'} className="size-11" onClick={() => toggleLock(e)}>{e.locked ? '🔒' : '🔓'}</button>
                        <button aria-label="Remove" className="size-11 text-slate-400" onClick={() => remove(e)}>✕</button>
                      </>
                    )}
                  </div>
                )
              })}
            </Card></li>
          )
        })}
      </ul>

      {swapping && ready && (
        <div className="fixed inset-0 z-10 flex items-end bg-black/40" onClick={() => setSwapping(null)}>
          <div className="mx-auto max-h-[75dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300" />
            <h2 className="mb-2 text-lg font-semibold">Pick for {fmt(swapping.date)} · {swapping.slot}</h2>
            <ul className="divide-y">
              {rankAlternatives(swapping, { dishes: dishes.data!, stats: stats.data!, prefs: prefs.data!, planned }).map((d) => (
                <li key={d.id}>
                  <button className="min-h-12 w-full py-3 text-left" onClick={() => setDish(swapping, d.id)}>
                    {d.name} {d.status === 'idea' && <span className="text-xs text-amber-700">new idea</span>}
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
