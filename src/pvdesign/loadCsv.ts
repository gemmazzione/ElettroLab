// Lettura delle curve di carico scaricate dal portale del distributore (e-distribuzione, Areti, Unareti...).
// I formati cambiano da un distributore all'altro, quindi la lettura è tollerante: per ogni riga cerca una data
// e poi o una serie di valori (24 orari, 48 semiorari, 96 quartorari) o un orario seguito da un valore.

import { MONTH_DAYS, MONTH_LOAD_WEIGHTS } from './data';

export interface MeasuredLoad {
  /** Potenza media [kW] per mese e ora del giorno (12×24) */
  measured: number[][];
  /** Consumo annuo stimato [kWh] */
  annualKWh: number;
  /** Giorni letti dal file */
  days: number;
  /** Mesi con dati (gli altri sono ricavati dai mesi presenti) */
  months: number;
}

const DATE = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})|(\d{4})-(\d{1,2})-(\d{1,2})/;
const TIME = /^(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?$/;

function parseNum(s: string): number | null {
  const t = s.trim().replace(/^"|"$/g, '');
  if (!/^-?[\d.,]+$/.test(t)) return null;
  // 1.234,56 → 1234.56 · 0,123 → 0.123 · 0.123 resta com'è
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const v = Number(norm);
  return Number.isFinite(v) ? v : null;
}

function splitLine(line: string): string[] {
  if (line.includes(';')) return line.split(';');
  if (line.includes('\t')) return line.split('\t');
  return line.split(',');
}

/** Legge il file; restituisce null se non trova almeno una settimana di dati. */
export function parseLoadCsv(text: string): MeasuredLoad | null {
  const lines = text.split(/\r?\n/);
  const header = lines.slice(0, 5).join(' ').toLowerCase();
  // Valori in kW (potenza media del quarto d'ora) invece che in kWh: si riconosce solo dall'intestazione.
  const powerUnit = /\bkw\b/.test(header) && !/kwh/.test(header);
  const energy = Array.from({ length: 12 }, () => new Array<number>(24).fill(0));
  const dayKeys = new Set<string>();
  const long: { key: string; m: number; min: number; v: number }[] = [];

  for (const line of lines) {
    const dm = DATE.exec(line);
    if (!dm) continue;
    const day = dm[1] ? Number(dm[1]) : Number(dm[6]);
    const month = (dm[2] ? Number(dm[2]) : Number(dm[5])) - 1;
    const year = dm[3] ? Number(dm[3]) : Number(dm[4]);
    if (month < 0 || month > 11 || day < 1 || day > 31) continue;
    const key = `${year}-${month}-${day}`;
    const cells = splitLine(line.slice(dm.index + dm[0].length)).map((c) => c.trim().replace(/^"|"$/g, ''));
    const time = cells.find((c) => TIME.test(c));
    const values = cells.filter((c) => !TIME.test(c)).map(parseNum).filter((v): v is number => v !== null);
    if (values.length >= 23 && !time) {
      // Formato largo: una riga per giorno. 23/25, 46/50, 92/100 valori nei giorni del cambio d'ora.
      const n = values.length;
      const perHour = n >= 92 ? 4 : n >= 46 ? 2 : 1;
      const slot = perHour === 4 ? 0.25 : perHour === 2 ? 0.5 : 1;
      values.forEach((v, i) => {
        const h = Math.min(23, Math.floor(i / perHour));
        energy[month]![h]! += powerUnit ? v * slot : v;
      });
      dayKeys.add(key);
    } else if (time && values.length >= 1) {
      const t = TIME.exec(time)!;
      long.push({ key, m: month, min: Number(t[1]) * 60 + Number(t[2]), v: values[values.length - 1]! });
    }
  }

  if (long.length) {
    // Formato lungo: data, ora, valore. L'ora può indicare l'inizio (00:00) o la fine (00:15) dell'intervallo.
    const mins = [...new Set(long.map((r) => r.min))].sort((a, b) => a - b);
    const step = mins.length > 1 ? Math.max(1, Math.min(...mins.slice(1).map((v, i) => v - mins[i]!))) : 60;
    const endLabel = !mins.includes(0);
    for (const r of long) {
      const start = endLabel ? r.min - step : r.min;
      const h = Math.min(23, Math.max(0, Math.floor((((start % 1440) + 1440) % 1440) / 60)));
      energy[r.m]![h]! += powerUnit ? (r.v * step) / 60 : r.v;
      dayKeys.add(r.key);
    }
  }

  const daysPerMonth = new Array<number>(12).fill(0);
  for (const k of dayKeys) daysPerMonth[Number(k.split('-')[1])]! += 1;
  const days = dayKeys.size;
  if (days < 7) return null;

  const measured: (number[] | null)[] = energy.map((row, m) => (daysPerMonth[m]! ? row.map((e) => e / daysPerMonth[m]!) : null));
  const have = measured.map((r, m) => (r ? m : -1)).filter((m) => m >= 0);
  // Mesi mancanti: forma media dei mesi presenti, scalata con l'andamento tipico dei consumi nell'anno.
  const avg = new Array<number>(24).fill(0).map((_, h) => have.reduce((s, m) => s + measured[m]![h]! / MONTH_LOAD_WEIGHTS[m]!, 0) / have.length);
  const full = measured.map((r, m) => r ?? avg.map((v) => v * MONTH_LOAD_WEIGHTS[m]!));
  const rounded = full.map((r) => r.map((v) => Math.round(v * 1000) / 1000));
  const annualKWh = Math.round(full.reduce((s, r, m) => s + r.reduce((a, b) => a + b, 0) * MONTH_DAYS[m]!, 0));
  return { measured: rounded, annualKWh, days, months: have.length };
}
