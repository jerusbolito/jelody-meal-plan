import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMembers, usePrefs, useTemplate } from '../lib/data'
import { Link } from 'react-router-dom'
import { setPref, useThemePref, type ThemePref } from '../lib/theme'
import { supabase } from '../lib/supabase'
import type { Preferences } from '../lib/types'
import { Button, csv, Field, H1, Input } from '../components/ui'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SLOTS = ['breakfast', 'lunch', 'dinner']

export default function Settings({ household }: { household: { id: string; name: string; invite_code: string } }) {
  const qc = useQueryClient()
  const prefs = usePrefs()
  const template = useTemplate()
  const theme = useThemePref()
  const mem = useMembers().data
  const [p, setP] = useState<Preferences | null>(null)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => { if (prefs.data) setP(prefs.data) }, [prefs.data])

  if (!p) return null
  const list = (k: 'allergies' | 'dislikes' | 'favorite_cuisines' | 'diets') => (
    <Input defaultValue={p[k].join(', ')} onBlur={(e) => setP({ ...p, [k]: csv(e.target.value) })} />
  )

  const save = async () => {
    await supabase.from('preferences').update(p).eq('household_id', household.id)
    qc.invalidateQueries({ queryKey: ['prefs'] })
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  const toggleSlot = async (wd: number, slot: string) => {
    const cur = template.data?.[wd] ?? []
    const slots = cur.includes(slot) ? cur.filter((s) => s !== slot) : SLOTS.filter((s) => s === slot || cur.includes(s))
    await supabase.from('slot_template').upsert({ household_id: household.id, weekday: wd, slots })
    qc.invalidateQueries({ queryKey: ['template'] })
  }

  return (
    <div className="space-y-6">
      <H1>Settings</H1>
      <section className="flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm">
        <div>
          <div className="text-sm text-slate-500">Invite your partner with this code</div>
          <div className="font-mono text-2xl">{household.invite_code}</div>
        </div>
        <Button variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(household.invite_code); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ } }}>{copied ? 'Copied ✓' : 'Copy'}</Button>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Household members{mem ? ` (${mem.members.length})` : ''}</h2>
        <ul className="divide-y rounded-3xl border border-slate-100 bg-white shadow-sm">
          {(mem?.members ?? []).map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green-100 font-semibold text-green-700" aria-hidden>
                {(m.display_name?.trim()[0] ?? '?').toUpperCase()}
              </span>
              <span className="flex-1 font-medium">{m.display_name?.trim() || 'Unnamed'}</span>
              {m.user_id === mem?.me && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">You</span>}
            </li>
          ))}
        </ul>
        {mem && mem.members.length < 2 && <p className="text-sm text-slate-500">Just you so far. Share the invite code above so your partner can join.</p>}
      </section>

      <Link to="/help" className="flex items-center justify-between rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
        <div>
          <div className="font-semibold">How to use the app</div>
          <div className="text-sm text-slate-500">Every feature, explained</div>
        </div>
        <span className="text-xl text-slate-400">›</span>
      </Link>

      <section className="space-y-2">
        <h2 className="font-semibold">Appearance</h2>
        <div className="flex rounded-2xl bg-slate-200/70 p-1" role="radiogroup" aria-label="Theme">
          {(['system', 'light', 'dark'] as ThemePref[]).map((t) => (
            <button key={t} role="radio" aria-checked={theme === t} onClick={() => setPref(t)}
              className={`min-h-10 flex-1 rounded-xl text-sm font-medium capitalize ${theme === t ? 'bg-white shadow-sm' : 'text-slate-500'}`}>
              {t === 'system' ? 'Auto' : t}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Meals per day</h2>
        {DAYS.map((d, wd) => (
          <div key={d} className="flex items-center gap-2">
            <span className="w-10 text-sm font-medium">{d}</span>
            {SLOTS.map((s) => {
              const on = template.data?.[wd]?.includes(s) ?? false
              return (
                <button key={s} aria-pressed={on} onClick={() => toggleSlot(wd, s)}
                  className={`min-h-11 flex-1 rounded-xl border text-sm capitalize ${on ? 'border-green-600 bg-green-600 text-white' : 'border-slate-300 bg-white text-slate-600'}`}>
                  {s}
                </button>
              )
            })}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Preferences</h2>
        <Field label="Allergies (comma separated)">{list('allergies')}</Field>
        <Field label="Dislikes">{list('dislikes')}</Field>
        <Field label="Favourite cuisines">{list('favorite_cuisines')}</Field>
        <Field label="Diets">{list('diets')}</Field>
        <Field label="Max minutes on weeknights">
          <Input type="number" inputMode="numeric" value={p.weeknight_max_minutes} onChange={(e) => setP({ ...p, weeknight_max_minutes: +e.target.value })} />
        </Field>
        <Field label="New ideas per week (0–3)">
          <Input type="number" min={0} max={3} value={p.new_ideas_per_week} onChange={(e) => setP({ ...p, new_ideas_per_week: Math.min(3, Math.max(0, +e.target.value)) })} />
        </Field>
        <Field label="Notes for the AI">
          <textarea className="h-24 w-full rounded-2xl border border-slate-200 bg-white p-3" value={p.notes} onChange={(e) => setP({ ...p, notes: e.target.value })} />
        </Field>
        <Button className="w-full" onClick={save}>{saved ? 'Saved ✓' : 'Save'}</Button>
      </section>

      <Button variant="ghost" className="w-full" onClick={() => supabase.auth.signOut()}>Sign out</Button>
    </div>
  )
}
