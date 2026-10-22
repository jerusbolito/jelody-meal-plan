export type Ingredient = {
  id?: string
  name: string
  quantity: number | null
  unit: string
  category: string
  note?: string
}

/** Estimated nutrition per serving; null = unknown. */
export type Nutrition = {
  serving_g: number | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
}

export type Dish = Partial<Nutrition> & {
  id: string
  name: string
  cuisine: string
  tags: string[]
  prep_minutes: number
  servings: number
  instructions: string
  notes?: string
  source: 'manual' | 'ai'
  status: 'active' | 'idea' | 'archived'
  ingredients: Ingredient[]
}

export type DishStats = {
  dish_id: string
  affinity: number
  last_cooked_at: string | null
}

export type Preferences = {
  diets: string[]
  allergies: string[]
  dislikes: string[]
  favorite_cuisines: string[]
  weeknight_max_minutes: number
  new_ideas_per_week: number
  notes: string
  week_start_day: number // 0 = Monday ... 6 = Sunday
}

export type PlanEntry = {
  id?: string
  date: string // YYYY-MM-DD
  slot: string
  dish_id: string | null
  locked: boolean
  status?: 'planned' | 'cooked' | 'skipped'
}

/** slots per weekday, 0 = Monday ... 6 = Sunday */
export type SlotTemplate = string[][]
