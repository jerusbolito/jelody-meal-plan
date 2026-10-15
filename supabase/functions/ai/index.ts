// Supabase Edge Function (Deno). Secrets: DEEPSEEK_API_KEY
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { z } from 'npm:zod@3'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const Ingredient = z.object({
  name: z.string(),
  quantity: z.number().nullable().default(null),
  unit: z.string().default(''),
  category: z.string().default(''),
})
const Nutrition = z.object({
  serving_g: z.number().nullable().default(null),
  calories: z.number().nullable().default(null),
  protein_g: z.number().nullable().default(null),
  carbs_g: z.number().nullable().default(null),
  fat_g: z.number().nullable().default(null),
  fiber_g: z.number().nullable().default(null),
})
const Dish = z.object({
  name: z.string(),
  cuisine: z.string().default(''),
  tags: z.array(z.string()).default([]),
  prep_minutes: z.number().default(30),
  servings: z.number().default(4),
  instructions: z.string().default(''),
  ingredients: z.array(Ingredient),
}).merge(Nutrition)
const Ideas = z.object({ dishes: z.array(Dish) })
const Categories = z.object({ categories: z.record(z.string()) })

const CATS = 'Produce, Meat & Fish, Dairy, Bakery, Pantry, Frozen, Spices, Other'
const NUTRI = `"serving_g":number (grams in one serving),"calories":int,"protein_g":number,"carbs_g":number,"fat_g":number,"fiber_g":number (rough estimates PER SERVING, never null)`
const SHAPE = `Dish JSON: {"name",${NUTRI},"cuisine","tags":[],"prep_minutes":int,"servings":int,"instructions":"short steps","ingredients":[{"name","quantity":number|null,"unit":"g|kg|ml|l|tsp|tbsp|cup|(empty for pieces)","category":"one of: ${CATS}"}]}`

async function deepseek(system: string, user: string) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('DEEPSEEK_API_KEY')}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return JSON.parse(data.choices[0].message.content)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const auth = req.headers.get('Authorization') ?? ''
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    })
    const { data: user } = await supa.auth.getUser()
    if (!user.user) return json({ error: 'unauthorized' }, 401)
    // RLS: a non-member sees no household row
    const { data: member } = await supa.from('household_members').select('household_id').limit(1).maybeSingle()
    if (!member) return json({ error: 'not a household member' }, 403)

    const body = await req.json()

    if (body.action === 'parse_recipe') {
      const out = await deepseek(
        `You convert recipes to structured JSON. Return {"dish": <Dish>}. ${SHAPE}`,
        String(body.text ?? '').slice(0, 8000),
      )
      return json(Dish.parse(out.dish))
    }

    if (body.action === 'suggest_ideas') {
      const n = Math.min(Number(body.count) || 3, 6)
      const out = await deepseek(
        `You suggest new home-cooking dishes a household will like. Return {"dishes":[<Dish>,...]} with exactly ${n} dishes. Never suggest dishes similar to the existing or rejected ones. Respect allergies and dislikes strictly. ${SHAPE}`,
        JSON.stringify(body.profile ?? {}).slice(0, 12000),
      )
      return json(Ideas.parse(out))
    }

    if (body.action === 'estimate_nutrition') {
      const out = await deepseek(
        `You estimate nutrition for a recipe. Return JSON: {"serving_g":number,"calories":int,"protein_g":number,"carbs_g":number,"fat_g":number,"fiber_g":number} as rough estimates, where serving_g is the weight in grams of ONE serving and the rest are PER SERVING, using the ingredient quantities and the number of servings. Ingredients without quantities: assume a typical amount.`,
        JSON.stringify({ name: body.name, servings: body.servings, ingredients: body.ingredients }).slice(0, 8000),
      )
      return json(Nutrition.parse(out))
    }

    if (body.action === 'categorize') {
      const names: string[] = (body.names ?? []).slice(0, 100)
      const out = await deepseek(
        `Assign each grocery item to one category from: ${CATS}. Return JSON: {"categories":{"<item>":"<category>"}}.`,
        JSON.stringify(names),
      )
      return json(Categories.parse(out))
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: String(e) }, 500)
  }
})
