import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { callAI, logEvent, saveDish, useDishes, usePrefs, useStats } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { Dish, Ingredient } from '../lib/types'
import { Button, Card, Empty, H1, Input } from '../components/ui'

type AIDish = Omit<Dish, 'id' | 'source' | 'status' | 'ingredients'> & { ingredients: Ingredient[] }

export default function Dishes({ householdId }: { householdId: string }) {
  const qc = useQueryClient()
  const dishes = useDishes()
  const stats = useStats()
  const prefs = usePrefs()
  const [tab, setTab] = useState<'active' | 'idea'>('active')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const list = (dishes.data ?? []).filter((d) => d.status === tab && d.name.toLowerCase().includes(q.toLowerCase()))
  const refresh = () => { qc.invalidateQueries({ queryKey: ['dishes'] }); qc.invalidateQueries({ queryKey: ['stats'] }) }

  const suggest = async () => {
    setBusy(true); setErr('')
    try {
      const all = dishes.data ?? []
      const affinity = (d: Dish) => stats.data?.[d.id]?.affinity ?? 0
      const ranked = [...all].filter((d) => d.status === 'active').sort((a, b) => affinity(b) - affinity(a))
      const brief = (d: Dish) => ({ name: d.name, cuisine: d.cuisine, tags: d.tags })
      const rejected = await supabase.from('dish_events').select('dishes(name)').eq('type', 'idea_rejected').limit(30)
      const profile = {
        preferences: prefs.data,
        loved: ranked.slice(0, 10).map(brief),
        disliked: ranked.slice(-5).filter((d) => affinity(d) < 0).map(brief),
        existing_names: all.map((d) => d.name),
        rejected_ideas: (rejected.data ?? []).map((r: any) => r.dishes?.name).filter(Boolean),
      }
      const res = await callAI<{ dishes: AIDish[] }>({ action: 'suggest_ideas', count: 4, profile })
      for (const d of res.dishes) {
        const { ingredients, ...fields } = d
        await saveDish(householdId, { ...fields, source: 'ai', status: 'idea' }, ingredients)
      }
      refresh(); setTab('idea')
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    } finally { setBusy(false) }
  }

  const accept = async (d: Dish) => {
    await supabase.from('dishes').update({ status: 'active' }).eq('id', d.id)
    await logEvent(d.id, 'idea_accepted'); refresh()
  }
  const dismiss = async (d: Dish) => {
    await logEvent(d.id, 'idea_rejected')
    await supabase.from('dishes').update({ status: 'archived' }).eq('id', d.id); refresh()
  }

  return (
    <div className="space-y-3">
      <H1>Dishes</H1>
      <div className="flex rounded-xl bg-slate-200/70 p-1" role="tablist">
        {(['active', 'idea'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`min-h-10 flex-1 rounded-lg text-sm font-medium ${tab === t ? 'bg-white shadow-sm' : 'text-slate-600'}`}>
            {t === 'active' ? 'Our dishes' : 'Ideas'}
          </button>
        ))}
      </div>
      <Link to="/dishes/new" aria-label="Add dish" className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-10 flex h-14 items-center gap-1 rounded-full bg-green-600 px-5 font-medium text-white shadow-lg">+ Add dish</Link>
      {tab === 'active' && <Input type="search" placeholder="🔍 Search dishes" value={q} onChange={(e) => setQ(e.target.value)} />}
      {tab === 'idea' && (
        <>
          <Button className="w-full" disabled={busy} onClick={suggest}>{busy ? 'Thinking…' : '✨ Suggest new ideas'}</Button>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </>
      )}
      <Card><ul className="divide-y">
        {list.map((d) => (
          <li key={d.id} className="flex items-center gap-2 p-3">
            <Link to={`/dishes/${d.id}`} className="min-h-11 flex-1 py-1">
              <div className="font-medium">{d.name}</div>
              <div className="text-xs text-slate-500">{[d.cuisine, `${d.prep_minutes} min`, d.calories != null && `${d.calories} kcal${d.serving_g != null ? ` / ${d.serving_g} g` : ''}`, `${d.ingredients.length} ingredients`].filter(Boolean).join(' · ')}</div>
            </Link>
            {tab === 'idea' && (
              <>
                <Button onClick={() => accept(d)}>Keep</Button>
                <Button variant="danger" onClick={() => dismiss(d)}>Dismiss</Button>
              </>
            )}
          </li>
        ))}
        {list.length === 0 && <li><Empty icon={tab === 'idea' ? '💡' : '🍲'}>{tab === 'idea' ? 'No ideas yet. Tap “Suggest new ideas”.' : 'No dishes yet. Add your first one!'}</Empty></li>}
      </ul></Card>
      <div className="h-16" />
    </div>
  )
}
