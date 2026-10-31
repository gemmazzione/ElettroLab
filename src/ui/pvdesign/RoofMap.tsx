import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Eraser, MapPin, PenLine, Search, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { moduleCount } from '../../pvdesign/calc';
import { centroidLatLon, panelCorners, roofLayout, toLatLon } from '../../pvdesign/roof';
import { usePvDesign } from '../../pvdesign/store';

/*
 * Mappa satellitare per scegliere la casa e disegnare la pianta del tetto.
 * Foto aeree: Esri World Imagery (servizio pubblico, nessuna chiave). Ricerca indirizzi: Nominatim di OpenStreetMap,
 * una richiesta per ricerca (nessun completamento automatico, come chiede la sua politica d'uso).
 */

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const ATTRIBUTION = 'Foto aeree © Esri, Maxar, Earthstar Geographics e comunità GIS · Ricerca © OpenStreetMap';

interface Place {
  display_name: string;
  lat: string;
  lon: string;
}

export function RoofMap() {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const draft = useRef<[number, number][]>([]);
  const [drawing, setDrawing] = useState(false);
  const [draftN, setDraftN] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = usePvDesign((s) => s.design);
  const update = usePvDesign((s) => s.update);
  /** Ultima disposizione dei moduli disegnata: i moduli si «posano» con un'animazione solo quando cambia. */
  const laidOut = useRef('');
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;

  // Creazione della mappa (una volta).
  useEffect(() => {
    if (!host.current || map.current) return;
    const s = usePvDesign.getState().design;
    const center: [number, number] = s.roof.footprint.length ? centroidLatLon(s.roof.footprint) : s.location.lat !== null ? [s.location.lat, s.location.lon!] : [42.5, 12.5];
    const m = L.map(host.current, { center, zoom: s.roof.footprint.length ? 20 : s.location.lat !== null ? 19 : 6, maxZoom: 21, zoomControl: true });
    L.tileLayer(IMAGERY, { maxZoom: 21, maxNativeZoom: 19, attribution: ATTRIBUTION }).addTo(m);
    L.tileLayer(LABELS, { maxZoom: 21, maxNativeZoom: 19, opacity: 0.8 }).addTo(m);
    layers.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      const p: [number, number] = [e.latlng.lat, e.latlng.lng];
      if (drawingRef.current) {
        draft.current = [...draft.current, p];
        setDraftN(draft.current.length);
      } else {
        usePvDesign.getState().update((x) => ({ ...x, location: { ...x.location, lat: p[0], lon: p[1], zoom: m.getZoom() }, site: { ...x.site, presetId: x.site.presetId === 'custom' ? 'custom' : 'auto' } }));
      }
    });
    map.current = m;
    // Il contenitore può cambiare dimensione con il percorso guidato.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // Disegno di posizione, pianta, falde e moduli.
  useEffect(() => {
    const g = layers.current;
    if (!g) return;
    g.clearLayers();
    if (d.location.lat !== null && d.location.lon !== null && !d.roof.footprint.length) {
      L.circleMarker([d.location.lat, d.location.lon], { radius: 7, color: '#fbbf24', weight: 2, fillOpacity: 0.6 }).addTo(g);
    }
    if (drawing) {
      const pts = draft.current;
      if (pts.length) L.polyline(pts, { color: '#38bdf8', weight: 2, dashArray: '4 4' }).addTo(g);
      for (const p of pts) L.circleMarker(p, { radius: 4, color: '#38bdf8', fillOpacity: 1 }).addTo(g);
      return;
    }
    if (d.roof.footprint.length < 3) return;
    L.polygon(d.roof.footprint, { color: '#fbbf24', weight: 2, fillOpacity: 0.08 }).addTo(g);
    const r = roofLayout(d);
    if (!r) return;
    const origin = centroidLatLon(d.roof.footprint);
    const ll = (p: { x: number; y: number }) => toLatLon(p, origin);
    // Falda scelta (contorno in pianta) e moduli: pieni quelli del progetto, tratteggiati i posti liberi.
    const s = r.slope;
    const flat = d.roof.type === 'piano';
    const cosT = flat ? 1 : Math.cos((s.tilt * Math.PI) / 180);
    const slant = flat ? s.depth : s.depth / cosT;
    const half = (w: number) => w / 2;
    const at = (a: number, bh: number) => ll({ x: s.eave.x + s.along.x * a - s.down.x * bh, y: s.eave.y + s.along.y * a - s.down.y * bh });
    L.polygon([at(-half(s.bottom), 0), at(half(s.bottom), 0), at(half(s.top), slant * cosT), at(-half(s.top), slant * cosT)], { color: '#f59e0b', weight: 1, dashArray: '3 3', fill: false }).addTo(g);
    const used = moduleCount(d);
    const key = [d.roof.footprint.flat().join(','), d.roof.type, d.roof.slope, d.roof.pitch, d.roof.setbackM, d.roof.orientation, d.module.id, d.site.tilt].join('|');
    const animate = laidOut.current !== key;
    laidOut.current = key;
    // Ritardo complessivo limitato: con molti moduli la posa resta sotto il secondo e mezzo.
    const gap = Math.min(45, 1400 / Math.max(1, r.layout.panels.length));
    r.layout.panels.forEach((p, i) => {
      const c = panelCorners(s, r.layout, p, 0, flat).map(ll);
      const poly = L.polygon(
        c,
        i < used
          ? { color: '#1e3a8a', weight: 1, fillColor: '#1d4ed8', fillOpacity: 0.85, className: animate ? 'pv-panel-anim' : '' }
          : { color: '#93c5fd', weight: 1, dashArray: '2 2', fillOpacity: 0, className: animate ? 'pv-panel-anim' : '' },
      ).addTo(g);
      if (animate) {
        const el = poly.getElement() as SVGElement | undefined;
        if (el) el.style.animationDelay = `${Math.round(i * gap)}ms`;
      }
    });
  }, [d, drawing, draftN]);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=it&accept-language=it&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`risposta ${res.status}`);
      const list = (await res.json()) as Place[];
      setResults(list);
      if (!list.length) setError('Nessun risultato: prova con via, numero civico e comune.');
    } catch {
      setError('Ricerca non riuscita (connessione o servizio non disponibile). Puoi spostarti a mano sulla mappa.');
    } finally {
      setSearching(false);
    }
  };

  const choose = (p: Place) => {
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    map.current?.setView([lat, lon], 20);
    update((x) => ({ ...x, location: { lat, lon, address: p.display_name, zoom: 20 }, site: { ...x.site, presetId: x.site.presetId === 'custom' ? 'custom' : 'auto' } }));
    setResults(null);
  };

  const startDrawing = () => {
    draft.current = [];
    setDraftN(0);
    setDrawing(true);
  };
  const finish = () => {
    if (draft.current.length < 3) return;
    const pts = draft.current;
    const c = centroidLatLon(pts);
    update((x) => ({ ...x, roof: { ...x.roof, footprint: pts, slope: -1 }, location: { ...x.location, lat: x.location.lat ?? c[0], lon: x.location.lon ?? c[1] } }));
    setDrawing(false);
  };

  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[0.78125rem] text-slate-100 outline-none focus:border-sky-500"
          placeholder="Indirizzo della casa (via, numero, comune)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={searching} className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-sky-500 disabled:opacity-60">
          <Search size={14} /> Cerca
        </button>
      </form>
      {error && <p className="text-[0.71875rem] text-amber-300">{error}</p>}
      {results && results.length > 0 && (
        <ul className="divide-y divide-slate-800 rounded-md border border-slate-800 bg-slate-950">
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-[0.75rem] text-slate-200 hover:bg-slate-800" onClick={() => choose(r)}>
                <MapPin size={13} className="mt-0.5 shrink-0 text-amber-400" />
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!drawing ? (
          <button
            onClick={startDrawing}
            className={`flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-[0.75rem] font-semibold text-slate-950 transition-colors hover:bg-amber-400 ${d.location.lat !== null && !d.roof.footprint.length ? 'pv-attn' : ''}`}
          >
            <PenLine size={14} /> {d.roof.footprint.length ? 'Ridisegna la pianta' : 'Disegna la pianta del tetto'}
          </button>
        ) : (
          <>
            <button onClick={finish} disabled={draftN < 3} className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
              Chiudi la pianta ({draftN} punti)
            </button>
            <button
              onClick={() => {
                draft.current = draft.current.slice(0, -1);
                setDraftN(draft.current.length);
              }}
              disabled={draftN === 0}
              className="flex items-center gap-1.5 rounded-md bg-slate-700 px-3 py-1.5 text-[0.75rem] text-white hover:bg-slate-600 disabled:opacity-50"
            >
              <Undo2 size={14} /> Togli l'ultimo punto
            </button>
            <button onClick={() => setDrawing(false)} className="rounded-md px-3 py-1.5 text-[0.75rem] text-slate-300 hover:bg-slate-800">
              Annulla
            </button>
          </>
        )}
        {!drawing && d.roof.footprint.length > 0 && (
          <button onClick={() => update((x) => ({ ...x, roof: { ...x.roof, footprint: [] } }))} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.75rem] text-slate-300 hover:bg-slate-800">
            <Eraser size={14} /> Cancella la pianta
          </button>
        )}
        {d.location.lat !== null && (
          <button onClick={() => map.current?.setView([d.location.lat!, d.location.lon!], 20)} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.75rem] text-slate-300 hover:bg-slate-800">
            <Crosshair size={14} /> Centra sulla casa
          </button>
        )}
      </div>
      <p className="text-[0.71875rem] leading-snug text-slate-400">
        {drawing
          ? 'Clicca sugli angoli del tetto uno dopo l\'altro, seguendo il bordo della gronda; poi «Chiudi la pianta». Per i tetti a falde basta il contorno esterno.'
          : d.roof.footprint.length
            ? 'In blu i moduli del progetto, tratteggiati i posti ancora liberi sulla falda scelta.'
            : 'Cerca l\'indirizzo o spostati sulla mappa, avvicinati alla casa e disegna la pianta del tetto. Un clic sulla mappa segna la posizione della casa.'}
      </p>
      {/* Leaflet aggiunge le sue classi al contenitore: lo stile che cambia sta sull'involucro esterno. */}
      <div className={`isolate h-[27.5rem] w-full overflow-hidden rounded-lg border ${drawing ? 'border-sky-500 [&_.leaflet-container]:cursor-crosshair' : 'border-slate-800'}`}>
        <div ref={host} className="h-full w-full" />
      </div>
    </div>
  );
}
