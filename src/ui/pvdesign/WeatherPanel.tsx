import { CloudSun, ExternalLink, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { f } from '../../pvdesign/calc';
import { usePvDesign } from '../../pvdesign/store';
import { fetchWeather, isWeather } from '../../pvdesign/weather';

/**
 * Dati meteo reali del sito da PVGIS: si scaricano da soli quando la casa è sulla mappa.
 * Se il servizio non risponde resta la stima dalla latitudine, con un messaggio chiaro.
 */
export function WeatherPanel() {
  const loc = usePvDesign((x) => x.design.location);
  const w = usePvDesign((x) => x.design.site.weather);
  const update = usePvDesign((x) => x.update);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const tried = useRef('');
  const has = isWeather(w);

  const load = async () => {
    if (loc.lat === null || loc.lon === null) return;
    setState('loading');
    try {
      const weather = await fetchWeather(loc.lat, loc.lon);
      update((d) => ({ ...d, site: { ...d.site, weather } }));
      setState('idle');
    } catch (e) {
      setError((e as Error).message);
      setState('error');
    }
  };
  // Primo ingresso con la casa scelta e senza dati: si scaricano in automatico (una volta per posizione).
  useEffect(() => {
    const key = `${loc.lat},${loc.lon}`;
    if (loc.lat === null || has || tried.current === key) return;
    tried.current = key;
    void load();
  }, [loc.lat, loc.lon, has]);

  if (loc.lat === null) {
    return <p className="rounded-lg bg-slate-950/60 px-3 py-2.5 text-[0.75rem] text-slate-400">Scegli la casa sulla mappa (passo 1) per usare i dati meteo reali del sito.</p>;
  }
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-[0.78125rem] ${has ? 'bg-emerald-500/[0.08] text-emerald-50' : state === 'error' ? 'bg-amber-500/[0.09] text-amber-100' : 'bg-slate-950/60 text-slate-300'}`}>
      <div className="flex min-w-0 items-start gap-2.5">
        <CloudSun size={18} className={`mt-0.5 shrink-0 ${has ? 'text-emerald-300' : 'text-slate-400'}`} />
        <div className="min-w-0 leading-snug">
          {has && w ? (
            <>
              <b>Dati meteo reali del sito</b>: {w.source}, mesi dal {w.period}, con l'orizzonte (colline e montagne). Il calcolo è ora per ora, con giornate serene e nuvolose.
              <span className="block text-[0.6875rem] text-emerald-200/70">
                {f(w.lat, 2)}, {f(w.lon, 2)} ·{' '}
                <a href="https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2">
                  PVGIS, Commissione europea <ExternalLink size={10} />
                </a>
              </span>
            </>
          ) : state === 'loading' ? (
            'Scarico i dati meteo reali del sito da PVGIS…'
          ) : state === 'error' ? (
            <>
              <b>Dati PVGIS non disponibili</b> ({error}). Uso la stima dalla latitudine: va bene come ordine di grandezza.
            </>
          ) : (
            'Stima dalla latitudine. Puoi scaricare i dati meteo reali del sito.'
          )}
        </div>
      </div>
      {state !== 'loading' && (
        <div className="flex gap-2">
          {has ? (
            <button onClick={() => update((d) => ({ ...d, site: { ...d.site, weather: null, presetId: 'auto' } }))} className="rounded-md px-2.5 py-1 text-[0.71875rem] text-emerald-100/80 hover:bg-emerald-500/15">
              Usa la stima
            </button>
          ) : (
            <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-sky-500">
              <RefreshCw size={13} /> {state === 'error' ? 'Riprova' : 'Scarica da PVGIS'}
            </button>
          )}
        </div>
      )}
      {state === 'loading' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" aria-label="Caricamento" />}
    </div>
  );
}
