import { addDays, weekdayIndex } from './dates'
import type { Dish, DishStats, PlanEntry, Preferences, SlotTemplate } from './types'

export type PlannerInput = {
  weekStart: string // Monday, YYYY-MM-DD
  template: SlotTemplate
  dishes: Dish[]
  stats: Record<string, DishStats>
  prefs: Preferences
  /** entries already in the plan (locked ones are kept, others are replaced) */
  existing?: PlanEntry[]
  /** entries from surrounding weeks, used for repeat/recency penalties */
  history?: PlanEntry[]
  rng?: () => number
}

const lc = (s: string) => s.toLowerCase()

export function isAllowed(dish: Dish, prefs: Preferences): boolean {
  const banned = [...prefs.allergies, ...prefs.dislikes].map(lc).filter(Boolean)
  if (!banned.length) return true
  const haystack = [dish.name, ...dish.ingredients.map((i) => i.name)].map(lc)
  return !banned.some((b) => haystack.some((h) => h.includes(b)))
}

type Ctx = {
  date: string
  used: Map<string, string[]> // dish_id -> dates it is planned on
  prevCuisine: string
  stats: Record<string, DishStats>
  prefs: Preferences
}

export function score(dish: Dish, ctx: Ctx): number {
  let s = ctx.stats[dish.id]?.affinity ?? 0
  const last = ctx.stats[dish.id]?.last_cooked_at
  if (last) {
    const days = (Date.parse(ctx.date) - Date.parse(last)) / 86_400_000
    s += Math.min(Math.max(days, 0), 28) / 14 // up to +2
  } else {
    s += 1
  }
  const dates = ctx.used.get(dish.id) ?? []
  for (const d of dates) {
    const gap = Math.abs((Date.parse(ctx.date) - Date.parse(d)) / 86_400_000)
    if (gap < 7) s -= 100 // effectively never repeat within a week
    else if (gap < 14) s -= 3
  }
  if (dish.cuisine && ctx.prevCuisine && lc(dish.cuisine) === lc(ctx.prevCuisine)) s -= 1.5
  if (ctx.prefs.favorite_cuisines.map(lc).includes(lc(dish.cuisine))) s += 0.5
  const wd = weekdayIndex(ctx.date)
  if (wd < 5 && dish.prep_minutes > ctx.prefs.weeknight_max_minutes) s -= 3
  return s
}

/** weighted random pick among the top candidates */
function pick<T>(items: { item: T; score: number }[], rng: () => number, topN = 5): T | null {
  if (!items.length) return null
  const top = [...items].sort((a, b) => b.score - a.score).slice(0, topN)
  const min = Math.min(...top.map((t) => t.score))
  const weights = top.map((t) => t.score - min + 0.5)
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < top.length; i++) {
    r -= weights[i]
    if (r <= 0) return top[i].item
  }
  return top[top.length - 1].item
}

export function generateWeek(input: PlannerInput): PlanEntry[] {
  const rng = input.rng ?? Math.random
  const { weekStart: ws, template, dishes, stats, prefs } = input
  const allowed = dishes.filter((d) => isAllowed(d, prefs))
  const active = allowed.filter((d) => d.status === 'active')
  const ideas = allowed.filter((d) => d.status === 'idea')
  const byId = new Map(dishes.map((d) => [d.id, d]))

  const locked = (input.existing ?? []).filter((e) => e.locked && e.dish_id)
  const lockedKey = new Set(locked.map((e) => `${e.date}|${e.slot}`))

  const used = new Map<string, string[]>()
  const note = (e: PlanEntry) => {
    if (!e.dish_id) return
    used.set(e.dish_id, [...(used.get(e.dish_id) ?? []), e.date])
  }
  ;(input.history ?? []).forEach(note)
  locked.forEach(note)

  // slots to fill
  const slots: { date: string; slot: string }[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(ws, i)
    for (const slot of template[i] ?? []) {
      if (!lockedKey.has(`${date}|${slot}`)) slots.push({ date, slot })
    }
  }

  // choose which slots get a new idea
  const ideaSlots = new Set<number>()
  const n = Math.min(prefs.new_ideas_per_week, ideas.length, slots.length)
  while (ideaSlots.size < n) ideaSlots.add(Math.floor(rng() * slots.length))

  const result: PlanEntry[] = [...locked]
  const lastCuisineByDate = (date: string) => {
    const prev = addDays(date, -1)
    const e = [...result, ...(input.history ?? [])].find((x) => x.date === prev && x.dish_id)
    return e?.dish_id ? (byId.get(e.dish_id)?.cuisine ?? '') : ''
  }

  slots.forEach(({ date, slot }, idx) => {
    const pool = ideaSlots.has(idx) ? ideas : active
    const ctx: Ctx = { date, used, prevCuisine: lastCuisineByDate(date), stats, prefs }
    let candidates = pool.map((item) => ({ item, score: score(item, ctx) }))
    if (!candidates.length) candidates = active.map((item) => ({ item, score: score(item, ctx) }))
    const dish = pick(candidates, rng)
    const entry: PlanEntry = { date, slot, dish_id: dish?.id ?? null, locked: false }
    if (dish) note(entry)
    result.push(entry)
  })

  return result.sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot))
}

/** Generate several consecutive weeks so penalties carry across them. */
export function generateWeeks(input: PlannerInput, count: number): Record<string, PlanEntry[]> {
  const out: Record<string, PlanEntry[]> = {}
  let history = input.history ?? []
  for (let w = 0; w < count; w++) {
    const ws = addDays(input.weekStart, w * 7)
    const entries = generateWeek({ ...input, weekStart: ws, existing: w === 0 ? input.existing : [], history })
    out[ws] = entries
    history = [...history, ...entries]
  }
  return out
}

/** Ranked alternatives for swapping a single slot. */
export function rankAlternatives(
  entry: PlanEntry,
  input: Pick<PlannerInput, 'dishes' | 'stats' | 'prefs'> & { planned: PlanEntry[] },
): Dish[] {
  const used = new Map<string, string[]>()
  input.planned.forEach((e) => {
    if (e.dish_id && !(e.date === entry.date && e.slot === entry.slot))
      used.set(e.dish_id, [...(used.get(e.dish_id) ?? []), e.date])
  })
  const ctx: Ctx = { date: entry.date, used, prevCuisine: '', stats: input.stats, prefs: input.prefs }
  return input.dishes
    .filter((d) => d.status !== 'archived' && d.id !== entry.dish_id && isAllowed(d, input.prefs))
    .map((d) => ({ d, s: score(d, ctx) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.d)
}
