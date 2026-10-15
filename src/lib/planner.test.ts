import { describe, expect, it } from 'vitest'
import { generateWeek, generateWeeks } from './planner'
import type { Dish, Preferences } from './types'

const prefs: Preferences = {
  diets: [], allergies: ['peanut'], dislikes: [], favorite_cuisines: [],
  weeknight_max_minutes: 45, new_ideas_per_week: 0, notes: '',
}
const mk = (i: number, over: Partial<Dish> = {}): Dish => ({
  id: `d${i}`, name: `Dish ${i}`, cuisine: `c${i % 3}`, tags: [], prep_minutes: 30, servings: 4,
  instructions: '', source: 'manual', status: 'active', ingredients: [], ...over,
})
const dishes = Array.from({ length: 12 }, (_, i) => mk(i))
const template = Array.from({ length: 7 }, () => ['dinner'])
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

describe('planner', () => {
  it('does not repeat a dish within a week', () => {
    const w = generateWeek({ weekStart: '2026-10-19', template, dishes, stats: {}, prefs, rng: seeded() })
    const ids = w.map((e) => e.dish_id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(w).toHaveLength(7)
  })

  it('excludes allergens', () => {
    const bad = mk(99, { name: 'Satay', ingredients: [{ name: 'Peanut butter', quantity: 1, unit: '', category: '' }] })
    const w = generateWeek({ weekStart: '2026-10-19', template, dishes: [...dishes, bad], stats: {}, prefs, rng: seeded(3) })
    expect(w.some((e) => e.dish_id === 'd99')).toBe(false)
  })

  it('avoids long dishes on weeknights', () => {
    const long = dishes.map((d, i) => (i < 6 ? { ...d, prep_minutes: 120 } : d))
    const w = generateWeek({ weekStart: '2026-10-19', template, dishes: long, stats: {}, prefs, rng: seeded(5) })
    const weeknight = w.slice(0, 5).map((e) => e.dish_id)
    expect(weeknight.every((id) => Number(id!.slice(1)) >= 6)).toBe(true)
  })

  it('keeps locked entries', () => {
    const w = generateWeek({
      weekStart: '2026-10-19', template, dishes, stats: {}, prefs, rng: seeded(),
      existing: [{ date: '2026-10-21', slot: 'dinner', dish_id: 'd4', locked: true }],
    })
    expect(w.find((e) => e.date === '2026-10-21')?.dish_id).toBe('d4')
    expect(w.filter((e) => e.dish_id === 'd4')).toHaveLength(1)
  })

  it('later weeks avoid the previous week when possible', () => {
    const weeks = generateWeeks({ weekStart: '2026-10-19', template, dishes, stats: {}, prefs, rng: seeded(7) }, 2)
    const [a, b] = Object.values(weeks)
    const first = new Set(a.map((e) => e.dish_id))
    expect(b.filter((e) => first.has(e.dish_id)).length).toBeLessThanOrEqual(2)
  })

  it('uses an idea when new_ideas_per_week > 0', () => {
    const idea = mk(50, { status: 'idea' })
    const w = generateWeek({ weekStart: '2026-10-19', template, dishes: [...dishes, idea], stats: {}, prefs: { ...prefs, new_ideas_per_week: 1 }, rng: seeded(2) })
    expect(w.filter((e) => e.dish_id === 'd50')).toHaveLength(1)
  })
})
