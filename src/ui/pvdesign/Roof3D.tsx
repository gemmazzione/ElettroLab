import { Camera, Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { f, moduleCount } from '../../pvdesign/calc';
import { MONTH_REP_DAY, MONTHS } from '../../pvdesign/data';
import type { PvDesign } from '../../pvdesign/design';
import { centroidLatLon, panelCorners, roofLayout, sunPosition, toLocal, type RoofGeometry, type XY, type XYZ } from '../../pvdesign/roof';
import { usePvDesign } from '../../pvdesign/store';

/*
 * Vista 3D della casa con i moduli. Coordinate locali: x verso est, y verso nord, z in alto (metri);
 * in three.js: X = x, Y = z, Z = −y.
 * La casa è ricostruita dalla pianta disegnata (i tetti a falde sul rettangolo che la contiene): è un modello
 * semplificato, senza camini, abbaini, alberi o edifici vicini, quindi le ombre mostrate sono solo quelle della casa.
 */

const V = (p: XYZ) => new THREE.Vector3(p.x, p.z, -p.y);

/** Facce del tetto e chiusure dei timpani come poligoni convessi nello spazio. */
function roofFaces(g: RoofGeometry, d: PvDesign): { roof: XYZ[][]; gables: XYZ[][]; top: number } {
  const H = d.roof.heightM;
  const { rect } = g;
  const u: XY = { x: Math.cos(rect.angle), y: Math.sin(rect.angle) };
  const v: XY = { x: -u.y, y: u.x };
  const P = (su: number, sv: number, z: number): XYZ => ({ x: rect.cx + u.x * su * (rect.length / 2) + v.x * sv * (rect.width / 2), y: rect.cy + u.y * su * (rect.length / 2) + v.y * sv * (rect.width / 2), z });
  const along = (k: number, z: number): XYZ => ({ x: rect.cx + u.x * k, y: rect.cy + u.y * k, z });
  const top = H + g.rise;
  switch (d.roof.type) {
    case 'piano':
      return { roof: [g.local.map((p) => ({ ...p, z: H + 0.05 }))], gables: [], top: H };
    case 'due-falde':
      return {
        roof: [
          [P(-1, 1, H), P(1, 1, H), along(rect.length / 2, top), along(-rect.length / 2, top)],
          [P(-1, -1, H), P(1, -1, H), along(rect.length / 2, top), along(-rect.length / 2, top)],
        ],
        gables: [
          [P(-1, -1, H), P(-1, 1, H), along(-rect.length / 2, top)],
          [P(1, -1, H), P(1, 1, H), along(rect.length / 2, top)],
        ],
        top,
      };
    case 'padiglione': {
      const r = Math.max(0, (rect.length - rect.width) / 2);
      return {
        roof: [
          [P(-1, 1, H), P(1, 1, H), along(r, top), along(-r, top)],
          [P(-1, -1, H), P(1, -1, H), along(r, top), along(-r, top)],
          [P(1, -1, H), P(1, 1, H), along(r, top)],
          [P(-1, -1, H), P(-1, 1, H), along(-r, top)],
        ],
        gables: [],
        top,
      };
    }
    case 'falda': {
      // La falda scende verso la direzione scelta: lato basso a quota H, lato opposto a H + rise.
      const k = Math.max(0, Math.min(3, d.roof.slope));
      const corners = [P(-1, -1, 0), P(1, -1, 0), P(1, 1, 0), P(-1, 1, 0)];
      const s = g.slopes[k]!;
      const low = (p: XYZ) => (p.x - rect.cx) * s.down.x + (p.y - rect.cy) * s.down.y > 0;
      const zOf = (p: XYZ) => (low(p) ? H : top);
      const c = corners.map((p) => ({ ...p, z: zOf(p) }));
      const gables: XYZ[][] = [];
      for (let i = 0; i < 4; i++) {
        const a = c[i]!;
        const b = c[(i + 1) % 4]!;
        const ah = a.z > H;
        const bh = b.z > H;
        if (ah && bh) gables.push([{ ...a, z: H }, { ...b, z: H }, b, a]);
        else if (ah) gables.push([{ ...a, z: H }, { ...b, z: H }, a]);
        else if (bh) gables.push([{ ...a, z: H }, { ...b, z: H }, b]);
      }
      return { roof: [c], gables, top };
    }
  }
}

function polyGeometry(polys: XYZ[][]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const poly of polys) {
    for (let i = 1; i + 1 < poly.length; i++) {
      for (const p of [poly[0]!, poly[i]!, poly[i + 1]!]) {
        const w = V(p);
        pos.push(w.x, w.y, w.z);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Texture del modulo: celle separate da sottili linee chiare, cornice in alluminio. */
function cellTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c0c6cf';
  g.fillRect(0, 0, 128, 192);
  g.fillStyle = '#16244a';
  g.fillRect(4, 4, 120, 184);
  g.strokeStyle = '#3d5a99';
  g.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    g.beginPath();
    g.moveTo(4 + i * 20, 4);
    g.lineTo(4 + i * 20, 188);
    g.stroke();
  }
  for (let j = 1; j < 10; j++) {
    g.beginPath();
    g.moveTo(4, 4 + j * 18.4);
    g.lineTo(124, 4 + j * 18.4);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function quadGeometry(c: XYZ[], landscape: boolean): THREE.BufferGeometry {
  const p = c.map(V);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([p[0]!, p[1]!, p[2]!, p[0]!, p[2]!, p[3]!].flatMap((v) => [v.x, v.y, v.z]), 3));
  const uv = landscape ? [0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0] : [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ foto satellitare a terra

const TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';

/** Compone le tessere satellitari attorno alla casa in una texture, con l'estensione in metri locali. */
async function satelliteGround(center: [number, number], halfM: number): Promise<{ tex: THREE.Texture; x0: number; x1: number; y0: number; y1: number } | null> {
  const z = 19;
  const n = 2 ** z;
  const tx = (lon: number) => ((lon + 180) / 360) * n;
  const ty = (lat: number) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  const lon = (x: number) => (x / n) * 360 - 180;
  const lat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const dLat = halfM / 110_540;
  const dLon = halfM / (111_320 * Math.cos((center[0] * Math.PI) / 180));
  const xa = Math.floor(tx(center[1] - dLon));
  const xb = Math.floor(tx(center[1] + dLon));
  const ya = Math.floor(ty(center[0] + dLat));
  const yb = Math.floor(ty(center[0] - dLat));
  const cols = xb - xa + 1;
  const rows = yb - ya + 1;
  if (cols * rows > 25) return null;
  const canvas = document.createElement('canvas');
  canvas.width = cols * 256;
  canvas.height = rows * 256;
  const g = canvas.getContext('2d')!;
  const jobs: Promise<void>[] = [];
  for (let x = xa; x <= xb; x++) {
    for (let y = ya; y <= yb; y++) {
      jobs.push(
        new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            g.drawImage(img, (x - xa) * 256, (y - ya) * 256);
            resolve();
          };
          img.onerror = () => reject(new Error('tessera non disponibile'));
          img.src = `${TILE}/${z}/${y}/${x}`;
        }),
      );
    }
  }
  await Promise.all(jobs);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const nw = toLocal([[lat(ya), lon(xa)]], center)[0]!;
  const se = toLocal([[lat(yb + 1), lon(xb + 1)]], center)[0]!;
  return { tex, x0: nw.x, x1: se.x, y0: se.y, y1: nw.y };
}

// ------------------------------------------------------------------ componente

export function Roof3D() {
  const host = useRef<HTMLDivElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    sun: THREE.DirectionalLight;
    hemi: THREE.HemisphereLight;
    model: THREE.Group;
    ground: THREE.Mesh;
    render: () => void;
  } | null>(null);
  const d = usePvDesign((s) => s.design);
  const setSnapshot = usePvDesign((s) => s.setSnapshot);
  const snapshot = usePvDesign((s) => s.snapshot);
  const [month, setMonth] = useState(5);
  const [hour, setHour] = useState(10);
  const [playing, setPlaying] = useState(false);
  const [shaded, setShaded] = useState<{ n: number; total: number } | null>(null);
  const r = useMemo(() => roofLayout(d), [d]);
  /** Pianta per cui è stata impostata l'inquadratura (si reimposta solo quando cambia la casa). */
  const framed = useRef('');
  const sun = sunPosition(d.site.latitude, MONTH_REP_DAY[month] ?? 172, hour);

  // Inizializzazione della scena.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#9cc3e6');
    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
    camera.position.set(-22, 18, 26);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 8;
    controls.maxDistance = 120;
    const hemi = new THREE.HemisphereLight('#dbeafe', '#6b7c4b', 0.9);
    scene.add(hemi);
    const sunLight = new THREE.DirectionalLight('#fff7e0', 2.4);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    const sc = sunLight.shadow.camera;
    sc.left = -35;
    sc.right = 35;
    sc.top = 35;
    sc.bottom = -35;
    sc.far = 300;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight, sunLight.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: '#7d8f5a', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    // Prato attorno alla foto satellitare, fino all'orizzonte.
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: '#6f8550', roughness: 1 }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -0.03;
    lawn.receiveShadow = true;
    scene.add(lawn);
    scene.fog = new THREE.Fog('#9cc3e6', 150, 600);
    const model = new THREE.Group();
    scene.add(model);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);
    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    three.current = { renderer, scene, camera, controls, sun: sunLight, hemi, model, ground, render };
    resize();
    return () => {
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      three.current = null;
    };
  }, []);

  // Modello della casa e dei moduli.
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    for (const c of [...t.model.children]) {
      t.model.remove(c);
      if (c instanceof THREE.Mesh) c.geometry.dispose();
    }
    if (!r) {
      t.render();
      return;
    }
    const H = d.roof.heightM;
    const faces = roofFaces(r.geo, d);
    // Pareti: pianta disegnata per il tetto piano, rettangolo per i tetti a falde.
    const base: XY[] =
      d.roof.type === 'piano'
        ? r.geo.local
        : (() => {
            const { rect } = r.geo;
            const u = { x: Math.cos(rect.angle), y: Math.sin(rect.angle) };
            const v = { x: -u.y, y: u.x };
            return [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ].map(([a, b]) => ({ x: rect.cx + u.x * a! * (rect.length / 2) + v.x * b! * (rect.width / 2), y: rect.cy + u.y * a! * (rect.length / 2) + v.y * b! * (rect.width / 2) }));
          })();
    const walls: XYZ[][] = base.map((p, i) => {
      const q = base[(i + 1) % base.length]!;
      return [{ ...p, z: 0 }, { ...q, z: 0 }, { ...q, z: H }, { ...p, z: H }];
    });
    const wallMat = new THREE.MeshStandardMaterial({ color: '#e7dcc8', roughness: 0.9, side: THREE.DoubleSide });
    const roofMat = new THREE.MeshStandardMaterial({ color: d.roof.type === 'piano' ? '#9ca3af' : '#b5532c', roughness: 0.8, side: THREE.DoubleSide });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, cast = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast;
      m.receiveShadow = true;
      t.model.add(m);
      return m;
    };
    add(polyGeometry([...walls, ...faces.gables]), wallMat);
    add(polyGeometry(faces.roof), roofMat);
    const tex = cellTexture();
    const panelMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.25, side: THREE.DoubleSide });
    const flat = d.roof.type === 'piano';
    const n = Math.min(moduleCount(d), r.layout.panels.length);
    const landscape = d.roof.orientation === 'orizzontale';
    const baseZ = flat ? H + 0.05 : H;
    for (let i = 0; i < n; i++) {
      const m = add(quadGeometry(panelCorners(r.slope, r.layout, r.layout.panels[i]!, baseZ, flat), landscape), panelMat);
      m.userData.panel = true;
    }
    // Freccia del nord a terra.
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.4, 3), new THREE.MeshStandardMaterial({ color: '#ef4444' }));
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(0, 0.2, -Math.max(r.geo.rect.length, r.geo.rect.width) / 2 - 6);
    t.model.add(arrow);
    t.controls.target.set(r.geo.rect.cx, (H + faces.top) / 2, -r.geo.rect.cy);
    const key = d.roof.footprint.map((q) => q.join(',')).join(';');
    if (framed.current !== key) {
      // Vista da sud-ovest, dall'alto, a una distanza proporzionata alla casa.
      framed.current = key;
      const dist = Math.max(18, Math.max(r.geo.rect.length, r.geo.rect.width) * 2.4);
      t.camera.position.set(r.geo.rect.cx - dist * 0.55, H + dist * 0.6, -r.geo.rect.cy + dist * 0.8);
    }
    t.controls.update();
    t.render();
  }, [r, d]);

  // Foto satellitare a terra (se le tessere sono disponibili).
  const fpKey = d.roof.footprint.map((p) => p.join(',')).join(';');
  useEffect(() => {
    const t = three.current;
    if (!t || d.roof.footprint.length < 3) return;
    let cancelled = false;
    satelliteGround(centroidLatLon(d.roof.footprint), 40)
      .then((g) => {
        if (cancelled || !g || !three.current) return;
        const mat = t.ground.material as THREE.MeshStandardMaterial;
        mat.map = g.tex;
        mat.color.set('#ffffff');
        mat.needsUpdate = true;
        t.ground.geometry.dispose();
        t.ground.geometry = new THREE.PlaneGeometry(g.x1 - g.x0, g.y1 - g.y0);
        t.ground.position.set((g.x0 + g.x1) / 2, 0, -(g.y0 + g.y1) / 2);
        t.render();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fpKey]);

  // Sole: direzione della luce, luminosità e moduli in ombra.
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const up = sun.elevation > 0;
    const el = (Math.max(0, sun.elevation) * Math.PI) / 180;
    const az = (sun.azimuth * Math.PI) / 180;
    // Verso il sole: azimut da sud, positivo verso ovest.
    const dir: XYZ = { x: -Math.sin(az) * Math.cos(el), y: -Math.cos(az) * Math.cos(el), z: Math.sin(el) };
    const target = t.controls.target.clone();
    t.sun.target.position.copy(target);
    t.sun.position.copy(target.clone().add(V(dir).multiplyScalar(80)));
    t.sun.intensity = up ? 0.6 + 2.2 * Math.sin(el) : 0;
    t.hemi.intensity = up ? 0.55 + 0.5 * Math.sin(el) : 0.25;
    t.scene.background = new THREE.Color(up ? '#9cc3e6' : '#1e293b');
    if (t.scene.fog instanceof THREE.Fog) t.scene.fog.color.set(up ? '#9cc3e6' : '#1e293b');
    // Moduli in ombra: raggio dal centro del modulo verso il sole, intercettato da tetto, pareti o altri moduli.
    const panels = t.model.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && !!c.userData.panel);
    if (up && panels.length) {
      const ray = new THREE.Raycaster();
      const toSun = V(dir).normalize();
      let n = 0;
      for (const p of panels) {
        p.geometry.computeBoundingBox();
        const c = p.geometry.boundingBox!.getCenter(new THREE.Vector3());
        ray.set(c.clone().addScaledVector(toSun, 0.05), toSun);
        const hit = ray.intersectObjects(t.model.children.filter((o) => o !== p && o instanceof THREE.Mesh), false);
        if (hit.length) n++;
      }
      setShaded({ n, total: panels.length });
    } else setShaded(null);
    t.render();
  }, [sun.elevation, sun.azimuth, r, d]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setHour((h) => (h >= 20 ? 5 : Math.round((h + 0.25) * 100) / 100)), 120);
    return () => window.clearInterval(id);
  }, [playing]);

  const hh = Math.floor(hour);
  const mm = Math.round((hour - hh) * 60);
  return (
    <div className="space-y-3">
      <div className="relative isolate h-[420px] w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950" ref={host}>
        {!r && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[12.5px] text-slate-300">Disegna prima la pianta del tetto sulla mappa (passo 2).</div>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[11.5px] text-slate-400">
          Mese: <span className="font-semibold text-slate-100">{MONTHS[month]}</span>
          <input type="range" min={0} max={11} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="mt-1 w-full accent-amber-500" />
        </label>
        <label className="block text-[11.5px] text-slate-400">
          Ora solare:{' '}
          <span className="font-semibold text-slate-100">
            {hh}:{String(mm).padStart(2, '0')}
          </span>
          <input type="range" min={5} max={20} step={0.25} value={hour} onChange={(e) => setHour(Number(e.target.value))} className="mt-1 w-full accent-amber-500" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <button onClick={() => setPlaying((p) => !p)} className="flex items-center gap-1.5 rounded-md bg-slate-700 px-3 py-1.5 font-semibold text-white hover:bg-slate-600">
          {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Ferma' : 'Fai scorrere la giornata'}
        </button>
        <button
          onClick={() => {
            const t = three.current;
            if (!t) return;
            t.render();
            setSnapshot(t.renderer.domElement.toDataURL('image/jpeg', 0.88));
          }}
          disabled={!r}
          className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
        >
          <Camera size={14} /> Usa questa vista nella relazione
        </button>
        {snapshot && <span className="text-emerald-300">Vista salvata per la relazione PDF.</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] sm:grid-cols-4">
        <span className="text-slate-400">Altezza del sole</span>
        <span className="font-mono text-slate-100">{sun.elevation > 0 ? `${f(sun.elevation, 1)}°` : 'sotto l\'orizzonte'}</span>
        <span className="text-slate-400">Azimut del sole</span>
        <span className="font-mono text-slate-100">{f(sun.azimuth)}° (0 = sud)</span>
        <span className="text-slate-400">Moduli in ombra</span>
        <span className="font-mono text-slate-100">{shaded ? `${shaded.n} su ${shaded.total}` : '—'}</span>
      </div>
      <p className="text-[11px] leading-snug text-slate-500">
        Trascina per ruotare, rotella per lo zoom, tasto destro per spostare. Modello semplificato ricostruito dalla pianta: non contiene camini, abbaini, alberi ed edifici vicini, che
        vanno considerati a parte nella perdita per ombreggiamento. Ora solare: a mezzogiorno il sole è a sud (in Italia con l'ora legale circa le 13).
      </p>
    </div>
  );
}
