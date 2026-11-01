import { Building2, Camera, Compass, Eye, Pause, Play, RotateCw, Trash2, TreeDeciduous, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { f, moduleCount } from '../../pvdesign/calc';
import { MONTH_REP_DAY, MONTHS } from '../../pvdesign/data';
import type { PvDesign } from '../../pvdesign/design';
import { houseGeometry, type HouseGeometry } from '../../pvdesign/house';
import { centroidLatLon, panelCorners, roofLayout, sunPosition, toLocal, type XYZ } from '../../pvdesign/roof';
import { annualShading, OBSTACLE_DEFAULTS, type Obstacle, type ObstacleKind } from '../../pvdesign/shading';
import { usePvDesign } from '../../pvdesign/store';
import { Num } from './kit';

/*
 * Vista 3D della casa con i moduli. Coordinate locali: x verso est, y verso nord, z in alto (metri);
 * in three.js: X = x, Y = z, Z = −y.
 * La casa è ricostruita dalla pianta disegnata (i tetti a falde sul rettangolo che la contiene). Alberi ed edifici
 * vicini si aggiungono a mano: entrano nella mappa delle ombre calcolata su tutto l'anno (shading.ts).
 */

const V = (p: XYZ) => new THREE.Vector3(p.x, p.z, -p.y);
const ease = (t: number) => 1 - Math.pow(1 - t, 4);

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

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Celle del modulo con la cornice in alluminio. */
function cellTexture(landscape: boolean): THREE.CanvasTexture {
  const t = canvasTexture(128, 192, (g) => {
    g.fillStyle = '#c9ced6';
    g.fillRect(0, 0, 128, 192);
    const grad = g.createLinearGradient(0, 0, 128, 192);
    grad.addColorStop(0, '#1d3264');
    grad.addColorStop(1, '#101c3d');
    g.fillStyle = grad;
    g.fillRect(4, 4, 120, 184);
    g.strokeStyle = 'rgba(120,150,210,0.55)';
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
  });
  if (landscape) {
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
  }
  return t;
}

/** Coppi o tegole: file orizzontali leggermente sfumate. */
function tileTexture(): THREE.CanvasTexture {
  const t = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#a8492a';
    g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(0, y + 6, 64, 2);
      for (let x = (y / 8) % 2 ? 0 : 8; x < 64; x += 16) {
        g.fillStyle = 'rgba(255,190,150,0.10)';
        g.fillRect(x, y, 8, 6);
      }
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

function textSprite(text: string, color: string): THREE.Sprite {
  const tex = canvasTexture(64, 64, (g) => {
    g.fillStyle = 'rgba(15,23,42,0.75)';
    g.beginPath();
    g.arc(32, 32, 28, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 32, 34);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(2.2, 2.2, 1);
  return s;
}

/** Colore della mappa delle ombre: verde (nessuna perdita) → giallo (5%) → rosso (15% e oltre). */
function lossColor(loss: number): THREE.Color {
  const t = Math.min(1, loss / 0.15);
  return t < 1 / 3 ? new THREE.Color('#22c55e').lerp(new THREE.Color('#facc15'), t * 3) : new THREE.Color('#facc15').lerp(new THREE.Color('#ef4444'), (t - 1 / 3) * 1.5);
}

/** Cielo: gradiente verticale che si scalda con il sole basso e si spegne di notte. */
function skyColors(el: number): [string, string] {
  if (el <= 0) return ['#0b1424', '#1e293b'];
  if (el < 12) {
    const k = el / 12;
    return [new THREE.Color('#33507f').lerp(new THREE.Color('#4f86c9'), k).getStyle(), new THREE.Color('#f2b27a').lerp(new THREE.Color('#cfe3f5'), k).getStyle()];
  }
  return ['#4f86c9', '#cfe3f5'];
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

// ------------------------------------------------------------------ costruzione del modello

/** Modulo come lastra sottile orientata sui quattro vertici, con cornice. */
function panelMesh(c: XYZ[], top: THREE.Material, side: THREE.Material): THREE.Mesh {
  const p = c.map(V);
  const ax = p[1]!.clone().sub(p[0]!);
  const ay = p[3]!.clone().sub(p[0]!);
  const n = new THREE.Vector3().crossVectors(ax, ay).normalize();
  if (n.y < 0) n.negate();
  const center = p[0]!.clone().add(p[2]!).multiplyScalar(0.5);
  const geo = new THREE.BoxGeometry(ax.length(), ay.length(), 0.045);
  const m = new THREE.Mesh(geo, [side, side, side, side, top, side]);
  const basis = new THREE.Matrix4().makeBasis(ax.clone().normalize(), ay.clone().normalize(), n);
  m.quaternion.setFromRotationMatrix(basis);
  m.position.copy(center).addScaledVector(n, 0.02);
  return m;
}

function buildHouse(group: THREE.Group, h: HouseGeometry, d: PvDesign) {
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const wallMat = new THREE.MeshStandardMaterial({ color: '#ebe0cb', roughness: 0.95, side: THREE.DoubleSide });
  add(polyGeometry([...h.walls, ...h.gables]), wallMat);
  // Zoccolo più scuro alla base delle pareti.
  add(
    polyGeometry(h.base.map((p, i) => {
      const q = h.base[(i + 1) % h.base.length]!;
      return [{ ...p, z: 0 }, { ...q, z: 0 }, { ...q, z: 0.5 }, { ...p, z: 0.5 }];
    })),
    new THREE.MeshStandardMaterial({ color: '#a8a29e', roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }),
    false,
  );
  const flat = d.roof.type === 'piano';
  const roofMat = flat
    ? new THREE.MeshStandardMaterial({ color: '#8b9099', roughness: 0.9, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.8, side: THREE.DoubleSide });
  const roofGeo = polyGeometry(h.roof);
  if (!flat) {
    // Coordinate di tessitura in pianta: le file di coppi seguono la pendenza in modo plausibile.
    const pos = roofGeo.getAttribute('position');
    const uv: number[] = [];
    for (let i = 0; i < pos.count; i++) uv.push(pos.getX(i) / 4, pos.getZ(i) / 4 + pos.getY(i) / 4);
    roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  }
  add(roofGeo, roofMat);
  if (h.parapet.length) add(polyGeometry(h.parapet), new THREE.MeshStandardMaterial({ color: '#d6cdb9', roughness: 0.95, side: THREE.DoubleSide }));
  // Finestre e porta: vetro scuro con telaio chiaro, appena fuori dalla parete.
  const frameMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#2b4a6b', roughness: 0.15, metalness: 0.4 });
  const doorMat = new THREE.MeshStandardMaterial({ color: '#6b4428', roughness: 0.7 });
  for (const o of h.openings) {
    const n3 = new THREE.Vector3(o.normal.x, 0, -o.normal.y);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n3);
    const at = (off: number) => V(o.center).addScaledVector(n3, off);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(o.w + 0.16, o.h + 0.16), frameMat);
    frame.quaternion.copy(q);
    frame.position.copy(at(0.02));
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), o.door ? doorMat : glassMat);
    pane.quaternion.copy(q);
    pane.position.copy(at(0.035));
    group.add(frame, pane);
  }
}

function buildObstacles(group: THREE.Group, obstacles: Obstacle[]) {
  const trunk = new THREE.MeshStandardMaterial({ color: '#6b4f3a', roughness: 1 });
  const crown = new THREE.MeshStandardMaterial({ color: '#3f7a3a', roughness: 0.9, flatShading: true });
  const bld = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.9 });
  const bldRoof = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.9 });
  for (const ob of obstacles) {
    if (ob.kind === 'albero') {
      const r = ob.size / 2;
      const cz = Math.max(r, ob.height - r);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, cz, 8), trunk);
      t.position.set(ob.x, cz / 2, -ob.y);
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), crown);
      c.position.set(ob.x, cz, -ob.y);
      for (const m of [t, c]) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.userData.obstacle = ob.id;
        group.add(m);
      }
    } else {
      const b = new THREE.Mesh(new THREE.BoxGeometry(ob.size, ob.height, ob.depth), [bld, bld, bldRoof, bld, bld, bld]);
      b.position.set(ob.x, ob.height / 2, -ob.y);
      b.castShadow = true;
      b.receiveShadow = true;
      b.userData.obstacle = ob.id;
      group.add(b);
    }
  }
}

