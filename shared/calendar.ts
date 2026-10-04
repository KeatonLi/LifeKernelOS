/** Civil dates stay local: never parse YYYY-MM-DD as a UTC timestamp. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1)
    return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return (
    day <=
    [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  );
}

export function localDay(date = new Date()): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function civilDate(day: string): Date {
  // Adjacent display cells can fall just outside the business date range.
  if (!/^\d{4,5}-\d{2}-\d{2}$/.test(day)) throw new Error('日期无效');
  const [year, month, date] = day.split('-').map(Number);
  const result = new Date(year, month - 1, date, 12);
  if (
    year < 1899 ||
    year > 10000 ||
    result.getFullYear() !== year ||
    result.getMonth() !== month - 1 ||
    result.getDate() !== date
  )
    throw new Error('日期无效');
  return result;
}

export function shiftDay(day: string, amount: number): string {
  const date = civilDate(day);
  date.setDate(date.getDate() + amount);
  return localDay(date);
}

export function shiftMonth(day: string, amount: number): string {
  const date = civilDate(day);
  date.setDate(1);
  date.setMonth(date.getMonth() + amount);
  return localDay(date);
}

export function calendarDays(day: string, view: 'month' | 'week'): string[] {
  const date = civilDate(day);
  if (view === 'month') date.setDate(1);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const first = localDay(date);
  return Array.from({ length: view === 'month' ? 42 : 7 }, (_, index) =>
    shiftDay(first, index),
  );
}

export function dayLabel(day: string): string {
  return civilDate(day).toLocaleDateString('zh-CN', {
    year: civilDate(day).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    month: 'long',
    day: 'numeric',
  });
}
