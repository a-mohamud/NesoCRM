/**
 * Neso fork: reads a number typed in either German (1.234,50) or English (1,234.50) style, so money fields work in both
 * UI languages. The last separator is the decimal point unless it is followed by exactly three digits after a non-zero
 * whole part (then it groups thousands: 1.234 / 1,234). Currency signs and spaces are ignored. Returns NaN for no number.
 */
export function parseDecimal(input: unknown): number {
  const s = String(input ?? '').replace(/\s|€|\$|£|'|KSh|KES/gi, '');
  if (!s) return NaN;
  const sep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (sep < 0) return Number(s);
  const whole = s.slice(0, sep).replace(/^[-+]/, '');
  const both = s.includes(',') && s.includes('.');
  const thousands = !both && s.length - sep - 1 === 3 && /[1-9]/.test(whole);
  if (thousands) return Number(s.replace(/[.,]/g, ''));
  return Number(`${s.slice(0, sep).replace(/[.,]/g, '')}.${s.slice(sep + 1)}`);
}
