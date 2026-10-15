import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Field, H1, Input } from '../components/ui'

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [household, setHousehold] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')

  const create = async () => {
    const { error } = await supabase.rpc('create_household', { h_name: household || 'Our household', d_name: name })
    if (error) setErr(error.message)
    else onDone()
  }
  const join = async () => {
    const { error } = await supabase.rpc('join_household', { code: code.trim(), d_name: name })
    if (error) setErr(error.message)
    else onDone()
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 p-6 pt-12">
      <H1>Set up your household</H1>
      <Field label="Your name"><Input autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <section className="space-y-2 rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="font-medium">Start a new household</h2>
        <Input placeholder="Household name" value={household} onChange={(e) => setHousehold(e.target.value)} />
        <Button disabled={!name} onClick={create} className="w-full">Create</Button>
      </section>
      <section className="space-y-2 rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="font-medium">Or join with an invite code</h2>
        <Input placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value)} />
        <Button variant="ghost" disabled={!name || !code} onClick={join} className="w-full">Join</Button>
      </section>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  )
}
