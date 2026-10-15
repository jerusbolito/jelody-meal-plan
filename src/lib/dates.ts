export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (s: string, n: number) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}

/** Monday of the week containing the date */
export const weekStart = (s: string) => {
  const d = parse(s)
  const wd = (d.getDay() + 6) % 7
  return addDays(s, -wd)
}

/** 0 = Monday ... 6 = Sunday */
export const weekdayIndex = (s: string) => (parse(s).getDay() + 6) % 7

export const today = () => iso(new Date())
