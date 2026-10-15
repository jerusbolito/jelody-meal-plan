import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { addDays, today } from '../lib/dates'
import { logEvent, useDishes, useEntries } from '../lib/data'
import { supabase } from '../lib/supabase'
import { Button, Card, Empty, H1 } from '../components/ui'

export default function Home() {
  const qc = useQueryClient()
  const t = today()
  const entries = useEntries(addDays(t, -7), t)
  const dishes = useDishes()
  const name = (id: string | null) => dishes.data?.find((d) => d.id === id)?.name ?? '—'

  const pending = (entries.data ?? []).filter((e) => e.dish_id && e.status === 'planned' && e.date < t)
  const todays = (entries.data ?? []).filter((e) => e.date === t)

  const resolve = async (id: string, dish_id: string, status: 'cooked' | 'skipped', rating?: number) => {
    await supabase.from('plan_entries').update({ status }).eq('id', id)
    await logEvent(dish_id, status)
    if (rating) await supabase.from('dish_ratings').insert({ dish_id, plan_entry_id: id, rating })
    qc.invalidateQueries({ queryKey: ['entries'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
  }

  return (
    <div className="space-y-6">
      <section>
        <H1>Today</H1>
        <p className="-mt-2 mb-3 text-sm text-slate-500">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        {todays.length === 0 && (
          <Card><Empty icon="🍳">Nothing planned today.<br /><Link className="font-medium text-green-700 underline" to="/plan">Plan the week</Link></Empty></Card>
        )}
        <ul className="space-y-2">
          {todays.map((e) => (
            <li key={e.id}><Card className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-green-700">{e.slot}</div>
              <div className="text-lg font-medium">{name(e.dish_id)}</div>
            </Card></li>
          ))}
        </ul>
      </section>

      {pending.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">How did these go?</h2>
          <ul className="space-y-3">
            {pending.map((e) => (
              <li key={e.id}><Card className="space-y-3 p-4">
                <div className="font-medium">{name(e.dish_id)} <span className="text-sm text-slate-500">· {e.date} {e.slot}</span></div>
                <div className="flex justify-between" role="group" aria-label="Rate and mark cooked">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className="flex size-12 flex-col items-center justify-center rounded-xl bg-amber-50 text-amber-600" onClick={() => resolve(e.id!, e.dish_id!, 'cooked', n)}>
                      <span className="text-lg leading-none">★</span><span className="text-xs">{n}</span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="ghost" onClick={() => resolve(e.id!, e.dish_id!, 'cooked')}>Cooked</Button>
                  <Button variant="ghost" onClick={() => resolve(e.id!, e.dish_id!, 'skipped')}>Skipped</Button>
                </div>
              </Card></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
