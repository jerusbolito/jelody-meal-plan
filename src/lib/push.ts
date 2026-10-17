import { supabase } from './supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const pushConfigured = () => !!VAPID
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
/** iOS only allows push for apps added to the Home Screen */
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

const toKey = (b64: string) => {
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}
const b64 = (buf: ArrayBuffer | null) => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '')

export async function currentSubscription() {
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export type PushPrefs = { meal_enabled: boolean; meal_time: string; shop_enabled: boolean }

export async function enablePush(householdId: string) {
  if (!VAPID) throw new Error('Push is not configured (missing VITE_VAPID_PUBLIC_KEY)')
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked. Allow them in your phone or browser settings.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID) }))
  const { error } = await supabase.from('push_subscriptions').upsert({
    household_id: householdId,
    endpoint: sub.endpoint,
    p256dh: b64(sub.getKey('p256dh')),
    auth: b64(sub.getKey('auth')),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }, { onConflict: 'endpoint' })
  if (error) throw error
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function loadPrefs(): Promise<PushPrefs | null> {
  const sub = await currentSubscription()
  if (!sub) return null
  const { data } = await supabase.from('push_subscriptions').select('meal_enabled,meal_time,shop_enabled').eq('endpoint', sub.endpoint).maybeSingle()
  return data ? { ...data, meal_time: String(data.meal_time).slice(0, 5) } : null
}

export async function savePrefs(p: Partial<PushPrefs>) {
  const sub = await currentSubscription()
  if (!sub) return
  // keep the time zone current (travel, DST changes)
  await supabase.from('push_subscriptions').update({ ...p, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }).eq('endpoint', sub.endpoint)
}

export async function sendTest() {
  const { error } = await supabase.functions.invoke('notify', { body: { action: 'test' } })
  if (error) throw error
}