// ------------------------------------------------------------------ componente

type ViewPreset = 'sud' | 'est' | 'ovest' | 'alto' | 'tre-quarti';
const VIEW_LABEL: Record<ViewPreset, string> = { 'tre-quarti': 'Prospettiva', sud: 'Da sud', est: 'Da est', ovest: 'Da ovest', alto: "Dall'alto" };

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
    extras: THREE.Group;
    ground: THREE.Mesh;
    lawn: THREE.Mesh;
    render: () => void;
  } | null>(null);
  const d = usePvDesign((s) => s.design);
  const update = usePvDesign((s) => s.update);
  const setSnapshot = usePvDesign((s) => s.setSnapshot);
  const snapshot = usePvDesign((s) => s.snapshot);
  const [month, setMonth] = useState(5);
  const [hour, setHour] = useState(10);
  const [playing, setPlaying] = useState(false);
  const [spin, setSpin] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [placing, setPlacing] = useState<ObstacleKind | null>(null);
  const [shaded, setShaded] = useState<{ n: number; total: number } | null>(null);
  const r = useMemo(() => roofLayout(d), [d]);
  const house = useMemo(() => (r ? houseGeometry(r.geo, d) : null), [r, d]);
  const shading = useMemo(() => annualShading(d), [d]);
  const framed = useRef('');
  const placingRef = useRef(placing);
  placingRef.current = placing;
  const sun = sunPosition(d.site.latitude, MONTH_REP_DAY[month] ?? 172, hour);

  // Inizializzazione della scena.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 2500);
    camera.position.set(-22, 18, 26);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 6;
    controls.maxDistance = 160;
    controls.enableDamping = false;
    controls.autoRotateSpeed = 0.8;
    const hemi = new THREE.HemisphereLight('#dbeafe', '#5c6b40', 0.9);
    scene.add(hemi);
    const sunLight = new THREE.DirectionalLight('#fff7e0', 2.6);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    const sc = sunLight.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.far = 400;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight, sunLight.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: '#7d8f5a', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: '#6f8550', roughness: 1 }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -0.03;
    lawn.receiveShadow = true;
    scene.add(lawn);
    scene.fog = new THREE.Fog('#cfe3f5', 180, 900);
    const model = new THREE.Group();
    const extras = new THREE.Group();
    scene.add(model, extras);
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
    // Posizionamento degli ostacoli: un clic (non un trascinamento) sul terreno.
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      const kind = placingRef.current;
      if (!kind || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects([ground, lawn], false)[0];
      if (!hit) return;
      const ob: Obstacle = { ...OBSTACLE_DEFAULTS[kind], id: `ob${Date.now().toString(36)}`, x: Math.round(hit.point.x * 10) / 10, y: Math.round(-hit.point.z * 10) / 10 };
      usePvDesign.getState().update((x) => ({ ...x, obstacles: [...x.obstacles, ob] }));
      setPlacing(null);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    three.current = { renderer, scene, camera, controls, sun: sunLight, hemi, model, extras, ground, lawn, render };
    resize();
    return () => {
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      three.current = null;
    };
  }, []);

  // Casa, moduli, ostacoli e bussola.
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    for (const g of [t.model, t.extras]) {
      for (const c of [...g.children]) {
        g.remove(c);
        if (c instanceof THREE.Mesh) c.geometry.dispose();
      }
    }
    if (!r || !house) {
      t.render();
      return;
    }
    const H = d.roof.heightM;
    buildHouse(t.model, house, d);
    const flat = d.roof.type === 'piano';
    const n = Math.min(moduleCount(d), r.layout.panels.length);
    const landscape = d.roof.orientation === 'orizzontale';
    const baseZ = flat ? H + 0.05 : H;
    const tex = cellTexture(landscape);
    const side = new THREE.MeshStandardMaterial({ color: '#c3c9d2', roughness: 0.4, metalness: 0.6 });
    const legMat = new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.5, metalness: 0.5 });
    for (let i = 0; i < n; i++) {
      const c = panelCorners(r.slope, r.layout, r.layout.panels[i]!, baseZ, flat);
      const loss = shading?.perPanel[i] ?? 0;
      const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0.35, color: showMap ? lossColor(loss) : '#ffffff' });
      const m = panelMesh(c, top, side);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.panel = true;
      t.model.add(m);
      if (flat) {
        // Telaio sul tetto piano: due montanti sul lato alto.
        for (const k of [2, 3]) {
          const p = c[k]!;
          const h = p.z - baseZ;
          if (h < 0.05) continue;
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.05), legMat);
          leg.position.copy(V({ ...p, z: baseZ + h / 2 }));
          leg.castShadow = true;
          t.model.add(leg);
        }
      }
    }
    buildObstacles(t.model, d.obstacles);
    // Bussola sul terreno.
    const R = Math.max(r.geo.rect.length, r.geo.rect.width) / 2 + 9;
    for (const [txt, x, y, col] of [
      ['N', 0, R, '#f87171'],
      ['S', 0, -R, '#e2e8f0'],
      ['E', R, 0, '#e2e8f0'],
      ['O', -R, 0, '#e2e8f0'],
    ] as const) {
      const s = textSprite(txt, col);
      s.position.set(r.geo.rect.cx + x, 1.2, -(r.geo.rect.cy + y));
      t.extras.add(s);
    }
    t.controls.target.set(r.geo.rect.cx, (H + house.top) / 2, -r.geo.rect.cy);
    const key = d.roof.footprint.map((q) => q.join(',')).join(';');
    if (framed.current !== key) {
      framed.current = key;
      placeCamera('tre-quarti', false);
    }
    t.controls.update();
    t.render();
  }, [r, house, d, shading, showMap]);

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

  // Sole: luce, cielo, sole visibile, percorso del mese e moduli in ombra ora.
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const up = sun.elevation > 0;
    const el = (Math.max(0, sun.elevation) * Math.PI) / 180;
    const az = (sun.azimuth * Math.PI) / 180;
    const dir: XYZ = { x: -Math.sin(az) * Math.cos(el), y: -Math.cos(az) * Math.cos(el), z: Math.sin(el) };
    const target = t.controls.target.clone();
    t.sun.target.position.copy(target);
    t.sun.position.copy(target.clone().add(V(dir).multiplyScalar(120)));
    const warm = Math.min(1, sun.elevation / 30);
    t.sun.color.copy(new THREE.Color('#ffae6b').lerp(new THREE.Color('#fff4e0'), warm));
    t.sun.intensity = up ? 0.4 + 2.6 * Math.sin(el) : 0;
    t.hemi.intensity = up ? 0.45 + 0.55 * Math.sin(el) : 0.18;
    const [zen, hor] = skyColors(sun.elevation);
    if (t.scene.background instanceof THREE.Texture) t.scene.background.dispose();
    t.scene.background = canvasTexture(2, 256, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, zen);
      grad.addColorStop(1, hor);
      g.fillStyle = grad;
      g.fillRect(0, 0, 2, 256);
    });
    if (t.scene.fog instanceof THREE.Fog) t.scene.fog.color.set(hor);
    // Sole e percorso del giorno scelto, su una sfera attorno alla casa.
    for (const c of [...t.extras.children].filter((c) => c.userData.sky)) t.extras.remove(c);
    const Rs = 110;
    const pts: THREE.Vector3[] = [];
    for (let h = 3; h <= 21; h += 0.25) {
      const sp = sunPosition(d.site.latitude, MONTH_REP_DAY[month] ?? 172, h);
      if (sp.elevation < 0) continue;
      const e = (sp.elevation * Math.PI) / 180;
      const a = (sp.azimuth * Math.PI) / 180;
      pts.push(target.clone().add(V({ x: -Math.sin(a) * Math.cos(e), y: -Math.cos(a) * Math.cos(e), z: Math.sin(e) }).multiplyScalar(Rs)));
    }
    if (pts.length > 1) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: '#fde68a', dashSize: 2, gapSize: 2, transparent: true, opacity: 0.8, fog: false }));
      line.computeLineDistances();
      line.userData.sky = true;
      t.extras.add(line);
    }
    if (up) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(3.2, 20, 14), new THREE.MeshBasicMaterial({ color: '#fde047', fog: false }));
      ball.position.copy(target.clone().add(V(dir).multiplyScalar(Rs)));
      ball.userData.sky = true;
      t.extras.add(ball);
    }
    // Moduli in ombra adesso: raggio dal centro del modulo verso il sole.
    const panels = t.model.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && !!c.userData.panel);
    if (up && panels.length) {
      const ray = new THREE.Raycaster();
      const toSun = V(dir).normalize();
      const blockers = t.model.children.filter((o) => o instanceof THREE.Mesh);
      let k = 0;
      for (const p of panels) {
        ray.set(p.position.clone().addScaledVector(toSun, 0.06), toSun);
        if (ray.intersectObjects(blockers.filter((o) => o !== p), false).length) k++;
      }
      setShaded({ n: k, total: panels.length });
    } else setShaded(null);
    t.render();
  }, [sun.elevation, sun.azimuth, month, r, house, d]);

  // Giornata che scorre.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setHour((h) => (h >= 20 ? 5 : Math.round((h + 0.25) * 100) / 100)), 110);
    return () => window.clearInterval(id);
  }, [playing]);

  // Rotazione automatica attorno alla casa.
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    t.controls.autoRotate = spin;
    if (!spin) return;
    let raf = 0;
    const loop = () => {
      t.controls.update();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [spin]);

  /** Porta la telecamera su una vista predefinita, con un movimento morbido. */
  function placeCamera(view: ViewPreset, animate = true) {
    const t = three.current;
    if (!t || !r) return;
    const dist = Math.max(20, Math.max(r.geo.rect.length, r.geo.rect.width) * 2.6);
    const c = t.controls.target;
    const off: Record<ViewPreset, THREE.Vector3> = {
      'tre-quarti': new THREE.Vector3(-0.55, 0.6, 0.8),
      sud: new THREE.Vector3(0, 0.35, 1),
      est: new THREE.Vector3(1, 0.35, 0),
      ovest: new THREE.Vector3(-1, 0.35, 0),
      alto: new THREE.Vector3(0, 1, 0.02),
    };
    const to = c.clone().add(off[view].normalize().multiplyScalar(dist));
    if (!animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      t.camera.position.copy(to);
      t.controls.update();
      t.render();
      return;
    }
    const from = t.camera.position.clone();
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 700);
      t.camera.position.lerpVectors(from, to, ease(k));
      t.controls.update();
      t.render();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const setObstacle = (id: string, patch: Partial<Obstacle>) => update((x) => ({ ...x, obstacles: x.obstacles.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  const removeObstacle = (id: string) => update((x) => ({ ...x, obstacles: x.obstacles.filter((o) => o.id !== id) }));
  const applyLoss = () => shading && update((x) => ({ ...x, site: { ...x.site, shadingPct: Math.round(shading.lossPct * 10) / 10 } }));
  const hh = Math.floor(hour);
  const mm = Math.round((hour - hh) * 60);
  const loss = shading ? Math.round(shading.lossPct * 10) / 10 : 0;
  const worst = shading && shading.perPanel.length ? Math.max(...shading.perPanel) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className={`relative isolate h-[28rem] w-full overflow-hidden rounded-xl border bg-slate-950 ${placing ? 'cursor-crosshair border-sky-500' : 'border-slate-800'}`} ref={host}>
        {!r && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[0.78125rem] text-slate-300">Disegna prima la pianta del tetto sulla mappa (passo 1).</div>}
        {r && (
          <div className="absolute left-2 top-2 z-10 flex flex-wrap gap-1">
            {(Object.keys(VIEW_LABEL) as ViewPreset[]).map((v) => (
              <button key={v} onClick={() => placeCamera(v)} className="rounded-md bg-slate-950/75 px-2 py-1 text-[0.6875rem] font-semibold text-slate-200 backdrop-blur hover:bg-slate-800">
                {VIEW_LABEL[v]}
              </button>
            ))}
            <button
              onClick={() => setSpin((s) => !s)}
              aria-pressed={spin}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[0.6875rem] font-semibold backdrop-blur ${spin ? 'bg-amber-400/90 text-slate-950' : 'bg-slate-950/75 text-slate-200 hover:bg-slate-800'}`}
            >
              <RotateCw size={12} /> Gira
            </button>
          </div>
        )}
        {placing && (
          <div className="pv-pop-in absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-sky-600 px-3 py-1.5 text-[0.75rem] font-semibold text-white shadow-lg">
            Clicca sul terreno dove si trova {placing === 'albero' ? "l'albero" : "l'edificio"}
            <button onClick={() => setPlacing(null)} aria-label="Annulla" className="rounded p-0.5 hover:bg-sky-500">
              <X size={14} />
            </button>
          </div>
        )}
        {showMap && r && (
          <div className="pv-pop-in absolute bottom-2 right-2 z-10 rounded-lg bg-slate-950/80 px-2.5 py-1.5 text-[0.65625rem] text-slate-300 backdrop-blur">
            <div className="mb-1 font-semibold text-slate-100">Perdita annua per ombre</div>
            <div className="h-2 w-36 rounded-full" style={{ background: 'linear-gradient(90deg,#22c55e,#facc15 33%,#ef4444)' }} />
            <div className="mt-0.5 flex justify-between font-mono">
              <span>0%</span>
              <span>5%</span>
              <span>15%+</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[0.71875rem] text-slate-400">
          Mese: <span className="font-semibold text-slate-100">{MONTHS[month]}</span>
          <input type="range" min={0} max={11} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="mt-1 w-full accent-amber-500" />
        </label>
        <label className="block text-[0.71875rem] text-slate-400">
          Ora solare:{' '}
          <span className="font-semibold text-slate-100">
            {hh}:{String(mm).padStart(2, '0')}
          </span>
          <input type="range" min={5} max={20} step={0.25} value={hour} onChange={(e) => setHour(Number(e.target.value))} className="mt-1 w-full accent-amber-500" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[0.75rem]">
        <button onClick={() => setPlaying((p) => !p)} className="flex items-center gap-1.5 rounded-md bg-slate-700 px-3 py-1.5 font-semibold text-white hover:bg-slate-600">
          {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Ferma' : 'Fai scorrere la giornata'}
        </button>
        <button
          onClick={() => setShowMap((s) => !s)}
          aria-pressed={showMap}
          disabled={!r}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold disabled:opacity-50 ${showMap ? 'bg-emerald-500 text-emerald-950' : 'bg-slate-700 text-white hover:bg-slate-600'}`}
        >
          <Eye size={14} /> Mappa delle ombre dell'anno
        </button>
        <button
          onClick={() => {
            const t = three.current;
            if (!t) return;
            t.render();
            setSnapshot(t.renderer.domElement.toDataURL('image/jpeg', 0.9));
          }}
          disabled={!r}
          className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
        >
          <Camera size={14} /> Usa questa vista nella relazione
        </button>
        {snapshot && <span className="text-emerald-300">Vista salvata per la relazione PDF.</span>}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[0.75rem] sm:grid-cols-4">
        <span className="text-slate-400">Altezza del sole</span>
        <span className="font-mono text-slate-100">{sun.elevation > 0 ? `${f(sun.elevation, 1)}°` : "sotto l'orizzonte"}</span>
        <span className="text-slate-400">Direzione del sole</span>
        <span className="flex items-center gap-1 font-mono text-slate-100">
          <Compass size={12} className="text-slate-500" />
          {f(sun.azimuth)}° (0 = sud)
        </span>
        <span className="text-slate-400">Moduli in ombra adesso</span>
        <span className="font-mono text-slate-100">{shaded ? `${shaded.n} su ${shaded.total}` : '—'}</span>
      </div>

      {r && (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-[0.8125rem] font-semibold text-slate-100">Alberi ed edifici vicini</h3>
              <p className="text-[0.71875rem] leading-snug text-slate-400">Aggiungi ciò che può fare ombra al tetto: entra nella mappa delle ombre di tutto l'anno.</p>
            </div>
            <div className="flex gap-2">
              {(['albero', 'edificio'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setPlacing(placing === k ? null : k)}
                  aria-pressed={placing === k}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.75rem] font-semibold ${placing === k ? 'bg-sky-500 text-white' : 'bg-slate-700 text-white hover:bg-slate-600'}`}
                >
                  {k === 'albero' ? <TreeDeciduous size={14} /> : <Building2 size={14} />} {k === 'albero' ? 'Albero' : 'Edificio'}
                </button>
              ))}
            </div>
          </div>
          {d.obstacles.length > 0 && (
            <ul className="space-y-2">
              {d.obstacles.map((o) => (
                <li key={o.id} className="pv-pop-in grid grid-cols-2 items-end gap-2 rounded-lg bg-slate-900/70 p-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                  <div className="col-span-2 flex items-center gap-1.5 self-center text-[0.75rem] font-semibold text-slate-200 sm:col-span-1">
                    {o.kind === 'albero' ? <TreeDeciduous size={14} className="text-emerald-400" /> : <Building2 size={14} className="text-slate-300" />}
                    {o.kind === 'albero' ? 'Albero' : 'Edificio'}
                    <span className="font-normal text-slate-500">
                      {f(Math.hypot(o.x, o.y))} m a {compassFrom(o.x, o.y)}
                    </span>
                  </div>
                  <Num label="Altezza" value={o.height} onChange={(v) => setObstacle(o.id, { height: v })} suffix="m" min={1} max={80} step={0.5} />
                  <Num label={o.kind === 'albero' ? 'Chioma' : 'Larghezza'} value={o.size} onChange={(v) => setObstacle(o.id, { size: v })} suffix="m" min={0.5} max={80} step={0.5} />
                  {o.kind === 'edificio' ? <Num label="Profondità" value={o.depth} onChange={(v) => setObstacle(o.id, { depth: v })} suffix="m" min={0.5} max={80} step={0.5} /> : <span className="hidden sm:block" />}
                  <button onClick={() => removeObstacle(o.id)} className="justify-self-end rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-red-300" aria-label="Togli">
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {shading && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-900/70 px-3 py-2.5">
              <div className="text-[0.78125rem] leading-snug text-slate-300">
                Perdita per ombre stimata in un anno: <b className="font-mono text-white">{f(loss, 1)}%</b>
                {shading.perPanel.length > 1 && worst > loss + 0.5 && <span className="text-slate-400"> (modulo più ombreggiato {f(worst, 1)}%)</span>}
                <span className="block text-[0.6875rem] text-slate-500">Nel calcolo della produzione ora c'è {f(d.site.shadingPct, 1)}%.</span>
              </div>
              {Math.abs(loss - d.site.shadingPct) >= 0.1 && (
                <button onClick={applyLoss} className="rounded-md bg-emerald-500 px-3 py-1.5 text-[0.75rem] font-semibold text-emerald-950 hover:bg-emerald-400">
                  Usa {f(loss, 1)}% nel calcolo
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <p className="text-[0.6875rem] leading-snug text-slate-500">
        Trascina per ruotare, rotella o pizzico per lo zoom, tasto destro o due dita per spostare. La mappa delle ombre traccia ogni mezz'ora del giorno medio di ogni mese la luce diretta
        verso cinque punti di ogni modulo; la luce diffusa è considerata libera, quindi la perdita è un valore minimo. Camini, antenne e il disaccoppiamento tra moduli della stessa stringa non
        sono considerati. Ora solare: a mezzogiorno il sole è a sud (con l'ora legale circa le 13).
      </p>
    </div>
  );
}

function compassFrom(x: number, y: number): string {
  const names = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ovest', 'ovest', 'nord-ovest'];
  const bearing = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
  return names[Math.round(bearing / 45) % 8]!;
}
