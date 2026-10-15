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
import Shopping from './routes/Shopping'
import Settings from './routes/Settings'
import { Spinner } from './components/ui'

const tabs = [
  ['/', 'Today', '🏠'],
  ['/plan', 'Plan', '📅'],
  ['/dishes', 'Dishes', '🍲'],
  ['/shop', 'Shop', '🛒'],
  ['/settings', 'Settings', '⚙️'],
] as const

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
      <main className="flex-1 p-4 pb-28">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/plan" element={<Planner householdId={hh.data.id} />} />
          <Route path="/dishes" element={<Dishes householdId={hh.data.id} />} />
          <Route path="/dishes/:id" element={<DishEdit householdId={hh.data.id} />} />
          <Route path="/shop" element={<Shopping householdId={hh.data.id} />} />
          <Route path="/settings" element={<Settings household={hh.data} />} />
        </Routes>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto flex max-w-xl">
          {tabs.map(([to, label, icon]) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'font-semibold text-green-700' : 'text-slate-500'}`
                }
              >
                <span className="text-xl leading-none" aria-hidden>{icon}</span>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
