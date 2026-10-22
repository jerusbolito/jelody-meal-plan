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

/** First day of the week containing the date (startDay: 0 = Monday ... 6 = Sunday) */
export const weekStart = (s: string, startDay = 0) => {
  const d = parse(s)
  const wd = ((d.getDay() + 6) % 7 - startDay + 7) % 7
  return addDays(s, -wd)
}

/** 0 = Monday ... 6 = Sunday */
export const weekdayIndex = (s: string) => (parse(s).getDay() + 6) % 7

export const today = () => iso(new Date())
