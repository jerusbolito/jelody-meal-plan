import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, H1, Input } from '../components/ui'

const COOLDOWN = 60

export default function Auth() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(wait - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() })
    if (error) {
      // the allow-list trigger surfaces as a generic database error
      setErr(/database error|not allowed/i.test(error.message) ? 'That email isn’t on the allowed list.' : error.message)
    } else { setSent(true); setWait(COOLDOWN) }
    setBusy(false)
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    if (error) { setErr('That code didn’t work. Check it or request a new one.'); setBusy(false) }
    // on success onAuthStateChange in App swaps this screen out
  }

  return (
    <form onSubmit={sent ? verify : sendCode} className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center space-y-4 p-6">
      <div className="text-center"><div className="text-5xl">🍽️</div><H1>Meal Planner</H1><p className="text-slate-500">Plan the week, shop once.</p></div>
      {sent ? (
        <>
          <p className="rounded-xl bg-green-50 p-4 text-center text-green-800">📬 We emailed a code to <b>{email}</b></p>
          <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus
            inputMode="numeric" autoComplete="one-time-code" placeholder="Enter code" maxLength={10}
            className="text-center text-2xl tracking-widest" />
          <Button disabled={busy || code.length < 6} className="w-full">{busy ? 'Checking…' : 'Verify'}</Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="min-h-11 text-slate-500" onClick={() => { setSent(false); setCode(''); setErr('') }}>Change email</button>
            <button type="button" className="min-h-11 text-green-700 disabled:text-slate-400" disabled={wait > 0 || busy} onClick={() => sendCode()}>
              {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
            </button>
          </div>
        </>
      ) : (
        <>
          <Input type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button disabled={busy} className="w-full">{busy ? 'Sending…' : 'Email me a code'}</Button>
        </>
      )}
      {err && <p className="text-center text-sm text-red-600">{err}</p>}
    </form>
  )
}
