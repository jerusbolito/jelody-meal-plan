import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDishes } from '../lib/data'
import { Button, Card, Empty } from '../components/ui'

const round = (n: number) => Math.round(n * 100) / 100
const store = {
  get: (k: string): number[] => { try { return JSON.parse(localStorage.getItem(k) ?? '[]') } catch { return [] } },
  set: (k: string, v: number[]) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } },
}

/** Read-only cooking view: scaled ingredients, tickable steps, screen stays on. */
export default function Cook() {
  const { id } = useParams()
  const dish = useDishes().data?.find((d) => d.id === id)
  const [servings, setServings] = useState<number | null>(null)
  const [gotIngs, setGotIngs] = useState<number[]>([])
  const [doneSteps, setDoneSteps] = useState<number[]>([])
  const key = `cook:${id}`

  useEffect(() => { setGotIngs(store.get(`${key}:i`)); setDoneSteps(store.get(`${key}:s`)) }, [key])

  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const acquire = () => navigator.wakeLock?.request('screen').then((l) => { lock = l }).catch(() => {})
    acquire()
    const onVis = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release().catch(() => {}) }
  }, [])

  if (!dish) return <Empty icon="🍳">Loading…</Empty>

  const base = dish.servings || 1
  const n = servings ?? base
  const scale = n / base
  const steps = dish.instructions.split('\n').map((s) => s.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean)

  const flip = (list: number[], i: number, set: (v: number[]) => void, k: string) => {
    const next = list.includes(i) ? list.filter((x) => x !== i) : [...list, i]
    set(next); store.set(k, next)
  }
  const reset = () => { setGotIngs([]); setDoneSteps([]); store.set(`${key}:i`, []); store.set(`${key}:s`, []) }

  return (
    <div className="space-y-5">
      <div>
        <Link to="/dishes" className="text-sm text-green-700">← Dishes</Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{dish.name}</h1>
        <p className="text-sm text-slate-500">{[dish.cuisine, `${dish.prep_minutes} min`].filter(Boolean).join(' · ')}</p>
      </div>

      {dish.notes?.trim() && (
        <div className="whitespace-pre-line rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Our notes</div>
          {dish.notes}
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl bg-white p-2 shadow-sm">
        <span className="pl-2 text-sm font-medium">Servings</span>
        <div className="flex items-center">
          <Button variant="ghost" aria-label="Fewer servings" className="w-11" onClick={() => setServings(Math.max(1, n - 1))}>−</Button>
          <span className="w-10 text-center text-lg font-semibold">{n}</span>
          <Button variant="ghost" aria-label="More servings" className="w-11" onClick={() => setServings(n + 1)}>+</Button>
        </div>
      </div>

      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase text-slate-500">Ingredients</h2>
        <Card><ul className="divide-y">
          {dish.ingredients.map((ing, i) => (
            <li key={i}>
              <label className="flex min-h-12 items-center gap-4 p-3 text-lg">
                <input type="checkbox" className="tick" checked={gotIngs.includes(i)} onChange={() => flip(gotIngs, i, setGotIngs, `${key}:i`)} />
                <span className={gotIngs.includes(i) ? 'text-slate-400 line-through' : ''}>
                  {ing.quantity != null && <b>{round(ing.quantity * scale)} {ing.unit} </b>}{ing.name}
                  {ing.note && <span className="text-sm text-slate-500"> ({ing.note})</span>}
                </span>
              </label>
            </li>
          ))}
        </ul></Card>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase text-slate-500">Method</h2>
        {steps.length === 0 && <Card><Empty icon="📝">No instructions yet.<br /><Link className="font-medium text-green-700 underline" to={`/dishes/${dish.id}`}>Add some</Link></Empty></Card>}
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i}>
              <button onClick={() => flip(doneSteps, i, setDoneSteps, `${key}:s`)}
                className={`flex w-full gap-3 rounded-2xl border bg-white p-4 text-left text-lg shadow-sm ${doneSteps.includes(i) ? 'border-green-200 text-slate-400' : 'border-slate-200'}`}>
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${doneSteps.includes(i) ? 'bg-green-600 text-white' : 'bg-slate-200'}`}>{doneSteps.includes(i) ? '✓' : i + 1}</span>
                <span className={doneSteps.includes(i) ? 'line-through' : ''}>{s}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={reset}>Reset ticks</Button>
        <Link to={`/dishes/${dish.id}`} className="flex min-h-11 items-center justify-center rounded-xl bg-slate-200/70 text-sm font-medium">Edit recipe</Link>
      </div>
    </div>
  )
}
