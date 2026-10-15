import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { callAI, saveDish, useDishes } from '../lib/data'
import { guessCategory, CATEGORIES } from '../lib/shopping'
import { supabase } from '../lib/supabase'
import type { Ingredient, Nutrition } from '../lib/types'
import { Button, csv, Field, H1, Input } from '../components/ui'

const NO_NUTRI: Nutrition = { serving_g: null, calories: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null }
const NUTRI_FIELDS = [
  ['serving_g', 'Serving size', 'g'],
  ['calories', 'Calories', 'kcal'],
  ['protein_g', 'Protein', 'g'],
  ['carbs_g', 'Carbs', 'g'],
  ['fat_g', 'Fat', 'g'],
  ['fiber_g', 'Fiber', 'g'],
] as const
const pickNutri = (d: Partial<Nutrition>): Nutrition => ({
  serving_g: d.serving_g ?? null, calories: d.calories ?? null, protein_g: d.protein_g ?? null, carbs_g: d.carbs_g ?? null, fat_g: d.fat_g ?? null, fiber_g: d.fiber_g ?? null,
})

const blank = (): Ingredient => ({ name: '', quantity: null, unit: '', category: '' })

export default function DishEdit({ householdId }: { householdId: string }) {
  const { id } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const dishes = useDishes()
  const existing = id && id !== 'new' ? dishes.data?.find((d) => d.id === id) : undefined

  const [name, setName] = useState('')
  const [cuisine, setCuisine] = useState('')
  const [tags, setTags] = useState('')
  const [prep, setPrep] = useState(30)
  const [servings, setServings] = useState(4)
  const [instructions, setInstructions] = useState('')
  const [ings, setIngs] = useState<Ingredient[]>([blank()])
  const [nutri, setNutri] = useState<Nutrition>(NO_NUTRI)
  const [estimating, setEstimating] = useState(false)
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!existing) return
    setName(existing.name); setCuisine(existing.cuisine); setTags(existing.tags.join(', '))
    setPrep(existing.prep_minutes); setServings(existing.servings); setInstructions(existing.instructions)
    setIngs(existing.ingredients.length ? existing.ingredients : [blank()])
    setNutri(pickNutri(existing))
  }, [existing?.id])

  const patch = (i: number, p: Partial<Ingredient>) => setIngs(ings.map((x, j) => (j === i ? { ...x, ...p } : x)))

  const parse = async () => {
    setBusy(true); setErr('')
    try {
      const d = await callAI<any>({ action: 'parse_recipe', text: paste })
      setName(d.name); setCuisine(d.cuisine ?? ''); setTags((d.tags ?? []).join(', '))
      setPrep(d.prep_minutes ?? 30); setServings(d.servings ?? 4); setInstructions(d.instructions ?? '')
      setIngs(d.ingredients?.length ? d.ingredients : [blank()])
      setNutri(pickNutri(d))
      setPaste('')
    } catch (e) { setErr(String((e as Error).message ?? e)) } finally { setBusy(false) }
  }

  const estimate = async () => {
    setEstimating(true); setErr('')
    try {
      const ingredients = ings.filter((i) => i.name.trim()).map(({ name, quantity, unit }) => ({ name, quantity, unit }))
      setNutri(pickNutri(await callAI<Nutrition>({ action: 'estimate_nutrition', name, servings, ingredients })))
    } catch (e) { setErr(String((e as Error).message ?? e)) } finally { setEstimating(false) }
  }

  const save = async () => {
    const cleaned = ings.filter((i) => i.name.trim()).map((i) => ({ ...i, category: i.category || guessCategory(i.name) }))
    await saveDish(householdId, { id: existing?.id, name, cuisine, tags: csv(tags), prep_minutes: prep, servings, instructions, ...nutri, source: existing?.source ?? 'manual', status: existing?.status ?? 'active' } as any, cleaned)
    qc.invalidateQueries({ queryKey: ['dishes'] })
    nav('/dishes')
  }

  const archive = async () => {
    if (!existing) return
    await supabase.from('dishes').update({ status: 'archived' }).eq('id', existing.id)
    qc.invalidateQueries({ queryKey: ['dishes'] })
    nav('/dishes')
  }

  return (
    <div className="space-y-4">
      <H1>{existing ? 'Edit dish' : 'New dish'}</H1>
      {!existing && (
        <details className="rounded-2xl border bg-white p-3 shadow-sm">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Paste a recipe (AI fills in the rest)</summary>
          <textarea className="mb-2 mt-2 h-32 w-full rounded-xl border border-slate-300 p-3" value={paste} onChange={(e) => setPaste(e.target.value)} />
          <Button disabled={busy || !paste.trim()} onClick={parse}>{busy ? 'Parsing…' : 'Parse'}</Button>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </details>
      )}
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Cuisine"><Input value={cuisine} onChange={(e) => setCuisine(e.target.value)} /></Field>
        <Field label="Minutes"><Input type="number" inputMode="numeric" value={prep} onChange={(e) => setPrep(+e.target.value)} /></Field>
        <Field label="Servings"><Input type="number" inputMode="numeric" value={servings} onChange={(e) => setServings(+e.target.value)} /></Field>
      </div>
      <Field label="Tags (comma separated)"><Input value={tags} onChange={(e) => setTags(e.target.value)} /></Field>

      <section className="space-y-2">
        <h2 className="font-medium">Ingredients</h2>
        {ings.map((ing, i) => (
          <div key={i} className="grid grid-cols-[1fr_4rem_4rem_auto] gap-1 rounded-xl bg-white p-2 shadow-sm">
            <Input placeholder="Name" value={ing.name} onChange={(e) => patch(i, { name: e.target.value })} />
            <Input placeholder="Qty" type="number" inputMode="decimal" value={ing.quantity ?? ''} onChange={(e) => patch(i, { quantity: e.target.value === '' ? null : +e.target.value })} />
            <Input placeholder="Unit" value={ing.unit} onChange={(e) => patch(i, { unit: e.target.value })} />
            <button aria-label="Remove ingredient" className="size-11 text-slate-400" onClick={() => setIngs(ings.filter((_, j) => j !== i))}>✕</button>
            <select className="col-span-4 min-h-10 rounded-xl border border-slate-300 bg-white px-2 text-sm text-slate-600" value={ing.category} onChange={(e) => patch(i, { category: e.target.value })}>
              <option value="">Category: auto</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        ))}
        <Button variant="ghost" onClick={() => setIngs([...ings, blank()])}>+ Ingredient</Button>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Nutrition <span className="text-sm font-normal text-slate-500">per serving</span></h2>
          <Button variant="ghost" disabled={estimating || !ings.some((i) => i.name.trim())} onClick={estimate}>{estimating ? 'Estimating…' : '✨ Estimate with AI'}</Button>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="grid grid-cols-3 gap-2">
          {NUTRI_FIELDS.map(([k, label, unit]) => (
            <Field key={k} label={label}>
              <Input type="number" inputMode="decimal" placeholder={unit} value={nutri[k] ?? ''}
                onChange={(e) => setNutri({ ...nutri, [k]: e.target.value === '' ? null : +e.target.value })} />
            </Field>
          ))}
        </div>
        <p className="text-xs text-slate-500">Serving size, protein, carbs, fat and fiber in grams; calories in kcal. AI values are rough estimates.</p>
      </section>

      <Field label="Instructions (optional)">
        <textarea className="h-28 w-full rounded-xl border border-slate-300 bg-white p-3" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </Field>
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 border-t bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-2">
          <Button variant="ghost" onClick={() => nav('/dishes')}>Cancel</Button>
          {existing && <Button variant="danger" onClick={archive}>Archive</Button>}
          <Button className="flex-1" disabled={!name.trim()} onClick={save}>Save</Button>
        </div>
      </div>
      <div className="h-20" />
    </div>
  )
}
