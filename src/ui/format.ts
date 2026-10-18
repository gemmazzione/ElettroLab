export function fmt(v: number, digits = 1): string {
  return v.toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtCurrent(a: number): string {
  if (a < 1) return `${fmt(a * 1000, 0)} mA`;
  if (a >= 100) return `${fmt(a, 0)} A`;
  return `${fmt(a, a >= 10 ? 1 : 2)} A`;
}

export function fmtPower(w: number): string {
  return Math.abs(w) >= 1000 ? `${fmt(w / 1000, 2)} kW` : `${fmt(w, 0)} W`;
}

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
}
