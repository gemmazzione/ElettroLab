import { api } from '../cloud/api';
import { MONTH_DAYS } from './data';

/*
 * Dati meteo del sito ora per ora: anno tipo (TMY) di PVGIS, Commissione europea – JRC.
 * Ogni mese dell'anno tipo è un mese reale scelto tra gli anni disponibili: contiene giornate serene e nuvolose,
 * per questo l'autoconsumo e il contributo della batteria risultano più realistici del giorno medio.
 * Orari in UTC; i valori orari si riferiscono all'ora che inizia al tempo indicato.
 */

export interface Weather {
  source: string;
  /** Anni da cui sono presi i mesi dell'anno tipo */
  period: string;
  lat: number;
  lon: number;
  /** Irraggiamento globale orizzontale [W/m²], 8760 valori */
  g: number[];
  /** Irraggiamento diretto normale (DNI) [W/m²] */
  b: number[];
  /** Irraggiamento diffuso orizzontale [W/m²] */
  d: number[];
  /** Temperatura dell'aria a 2 m [°C] */
  t: number[];
  /** Profilo dell'orizzonte: [azimut (0 = sud, +90 = ovest), altezza in gradi] */
  horizon: [number, number][] | null;
}

export function isWeather(x: unknown): x is Weather {
  const w = x as Weather | null;
  return !!w && Array.isArray(w.g) && w.g.length >= 8760 && Array.isArray(w.b) && Array.isArray(w.d) && Array.isArray(w.t);
}

/** Valori mensili per la parte del progetto che li usa (clima, verifiche di stringa, mappa delle ombre). */
export function weatherSummary(w: Weather): { hDay: number[]; tMean: number[]; tMin: number; tMax: number } {
  const hDay: number[] = [];
  const tMean: number[] = [];
  let i = 0;
  for (let m = 0; m < 12; m++) {
    const n = (MONTH_DAYS[m] ?? 30) * 24;
    let gs = 0;
    let ts = 0;
    for (let k = 0; k < n; k++, i++) {
      gs += w.g[i] ?? 0;
      ts += w.t[i] ?? 0;
    }
    hDay.push(Math.round((gs / 1000 / (n / 24)) * 100) / 100);
    tMean.push(Math.round((ts / n) * 10) / 10);
  }
  const sorted = [...w.t].sort((a, b) => a - b);
  // Temperature di progetto: valori quasi estremi dell'anno tipo, con margine (anni particolari possono essere più freddi o caldi).
  const tMin = Math.floor((sorted[Math.floor(sorted.length * 0.002)] ?? 0) - 3);
  const tMax = Math.ceil((sorted[Math.floor(sorted.length * 0.998)] ?? 30) + 2);
  return { hDay, tMean, tMin, tMax };
}

/** Altezza dell'orizzonte nella direzione indicata (azimut 0 = sud, +90 = ovest) [°]. */
export function horizonElevation(w: Weather, azimuth: number): number {
  const h = w.horizon;
  if (!h || h.length < 2) return 0;
  const a = ((((azimuth + 180) % 360) + 360) % 360) - 180;
  for (let i = 0; i < h.length - 1; i++) {
    const [a0, h0] = h[i]!;
    const [a1, h1] = h[i + 1]!;
    if (a >= a0 && a <= a1) return h0 + ((h1 - h0) * (a - a0)) / Math.max(1e-9, a1 - a0);
  }
  return h[h.length - 1]![1];
}

const CACHE = 'electrolab.pvgis';

/** Scarica l'anno tipo del sito dal server (che interroga PVGIS); copia locale per non ripetere la richiesta. */
export async function fetchWeather(lat: number, lon: number): Promise<Weather> {
  const key = `${CACHE}:${lat.toFixed(2)}:${lon.toFixed(2)}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const w = JSON.parse(raw) as unknown;
      if (isWeather(w)) return w;
    }
  } catch {
    /* memoria locale non disponibile */
  }
  const r = await api.pvgis(lat, lon);
  if (!isWeather(r.weather)) throw new Error('Dati PVGIS incompleti.');
  const w: Weather = { ...r.weather, horizon: r.weather.horizon ?? null };
  try {
    // Si tiene solo l'ultimo sito: i dati orari occupano circa 100 kB.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${CACHE}:`)) localStorage.removeItem(k);
    }
    localStorage.setItem(key, JSON.stringify(w));
  } catch {
    /* memoria piena: si continua senza copia locale */
  }
  return w;
}
