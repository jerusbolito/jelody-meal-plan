import type { ButtonHTMLAttributes, InputHTMLAttributes } from 'react'

export const Button = ({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) => (
  <button
    {...p}
    className={`min-h-11 rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
      variant === 'primary' ? 'bg-green-600 text-white shadow-sm' : variant === 'danger' ? 'bg-red-50 text-red-700' : 'bg-slate-200/70 text-slate-800'
    } ${className}`}
  />
)

export const Input = ({ className = '', ...p }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={`min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base ${className}`} />
)

export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block space-y-1">
    <span className="text-sm font-medium text-slate-600">{label}</span>
    {children}
  </label>
)

export const H1 = ({ children }: { children: React.ReactNode }) => <h1 className="mb-3 text-2xl font-bold tracking-tight">{children}</h1>

export const Card = ({ className = '', ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div {...p} className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`} />
)

export const Spinner = () => (
  <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
    <div className="size-8 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
  </div>
)

export const Empty = ({ icon, children }: { icon: string; children: React.ReactNode }) => (
  <div className="flex flex-col items-center gap-2 py-10 text-center text-slate-500">
    <span className="text-4xl">{icon}</span>
    <div>{children}</div>
  </div>
)

export const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
