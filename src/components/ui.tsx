import type { ButtonHTMLAttributes, InputHTMLAttributes } from 'react'

export const Button = ({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) => (
  <button
    {...p}
    className={`min-h-11 rounded-2xl px-4 py-2 text-[15px] font-semibold transition active:scale-[.98] disabled:opacity-50 ${
      variant === 'primary' ? 'bg-green-600 text-white shadow-sm shadow-green-600/25' : variant === 'danger' ? 'bg-red-50 text-red-700' : 'border border-slate-200 bg-white text-slate-700 shadow-sm'
    } ${className}`}
  />
)

export const Input = ({ className = '', ...p }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={`min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-base outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-4 focus:ring-green-500/15 ${className}`} />
)

export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block space-y-1">
    <span className="text-[13px] font-semibold text-slate-500">{label}</span>
    {children}
  </label>
)

export const H1 = ({ children }: { children: React.ReactNode }) => <h1 className="mb-4 text-[28px] font-extrabold leading-tight tracking-tight">{children}</h1>

export const Card = ({ className = '', ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div {...p} className={`rounded-3xl border border-slate-100 bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.05)] ${className}`} />
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
