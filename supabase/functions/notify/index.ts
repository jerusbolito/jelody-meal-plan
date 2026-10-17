// Supabase Edge Function (Deno): sends Web Push reminders.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), CRON_SECRET
// Called every 15 minutes by pg_cron (header x-cron-secret), or by a signed-in user with {"action":"test"}.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)

type Sub = {
  id: string; household_id: string; endpoint: string; p256dh: string; auth: string; tz: string
  meal_enabled: boolean; meal_time: string; shop_enabled: boolean; last_meal_on: string | null; last_shop_on: string | null
}
type Payload = { title: string; body: string; url: string; tag: string }

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
function localNow(tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  )
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), wd: WD.indexOf(p.weekday) }
}
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

async function mealsOn(household: string, date: string): Promise<string[]> {
  const { data } = await admin.from('plan_entries').select('slot, dishes(name), meal_plans!inner(household_id)')
    .eq('date', date).eq('meal_plans.household_id', household)
  const order = ['breakfast', 'lunch', 'dinner']
  return (data ?? []).filter((e: any) => e.dishes?.name)
    .sort((a: any, b: any) => order.indexOf(a.slot) - order.indexOf(b.slot))
    .map((e: any) => `${e.slot[0].toUpperCase()}${e.slot.slice(1)}: ${e.dishes.name}`)
}

async function nextWeekState(household: string, nextMon: string) {
  const { count: planned } = await admin.from('plan_entries').select('id, meal_plans!inner(household_id)', { count: 'exact', head: true })
    .gte('date', nextMon).lte('date', addDays(nextMon, 6)).eq('meal_plans.household_id', household)
  const { count: touched } = await admin.from('shopping_checks').select('item_key', { count: 'exact', head: true })
    .eq('household_id', household).like('range_key', `${nextMon}_%`)
  return { planned: (planned ?? 0) > 0, touched: (touched ?? 0) > 0 }
}

async function push(sub: Sub, payload: Payload) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600 })
  } catch (e: any) {
    if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('push_subscriptions').delete().eq('id', sub.id) // device unsubscribed
    else console.error('push failed', e?.statusCode, e?.body)
  }
}

async function runReminders() {
  const { data: subs } = await admin.from('push_subscriptions').select('*')
  const meals = new Map<string, string[]>()
  const weeks = new Map<string, { planned: boolean; touched: boolean }>()
  let sent = 0

  for (const s of (subs ?? []) as Sub[]) {
    const now = localNow(s.tz)
    const patch: Record<string, string> = {}

    // 1) today's meals, from the chosen time until 3 hours later
    const at = toMin(s.meal_time)
    if (s.meal_enabled && s.last_meal_on !== now.date && now.minutes >= at && now.minutes < at + 180) {
      const k = `${s.household_id}|${now.date}`
      if (!meals.has(k)) meals.set(k, await mealsOn(s.household_id, now.date))
      const list = meals.get(k)!
      if (list.length) { await push(s, { title: "Today's meals", body: list.join(' · '), url: '/', tag: 'meals' }); sent++ }
      patch.last_meal_on = now.date
    }

    // 2) Friday and Saturday evening: is next week planned and shopped for?
    if (s.shop_enabled && (now.wd === 4 || now.wd === 5) && s.last_shop_on !== now.date && now.minutes >= 17 * 60 && now.minutes < 21 * 60) {
      const nextMon = addDays(now.date, 7 - now.wd)
      const k = `${s.household_id}|${nextMon}`
      if (!weeks.has(k)) weeks.set(k, await nextWeekState(s.household_id, nextMon))
      const w = weeks.get(k)!
      if (!w.planned) { await push(s, { title: 'Plan next week', body: 'There are no meals planned for next week yet.', url: '/plan', tag: 'weekly' }); sent++ }
      else if (!w.touched) { await push(s, { title: 'Next week’s shopping', body: 'Next week is planned. Check your shopping list before you go.', url: '/shop', tag: 'weekly' }); sent++ }
      patch.last_shop_on = now.date
    }

    if (Object.keys(patch).length) await admin.from('push_subscriptions').update(patch).eq('id', s.id)
  }
  return { checked: subs?.length ?? 0, sent }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const secret = req.headers.get('x-cron-secret')
    if (secret) {
      if (secret !== Deno.env.get('CRON_SECRET')) return json({ error: 'forbidden' }, 403)
      return json(await runReminders())
    }
    // signed-in user: send a test to their own devices
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: user } = await supa.auth.getUser()
    if (!user.user) return json({ error: 'unauthorized' }, 401)
    const body = await req.json().catch(() => ({}))
    if (body.action !== 'test') return json({ error: 'unknown action' }, 400)
    const { data: subs } = await supa.from('push_subscriptions').select('*') // RLS: own devices only
    for (const s of (subs ?? []) as Sub[]) await push(s, { title: 'Meal Planner', body: 'Notifications are working 🎉', url: '/', tag: 'test' })
    return json({ sent: subs?.length ?? 0 })
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
