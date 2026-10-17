import { useEffect, useState } from 'react'
import { disablePush, enablePush, isIOS, isInstalled, loadPrefs, pushConfigured, pushSupported, savePrefs, sendTest, type PushPrefs } from '../lib/push'
import { Button } from './ui'

export default function Notifications({ householdId }: { householdId: string }) {
  const [prefs, setPrefs] = useState<PushPrefs | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!pushSupported()) { setLoading(false); return }
    loadPrefs().then(setPrefs).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const run = async (fn: () => Promise<void>, ok = '') => {
    setBusy(true); setMsg('')
    try { await fn(); setMsg(ok) } catch (e) { setMsg(String((e as Error).message ?? e)) } finally { setBusy(false) }
  }
  const update = (p: Partial<PushPrefs>) => { if (prefs) { setPrefs({ ...prefs, ...p }); savePrefs(p) } }

  let body: React.ReactNode
  if (!pushSupported() || (isIOS() && !isInstalled())) {
    body = (
      <p className="text-sm text-slate-500">
        {isIOS() && !isInstalled()
          ? 'On iPhone, notifications only work once the app is on your Home Screen: Safari → Share → Add to Home Screen, then open it from there.'
          : 'This browser doesn’t support push notifications.'}
      </p>
    )
  } else if (!pushConfigured()) {
    body = <p className="text-sm text-slate-500">Push isn’t set up yet (the app is missing its VAPID key). See the README.</p>
  } else if (loading) {
    body = null
  } else if (!prefs) {
    body = <Button className="w-full" disabled={busy} onClick={() => run(async () => { await enablePush(householdId); setPrefs(await loadPrefs()) })}>🔔 Turn on notifications on this device</Button>
  } else {
    body = (
      <div className="space-y-3">
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-white p-3 shadow-sm">
          <span><span className="block font-medium">Today’s meals</span><span className="block text-sm text-slate-500">A reminder of what’s planned</span></span>
          <input type="checkbox" className="tick" checked={prefs.meal_enabled} onChange={(e) => update({ meal_enabled: e.target.checked })} />
        </label>
        {prefs.meal_enabled && (
          <label className="flex items-center justify-between gap-3 px-1 text-sm">
            Send at
            <input type="time" value={prefs.meal_time} onChange={(e) => e.target.value && update({ meal_time: e.target.value })}
              className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-base" />
          </label>
        )}
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-white p-3 shadow-sm">
          <span><span className="block font-medium">Plan &amp; shop for next week</span><span className="block text-sm text-slate-500">Fri and Sat at 5 pm, only if next week isn’t planned or shopped for yet</span></span>
          <input type="checkbox" className="tick" checked={prefs.shop_enabled} onChange={(e) => update({ shop_enabled: e.target.checked })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => run(sendTest, 'Test sent. It should arrive in a few seconds.')}>Send a test</Button>
          <Button variant="danger" disabled={busy} onClick={() => run(async () => { await disablePush(); setPrefs(null) })}>Turn off</Button>
        </div>
      </div>
    )
  }

  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Notifications</h2>
      {body}
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
    </section>
  )
}
