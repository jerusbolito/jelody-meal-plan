import type { Dish, Ingredient, PlanEntry } from './types'

export const CATEGORIES = [
  'Produce', 'Meat & Fish', 'Dairy', 'Bakery', 'Pantry', 'Frozen', 'Spices', 'Other',
] as const

const KEYWORDS: Record<string, string[]> = {
  Produce: ['onion', 'garlic', 'tomato', 'potato', 'carrot', 'pepper', 'lettuce', 'spinach', 'cucumber', 'lemon', 'lime', 'apple', 'banana', 'broccoli', 'zucchini', 'mushroom', 'celery', 'ginger', 'herb', 'basil', 'parsley', 'cilantro', 'avocado', 'cabbage', 'kale', 'leek', 'squash'],
  'Meat & Fish': ['chicken', 'beef', 'pork', 'lamb', 'bacon', 'sausage', 'ham', 'turkey', 'salmon', 'tuna', 'shrimp', 'fish', 'mince', 'steak'],
  Dairy: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'egg', 'parmesan', 'mozzarella', 'feta'],
  Bakery: ['bread', 'bun', 'tortilla', 'wrap', 'pita', 'baguette', 'roll'],
  Frozen: ['frozen', 'ice cream'],
  Spices: ['salt', 'cumin', 'paprika', 'cinnamon', 'oregano', 'thyme', 'turmeric', 'chili', 'curry', 'spice', 'nutmeg', 'coriander'],
  Pantry: ['rice', 'pasta', 'flour', 'sugar', 'oil', 'vinegar', 'sauce', 'stock', 'broth', 'beans', 'lentil', 'chickpea', 'noodle', 'oats', 'honey', 'canned', 'coconut milk', 'soy'],
}

export function guessCategory(name: string): string {
  const n = name.toLowerCase()
  // longest keyword match wins ("coconut milk" -> Pantry, not Dairy)
  let best: { cat: string; len: number } | null = null
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    for (const w of words) {
      if (n.includes(w) && (!best || w.length > best.len)) best = { cat, len: w.length }
    }
  }
  return best?.cat ?? 'Other'
}

type Family = 'mass' | 'volume' | 'count' | 'other'
const UNITS: Record<string, { family: Exclude<Family, 'other'>; factor: number }> = {
  g: { family: 'mass', factor: 1 }, gram: { family: 'mass', factor: 1 }, grams: { family: 'mass', factor: 1 },
  kg: { family: 'mass', factor: 1000 },
  ml: { family: 'volume', factor: 1 },
  l: { family: 'volume', factor: 1000 }, liter: { family: 'volume', factor: 1000 }, litre: { family: 'volume', factor: 1000 },
  tsp: { family: 'volume', factor: 5 }, teaspoon: { family: 'volume', factor: 5 },
  tbsp: { family: 'volume', factor: 15 }, tablespoon: { family: 'volume', factor: 15 },
  cup: { family: 'volume', factor: 240 }, cups: { family: 'volume', factor: 240 },
  '': { family: 'count', factor: 1 }, piece: { family: 'count', factor: 1 }, pieces: { family: 'count', factor: 1 },
  pc: { family: 'count', factor: 1 }, pcs: { family: 'count', factor: 1 },
}

const normName = (s: string) => {
  const n = s.toLowerCase().trim().replace(/\s+/g, ' ')
  if (n.length <= 3) return n
  if (/(oes)$/.test(n)) return n.slice(0, -2) // tomatoes -> tomato
  if (/(ss|us)$/.test(n)) return n
  return n.replace(/s$/, '') // eggs -> egg, olives -> olive
}

export type ShoppingItem = {
  key: string
  name: string
  category: string
  amounts: { family: Family; qty: number | null; unit: string }[]
}

export function formatAmount(family: string, qty: number | null, unit: string): string {
  if (qty == null) return ''
  if (family === 'mass') return qty >= 1000 ? `${round(qty / 1000)} kg` : `${round(qty)} g`
  if (family === 'volume') {
    if (qty >= 1000) return `${round(qty / 1000)} l`
    if (qty >= 240 && qty % 60 === 0) return `${round(qty / 240)} cup${qty / 240 === 1 ? '' : 's'}`
    if (qty >= 15 && qty % 15 === 0) return `${round(qty / 15)} tbsp`
    if (qty >= 5 && qty % 5 === 0 && qty < 15) return `${round(qty / 5)} tsp`
    return `${round(qty)} ml`
  }
  return unit ? `${round(qty)} ${unit}` : `${round(qty)}`
}

const round = (n: number) => Math.round(n * 100) / 100

export function buildShoppingList(
  entries: PlanEntry[],
  dishes: Dish[],
  servingsFor: (entry: PlanEntry, dish: Dish) => number = (_e, d) => d.servings,
): ShoppingItem[] {
  const byId = new Map(dishes.map((d) => [d.id, d]))
  const items = new Map<string, ShoppingItem & { totals: Map<string, { family: Family; qty: number | null; unit: string }> }>()

  for (const e of entries) {
    const dish = e.dish_id ? byId.get(e.dish_id) : undefined
    if (!dish) continue
    const scale = servingsFor(e, dish) / (dish.servings || 1)
    for (const ing of dish.ingredients as Ingredient[]) {
      const key = normName(ing.name)
      if (!key) continue
      const u = UNITS[ing.unit.toLowerCase().trim()]
      const family = (u?.family ?? 'other') as Family
      const qty = ing.quantity == null ? null : ing.quantity * scale * (u?.factor ?? 1)
      const bucket = family === 'other' ? `other:${ing.unit.toLowerCase()}` : family
      let item = items.get(key)
      if (!item) {
        item = { key, name: ing.name.trim(), category: ing.category || guessCategory(ing.name), amounts: [], totals: new Map() }
        items.set(key, item)
      }
      const cur = item.totals.get(bucket)
      if (cur) cur.qty = cur.qty == null || qty == null ? (cur.qty ?? qty) : cur.qty + qty
      else item.totals.set(bucket, { family, qty, unit: family === 'other' ? ing.unit : '' })
    }
  }

  return [...items.values()]
    .map(({ totals, ...rest }) => ({ ...rest, amounts: [...totals.values()] }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function itemLabel(item: ShoppingItem): string {
  const amt = item.amounts
    .map((a) => formatAmount(a.family, a.qty, a.unit))
    .filter(Boolean)
    .join(' + ')
  return amt ? `${item.name} – ${amt}` : item.name
}

export function groupByCategory(items: ShoppingItem[]): { category: string; items: ShoppingItem[] }[] {
  return [...CATEGORIES]
    .map((category) => ({ category, items: items.filter((i) => (CATEGORIES.includes(i.category as never) ? i.category : 'Other') === category) }))
    .filter((g) => g.items.length)
}

/** Plain text for copy/share. Default: one item per line, no headers (Reminders makes one reminder per line). */
export function toExportText(items: ShoppingItem[], have: Set<string>, withHeaders = false): string {
  const remaining = items.filter((i) => !have.has(i.key))
  if (!withHeaders) return remaining.map(itemLabel).join('\n')
  return groupByCategory(remaining)
    .map((g) => `${g.category}\n${g.items.map((i) => `• ${itemLabel(i)}`).join('\n')}`)
    .join('\n\n')
}
