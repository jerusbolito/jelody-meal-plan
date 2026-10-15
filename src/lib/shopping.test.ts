import { describe, expect, it } from 'vitest'
import { buildShoppingList, groupByCategory, guessCategory, toExportText } from './shopping'
import type { Dish } from './types'

const dish = (id: string, ings: [string, number | null, string][], servings = 4): Dish => ({
  id, name: id, cuisine: '', tags: [], prep_minutes: 30, servings, instructions: '',
  source: 'manual', status: 'active',
  ingredients: ings.map(([name, quantity, unit]) => ({ name, quantity, unit, category: '' })),
})
const entry = (dish_id: string, date = '2026-10-19') => ({ date, slot: 'dinner', dish_id, locked: false })

describe('shopping', () => {
  const dishes = [
    dish('a', [['Onion', 2, ''], ['Milk', 500, 'ml'], ['Rice', 300, 'g']]),
    dish('b', [['Onions', 1, ''], ['Milk', 2, 'cup'], ['Rice', 0.5, 'kg']]),
  ]

  it('merges duplicates and converts units', () => {
    const items = buildShoppingList([entry('a'), entry('b', '2026-10-20')], dishes)
    const onion = items.find((i) => i.key === 'onion')!
    expect(onion.amounts[0].qty).toBe(3)
    const rice = items.find((i) => i.key === 'rice')!
    expect(rice.amounts[0].qty).toBe(800)
    const milk = items.find((i) => i.key === 'milk')!
    expect(milk.amounts).toHaveLength(1)
    expect(milk.amounts[0].qty).toBe(980)
  })

  it('scales by servings', () => {
    const items = buildShoppingList([entry('a')], dishes, () => 8)
    expect(items.find((i) => i.key === 'onion')!.amounts[0].qty).toBe(4)
  })

  it('guesses categories', () => {
    expect(guessCategory('coconut milk')).toBe('Pantry')
    expect(guessCategory('chicken breast')).toBe('Meat & Fish')
    expect(guessCategory('widget')).toBe('Other')
  })

  it('exports one item per line and omits ones we have', () => {
    const items = buildShoppingList([entry('a')], dishes)
    const text = toExportText(items, new Set(['rice']))
    expect(text.split('\n')).toHaveLength(2)
    expect(text).not.toMatch(/rice/i)
    expect(toExportText(items, new Set(), true)).toContain('Produce')
  })

  it('groups by category', () => {
    const groups = groupByCategory(buildShoppingList([entry('a')], dishes))
    expect(groups.map((g) => g.category)).toEqual(['Produce', 'Dairy', 'Pantry'])
  })
})
