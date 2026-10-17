import { useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'theme'
const listeners = new Set<() => void>()
const media = window.matchMedia('(prefers-color-scheme: dark)')

export const getPref = (): ThemePref => {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system' } catch { return 'system' }
}

export function applyTheme() {
  const pref = getPref()
  const dark = pref === 'dark' || (pref === 'system' && media.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1115' : '#16a34a')
}

export function setPref(p: ThemePref) {
  try { localStorage.setItem(KEY, p) } catch { /* private mode */ }
  applyTheme()
  listeners.forEach((l) => l())
}

media.addEventListener('change', applyTheme)
export const useThemePref = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, getPref)
