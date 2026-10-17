import { addDays } from './dates'
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { pendingCount } from './outbox'
import { supabase } from './supabase'
import type { Dish, DishStats, Ingredient, PlanEntry, Preferences, SlotTemplate } from './types'

export async function getHouseholdId(): Promise<string | null> {
  const { data, error } = await supabase.from('household_members').select('household_id').limit(1).maybeSingle()
  if (error) throw error // a failed (e.g. offline) fetch must not look like "no household"
  return data?.household_id ?? null
}

export const useHousehold = () =>
  useQuery({
    queryKey: ['household'],
    queryFn: async () => {
      const id = await getHouseholdId()
      if (!id) return null
      const { data, error } = await supabase.from('households').select('id,name,invite_code').eq('id', id).single()
      if (error) throw error
      return data
    },
  })

/** Refetch queries when another phone changes a table. */
export function useRealtime(householdId: string | undefined) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!householdId) return
    const ch = supabase
      .channel('hh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_entries' }, () => qc.invalidateQueries({ queryKey: ['entries'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes' }, () => qc.invalidateQueries({ queryKey: ['dishes'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dish_ingredients' }, () => qc.invalidateQueries({ queryKey: ['dishes'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_checks' }, () => { if (!pendingCount()) qc.invalidateQueries({ queryKey: ['checks'] }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_extras' }, () => { if (!pendingCount()) qc.invalidateQueries({ queryKey: ['extras'] }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_staples' }, () => { if (!pendingCount()) qc.invalidateQueries({ queryKey: ['staples'] }) })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [householdId, qc])
}

/** The signed-in person's display name (for "added by"). */
export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getSession() // local, works offline
      const { data, error } = await supabase.from('household_members').select('display_name').eq('user_id', u.session?.user.id ?? '').maybeSingle()
      if (error) throw error
      return (data?.display_name as string | null) ?? null
    },
  })

export type Member = { user_id: string; display_name: string | null }
export const useMembers = () =>
  useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const { data, error } = await supabase.from('household_members').select('user_id,display_name').order('display_name')
      if (error) throw error
      const { data: s } = await supabase.auth.getSession()
      return { members: (data ?? []) as Member[], me: s.session?.user.id ?? null }
    },
  })

export const useDishes = () =>
  useQuery({
    queryKey: ['dishes'],
    queryFn: async (): Promise<Dish[]> => {
      const { data, error } = await supabase.from('dishes').select('*, dish_ingredients(*)').order('name')
      if (error) throw error
      return (data ?? []).map(({ dish_ingredients, ...d }) => ({ ...d, ingredients: dish_ingredients ?? [] })) as Dish[]
    },
  })

export const useStats = () =>
  useQuery({
    queryKey: ['stats'],
    queryFn: async (): Promise<Record<string, DishStats>> => {
      const { data, error } = await supabase.from('dish_stats').select('dish_id,affinity,last_cooked_at')
      if (error) throw error
      return Object.fromEntries((data ?? []).map((s) => [s.dish_id, s as DishStats]))
    },
  })

export const usePrefs = () =>
  useQuery({
    queryKey: ['prefs'],
    queryFn: async (): Promise<Preferences> => {
      const { data, error } = await supabase.from('preferences').select('*').single()
      if (error) throw error
      return data as Preferences
    },
  })

export const useTemplate = () =>
  useQuery({
    queryKey: ['template'],
    queryFn: async (): Promise<SlotTemplate> => {
      const { data, error } = await supabase.from('slot_template').select('weekday,slots').order('weekday')
      if (error) throw error
      const t: SlotTemplate = Array.from({ length: 7 }, () => ['dinner'])
      data?.forEach((r) => { t[r.weekday] = r.slots })
      return t
    },
  })

export const useEntries = (from: string, to: string) =>
  useQuery({
    queryKey: ['entries', from, to],
    queryFn: async (): Promise<PlanEntry[]> => {
      const { data, error } = await supabase
        .from('plan_entries')
        .select('id,date,slot,dish_id,locked,status')
        .gte('date', from)
        .lte('date', to)
        .order('date')
      if (error) throw error
      return (data ?? []) as PlanEntry[]
    },
  })

export async function ensurePlan(householdId: string, weekStart: string): Promise<string> {
  const { data, error } = await supabase
    .from('meal_plans')
    .upsert({ household_id: householdId, week_start: weekStart }, { onConflict: 'household_id,week_start' })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/** Replace unlocked entries of a 7-day block (starting on any date) with the generated ones. */
export async function saveWeek(householdId: string, weekStart: string, entries: PlanEntry[]) {
  const planId = await ensurePlan(householdId, weekStart)
  // by date range, not plan id: blocks started on different days can overlap
  await supabase.from('plan_entries').delete().gte('date', weekStart).lte('date', addDays(weekStart, 6)).eq('locked', false)
  const rows = entries.filter((e) => !e.locked && e.dish_id).map((e) => ({ plan_id: planId, date: e.date, slot: e.slot, dish_id: e.dish_id, locked: false }))
  if (rows.length) {
    const { error } = await supabase.from('plan_entries').insert(rows)
    if (error) throw error
  }
}

export async function saveDish(householdId: string, dish: Partial<Dish> & { name: string }, ingredients: Ingredient[]) {
  const { ingredients: _drop, id, ...fields } = dish as Dish
  let dishId = id
  if (dishId) {
    const { error } = await supabase.from('dishes').update(fields).eq('id', dishId)
    if (error) throw error
    await supabase.from('dish_ingredients').delete().eq('dish_id', dishId)
  } else {
    const { data, error } = await supabase.from('dishes').insert({ ...fields, household_id: householdId }).select('id').single()
    if (error) throw error
    dishId = data.id
  }
  const rows = ingredients.filter((i) => i.name.trim()).map(({ id: _i, ...i }) => ({ ...i, dish_id: dishId, quantity: i.quantity ?? null }))
  if (rows.length) {
    const { error } = await supabase.from('dish_ingredients').insert(rows)
    if (error) throw error
  }
  return dishId
}

export async function logEvent(dish_id: string, type: 'cooked' | 'skipped' | 'swapped_out' | 'idea_accepted' | 'idea_rejected') {
  await supabase.from('dish_events').insert({ dish_id, type })
}

export async function callAI<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ai', { body })
  if (error) {
    // functions.invoke hides the response body behind a generic message; surface the server's reason
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(body?.error ?? error.message)
  }
  return data as T
}
