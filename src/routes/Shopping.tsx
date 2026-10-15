import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, today, weekStart } from '../lib/dates'
import { useDishes, useEntries } from '../lib/data'
import { buildShoppingList, groupByCategory, itemLabel, toExportText } from '../lib/shopping'
import { supabase } from '../lib/supabase'
import { Button, Card, Empty, H1, Input } from '../components/ui'

export default function Shopping({ householdId }: { householdId: string }) {
  const qc = useQueryClient()
  const nextMon = addDays(weekStart(today()), 7)
  const [from, setFrom] = useState(nextMon)
  const [to, setTo] = useState(addDays(nextMon, 6))
  const [headers, setHeaders] = useState(false)
  const [msg, setMsg] = useState('')

  const dishes = useDishes()
  const entries = useEntries(from, to)
  const rangeKey = `${from}_${to}`
  const checks = useQuery({
    queryKey: ['checks', rangeKey],
    queryFn: async () => {
      const { data } = await supabase.from('shopping_checks').select('item_key,have').eq('range_key', rangeKey)
      return new Set((data ?? []).filter((r) => r.have).map((r) => r.item_key))
    },
  })

  const items = buildShoppingList(entries.data ?? [], dishes.data ?? [])
  const have = checks.data ?? new Set<string>()

  const toggle = async (key: string) => {
    if (have.has(key)) await supabase.from('shopping_checks').delete().match({ household_id: householdId, range_key: rangeKey, item_key: key })
    else await supabase.from('shopping_checks').upsert({ household_id: householdId, range_key: rangeKey, item_key: key, have: true })
    qc.invalidateQueries({ queryKey: ['checks'] })
  }

  const text = toExportText(items, have, headers)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMsg('Copied! Paste into a Reminders list.') }
    catch { setMsg('Copy failed — use Share instead.') }
  }
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ text }) } catch { /* cancelled */ } }
    else copy()
  }

  return (
    <div className="space-y-4">
      <H1>Shopping list</H1>
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={() => { const m = weekStart(today()); setFrom(m); setTo(addDays(m, 6)) }}>This week</Button>
        <Button variant="ghost" className="flex-1" onClick={() => { setFrom(nextMon); setTo(addDays(nextMon, 6)) }}>Next week</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {items.length === 0 && <Empty icon="🛒">No meals planned in this range.</Empty>}
      {items.length > 0 && (
        <div className="space-y-1">
          <div className="text-sm text-slate-600">{items.filter((i) => have.has(i.key)).length} of {items.length} already have</div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-green-500 transition-all" style={{ width: `${(items.filter((i) => have.has(i.key)).length / items.length) * 100}%` }} /></div>
        </div>
      )}
      {groupByCategory(items).map((g) => (
        <section key={g.category}>
          <h2 className="mb-1 text-sm font-semibold uppercase text-slate-500">{g.category}</h2>
          <Card><ul className="divide-y">
            {g.items.map((i) => (
              <li key={i.key}>
                <label className="flex min-h-12 items-center gap-3 p-3">
                  <input type="checkbox" className="size-5" checked={have.has(i.key)} onChange={() => toggle(i.key)} />
                  <span className={have.has(i.key) ? 'text-slate-400 line-through' : ''}>{itemLabel(i)}</span>
                </label>
              </li>
            ))}
          </ul></Card>
        </section>
      ))}
      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Tick what you already have; those are left out of the export.</p>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={headers} onChange={(e) => setHeaders(e.target.checked)} /> Include category headers
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={copy}>Copy</Button>
            <Button variant="ghost" onClick={share}>Share</Button>
          </div>
          {msg && <p className="text-sm text-green-700">{msg}</p>}
        </div>
      )}
    </div>
  )
}
