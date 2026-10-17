import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { NavLink, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useHousehold, useRealtime } from './lib/data'
import Auth from './routes/Auth'
import Onboarding from './routes/Onboarding'
import Home from './routes/Home'
import Planner from './routes/Planner'
import Dishes from './routes/Dishes'
import DishEdit from './routes/DishEdit'
import Cook from './routes/Cook'
import Shopping from './routes/Shopping'
import Settings from './routes/Settings'
import Help from './routes/Help'
import { Spinner } from './components/ui'
import { useOnline, usePending } from './lib/outbox'

const icons = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  plan: <><rect x="3" y="4.5" width="18" height="16.5" rx="3" /><path d="M8 2.5v4M16 2.5v4M3 10h18" /></>,
  dishes: <path d="M7 3v7a2 2 0 0 0 2 2v9M5 3v6M9 3v6M17 21V3c-2.2 1.2-4 4-4 8 0 2 1 3 4 3" />,
  shop: <><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L20 8H6.2" /><circle cx="9" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></>,
  settings: <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />,
}
const tabs = [
  ['/', 'Today', 'home'],
  ['/plan', 'Plan', 'plan'],
  ['/dishes', 'Dishes', 'dishes'],
  ['/shop', 'Shop', 'shop'],
  ['/settings', 'Settings', 'settings'],
] as const

function SyncBar() {
  const online = useOnline()
  const pending = usePending()
  if (online && !pending) return null
  return (
    <div role="status" className={`sticky top-0 z-30 -mx-4 -mt-4 mb-3 px-4 py-1.5 text-center text-xs font-medium ${online ? 'bg-blue-50 text-blue-800' : 'bg-amber-100 text-amber-900'}`}>
      {online ? `Syncing ${pending} change${pending === 1 ? '' : 's'}…` : `Offline — changes are saved on this phone${pending ? ` (${pending} waiting)` : ''} and sync when you're back online`}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <Spinner />
  if (!session) return <Auth />
  return <Authed />
}

function Authed() {
  const hh = useHousehold()
  useRealtime(hh.data?.id)
  if (hh.isLoading) return <Spinner />
  if (!hh.data) return <Onboarding onDone={() => hh.refetch()} />

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <main className="flex-1 p-4 pb-[calc(9rem+env(safe-area-inset-bottom))]">
        <SyncBar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/plan" element={<Planner householdId={hh.data.id} />} />
          <Route path="/dishes" element={<Dishes householdId={hh.data.id} />} />
          <Route path="/dishes/:id/cook" element={<Cook />} />
          <Route path="/dishes/:id" element={<DishEdit householdId={hh.data.id} />} />
          <Route path="/shop" element={<Shopping householdId={hh.data.id} />} />
          <Route path="/help" element={<Help />} />
          <Route path="/settings" element={<Settings household={hh.data} />} />
        </Routes>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/70 bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <ul className="mx-auto flex max-w-xl px-2">
          {tabs.map(([to, label, icon]) => (
            <li key={to} className="flex-1">
              <NavLink to={to} end={to === '/'} className="group flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-medium">
                {({ isActive }) => (
                  <>
                    <span className={`flex h-7 w-14 items-center justify-center rounded-full transition ${isActive ? 'bg-green-100 text-green-700' : 'text-slate-400'}`}>
                      <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth={isActive ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{icons[icon]}</svg>
                    </span>
                    <span className={isActive ? 'text-green-700' : 'text-slate-500'}>{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
