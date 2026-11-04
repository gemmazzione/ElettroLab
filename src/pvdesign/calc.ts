import { stringChecks, type PvCheck } from '../engine/pv';
import { RHO_CU_70 } from '../model/constants';
import type { InverterParams, PvArrayParams, WireSection } from '../model/types';
import { ampacity, tempFactor } from '../rules/ampacity';
import { INVERTERS, isThreePhaseInverter, LOAD_PROFILES, MOUNTINGS, profileWeights, MONTH_DAYS, MONTH_LOAD_WEIGHTS, MONTH_REP_DAY, SOLAR_CABLE_AMPACITY, SOLAR_CABLE_SECTIONS, type PriceId } from './data';
import { batteryActive, isBusiness, isHybrid, type PvDesign } from './design';
import { roofCapacity, sunPosition } from './roof';
import { horizonElevation, isWeather } from './weather';
import { declination } from './sun';

export { declination };

/*
 * Calcoli della progettazione fotovoltaica.
 *
 * IRRAGGIAMENTO SUL PIANO DEI MODULI — metodo dei manuali (Duffie & Beckman, «Solar Engineering of Thermal Processes»):
 *  - giorno medio del mese (Klein), declinazione solare, angolo orario del tramonto;
 *  - indice di serenità Kt = H / H0 (H0 irraggiamento extraterrestre);
 *  - frazione diffusa media mensile con la correlazione di Erbs;
 *  - ripartizione oraria con i fattori di Collares-Pereira e Rabl (globale) e di Liu e Jordan (diffusa);
 *  - piano inclinato con il modello isotropo: diretta × Rb + diffusa × (1 + cos β)/2 + riflessa × ρ (1 − cos β)/2.
 * Il giorno medio non ha la variabilità dei giorni reali (nuvole, giorni sereni e coperti): la produzione mensile
 * è attendibile come ordine di grandezza, l'autoconsumo stimato sul giorno medio tende a essere ottimistico.
 */

const RAD = Math.PI / 180;
const GSC = 1367; // costante solare [W/m²]
const STEP = 0.25; // passo di calcolo [h]
/** Rendimento della batteria in andata e ritorno (valore indicativo). */
export const BATTERY_ROUND_TRIP = 0.9;
/** Quota della capacità nominale effettivamente utilizzabile (valore indicativo). */
export const BATTERY_USABLE = 0.9;

export const f = (v: number, d = 0) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });

// ------------------------------------------------------------------ geometria solare


/** Irraggiamento extraterrestre giornaliero sul piano orizzontale [kWh/m²]. */
export function extraterrestrialDaily(latDeg: number, n: number): number {
  const phi = latDeg * RAD;
  const d = declination(n) * RAD;
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(d))));
  const e = 1 + 0.033 * Math.cos(RAD * ((360 * n) / 365));
  return ((24 / Math.PI) * GSC * e * (Math.cos(phi) * Math.cos(d) * Math.sin(ws) + ws * Math.sin(phi) * Math.sin(d))) / 1000;
}

/** Frazione diffusa media mensile (Erbs et al., 1982). */
export function diffuseFraction(kt: number, wsDeg: number): number {
  const k = Math.max(0.3, Math.min(0.8, kt));
  return wsDeg <= 81.4 ? 1.391 - 3.56 * k + 4.189 * k ** 2 - 2.137 * k ** 3 : 1.311 - 3.022 * k + 3.427 * k ** 2 - 1.821 * k ** 3;
}

export interface MonthSun {
  /** Irraggiamento sul piano dei moduli nel giorno medio, a passi di 15 minuti [W/m²] */
  poa: number[];
  /** Irraggiamento giornaliero sul piano dei moduli [kWh/m²] */
  hPoa: number;
  kt: number;
  diffuseFrac: number;
}

/** Giorno medio del mese: irraggiamento sul piano dei moduli. */
export function monthSun(latDeg: number, month: number, hDay: number, tiltDeg: number, azimuthDeg: number, albedo: number): MonthSun {
  const n = MONTH_REP_DAY[month] ?? 15;
  const phi = latDeg * RAD;
  const d = declination(n) * RAD;
  const beta = tiltDeg * RAD;
  const gam = azimuthDeg * RAD;
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(d))));
  const wsDeg = ws / RAD;
  const h0 = extraterrestrialDaily(latDeg, n);
  const kt = h0 > 0 ? hDay / h0 : 0;
  const df = diffuseFraction(kt, wsDeg);
  const a = 0.409 + 0.5016 * Math.sin(ws - 60 * RAD);
  const b = 0.6609 - 0.4767 * Math.sin(ws - 60 * RAD);
  const den = Math.sin(ws) - ws * Math.cos(ws);
  const steps = Math.round(24 / STEP);
  const rt: number[] = [];
  const rd: number[] = [];
  const w: number[] = [];
  for (let i = 0; i < steps; i++) {
    const hour = (i + 0.5) * STEP;
    const om = (hour - 12) * 15 * RAD;
    w.push(om);
    if (Math.abs(om) >= ws) {
      rt.push(0);
      rd.push(0);
      continue;
    }
    const x = Math.cos(om) - Math.cos(ws);
    rd.push((Math.PI / 24) * (x / den));
    rt.push((Math.PI / 24) * (a + b * Math.cos(om)) * (x / den));
  }
  // I fattori orari sono definiti per ore intere: si normalizzano perché la somma dia esattamente H e Hd.
  const sT = rt.reduce((s, v) => s + v, 0) * STEP;
  const sD = rd.reduce((s, v) => s + v, 0) * STEP;
  const hD = hDay * df;
  const poa: number[] = [];
  let hPoa = 0;
  for (let i = 0; i < steps; i++) {
    const g = sT > 0 ? (rt[i]! / sT) * hDay * 1000 : 0; // W/m² sull'orizzontale
    const gd = Math.min(g, sD > 0 ? (rd[i]! / sD) * hD * 1000 : 0);
    const gb = g - gd;
    const om = w[i]!;
    const cosZ = Math.cos(phi) * Math.cos(d) * Math.cos(om) + Math.sin(phi) * Math.sin(d);
    const cosT =
      Math.sin(d) * Math.sin(phi) * Math.cos(beta) -
      Math.sin(d) * Math.cos(phi) * Math.sin(beta) * Math.cos(gam) +
      Math.cos(d) * Math.cos(phi) * Math.cos(beta) * Math.cos(om) +
      Math.cos(d) * Math.sin(phi) * Math.sin(beta) * Math.cos(gam) * Math.cos(om) +
      Math.cos(d) * Math.sin(beta) * Math.sin(gam) * Math.sin(om);
    // Con il sole molto basso Rb diverge: si limita il denominatore (sole sotto circa 5° di altezza).
    const rb = cosZ > 0 ? Math.max(0, cosT) / Math.max(cosZ, 0.087) : 0;
    const gt = Math.max(0, gb * rb + gd * ((1 + Math.cos(beta)) / 2) + g * albedo * ((1 - Math.cos(beta)) / 2));
    poa.push(gt);
    hPoa += (gt * STEP) / 1000;
  }
  return { poa, hPoa, kt, diffuseFrac: df };
}

// ------------------------------------------------------------------ generatore e verifiche di stringa

export const arrayParams = (d: PvDesign, strings = d.strings): PvArrayParams => ({
  name: 'Generatore',
  moduleWp: d.module.moduleWp,
  vmp: d.module.vmp,
  imp: d.module.imp,
  voc: d.module.voc,
  isc: d.module.isc,
  tcVoc: d.module.tcVoc,
  tcPmax: d.module.tcPmax,
  tcIsc: d.module.tcIsc,
  noct: d.module.noct,
  modulesPerString: d.modulesPerString,
  strings,
});

export const inverterParams = (d: PvDesign): InverterParams => ({
  ...d.inverter,
  batteryKWh: batteryActive(d) ? d.batteryKWh : 0,
  batteryW: batteryActive(d) ? batteryPowerW(d) : 0,
});

/** Inverter uguali in parallelo (almeno uno). */
export const inverterUnits = (d: PvDesign) => Math.max(1, Math.round(d.inverterCount || 1));
/** Potenza AC complessiva degli inverter [W]. */
export const acPowerW = (d: PvDesign) => d.inverter.pacW * inverterUnits(d);
/** Ingressi MPPT complessivi di tutti gli inverter. */
export const mpptInputs = (d: PvDesign) => d.inverter.mppt * inverterUnits(d);
/** Collegamento trifase a 400 V. */
export const threePhase = (d: PvDesign) => isThreePhaseInverter(d.inverter);

/**
 * Potenza di carica/scarica della batteria: circa 0,5 C; con l'inverter ibrido al massimo la sua potenza. In un'azienda
 * l'accumulo collegato in alternata ha un suo convertitore (indicativo).
 */
export const batteryPowerW = (d: PvDesign) => (isHybrid(d) ? Math.min(acPowerW(d), d.batteryKWh * 500) : d.batteryKWh * 500);

/** Campo di moduli su una falda: stringhe uguali, stessa inclinazione e orientamento, propri ingressi MPPT. */
export interface FieldView {
  index: 0 | 1;
  tilt: number;
  azimuth: number;
  modulesPerString: number;
  strings: number;
}

export function fields(d: PvDesign): FieldView[] {
  const f1: FieldView = { index: 0, tilt: d.site.tilt, azimuth: d.site.azimuth, modulesPerString: d.modulesPerString, strings: d.strings };
  if (!d.field2?.enabled) return [f1];
  return [f1, { index: 1, tilt: d.field2.tilt, azimuth: d.field2.azimuth, modulesPerString: d.field2.modulesPerString, strings: d.field2.strings }];
}

/**
 * Progetto ridotto a un solo campo: stessi dati, con stringhe, orientamento e falda del campo e metà degli ingressi
 * MPPT (ogni falda ha i suoi). Serve a riusare verifiche di stringa, cavi e protezioni campo per campo.
 */
export function fieldDesign(d: PvDesign, f: FieldView): PvDesign {
  if (!d.field2?.enabled) return d;
  const mppt = Math.max(1, Math.floor(mpptInputs(d) / 2));
  return {
    ...d,
    modulesPerString: f.modulesPerString,
    strings: f.strings,
    site: { ...d.site, tilt: f.tilt, azimuth: f.azimuth },
    inverter: { ...d.inverter, mppt },
    inverterCount: 1,
    field2: { ...d.field2, enabled: false },
    roof: f.index === 1 ? { ...d.roof, slope: d.field2.slope, excluded: d.field2.excluded } : d.roof,
  };
}

export const moduleCount = (d: PvDesign) => fields(d).reduce((a, x) => a + x.modulesPerString * x.strings, 0);
export const peakW = (d: PvDesign) => moduleCount(d) * d.module.moduleWp;
/** Stringhe collegate allo stesso ingresso MPPT (ripartite in modo uniforme). */
export const stringsPerMppt = (d: PvDesign) => Math.ceil(d.strings / Math.max(1, mpptInputs(d)));

export function generatorChecks(d: PvDesign): PvCheck[] {
  if (!d.field2?.enabled) return [...fieldChecks(d), ...globalChecks(d)];
  // Due falde: verifiche di stringa e di posa per ciascuna, poi quelle dell'impianto intero.
  const out: PvCheck[] = [];
  for (const fv of fields(d)) {
    for (const c of fieldChecks(fieldDesign(d, fv))) out.push({ ...c, id: `${c.id}-${fv.index + 1}`, title: `Falda ${fv.index + 1}: ${c.title}` });
  }
  out.push({
    id: 'mppt-fields',
    title: 'Un ingresso MPPT per ogni falda',
    ok: mpptInputs(d) >= 2,
    detail:
      mpptInputs(d) >= 2
        ? `${inverterUnits(d) > 1 ? 'Gli inverter hanno' : "L'inverter ha"} ${mpptInputs(d)} ingressi MPPT: ogni falda ha il suo, così orientamenti diversi non si penalizzano a vicenda.`
        : "Le due falde hanno orientamenti diversi e non possono stare sullo stesso inseguitore: serve un inverter con almeno due ingressi MPPT.",
  });
  return [...out, ...globalChecks(d)];
}

/** Verifiche di un solo campo: stringhe sull'inverter e moduli sulla falda. */
function fieldChecks(d: PvDesign): PvCheck[] {
  const env = { irradiance: 1000, ambientC: 25, minAmbientC: d.site.tMin, maxAmbientC: d.site.tMax };
  const perInput = stringChecks(arrayParams(d, stringsPerMppt(d)), inverterParams(d), env).filter((c) => c.id !== 'dc-ac');
  const out: PvCheck[] = [
    ...perInput.map((c) => (c.id === 'isc-max' ? { ...c, title: `${c.title} (per ingresso MPPT)` } : c)),
    {
      id: 'mppt',
      title: 'Stringhe e ingressi MPPT',
      ok: d.strings <= mpptInputs(d) || d.strings % Math.max(1, mpptInputs(d)) === 0 ? true : null,
      detail: `${d.strings} stringhe su ${mpptInputs(d)} ingressi MPPT${inverterUnits(d) > 1 ? ` (${inverterUnits(d)} inverter)` : ''}: ${stringsPerMppt(d)} per ingresso. Con stringhe in parallelo sullo stesso ingresso le stringhe devono essere uguali (stesso numero di moduli, stessa esposizione).`,
    },
  ];
  if (d.site.roofM2 > 0) {
    const area = moduleCount(d) * d.module.areaM2;
    out.push({
      id: 'roof',
      title: 'Superficie occupata dai moduli',
      ok: area <= d.site.roofM2 * 0.9 ? true : area <= d.site.roofM2 ? null : false,
      detail: `${moduleCount(d)} moduli × ${f(d.module.areaM2, 2)} m² = ${f(area, 1)} m² su ${f(d.site.roofM2)} m² disponibili. Servono anche gli spazi per il passaggio, i bordi e le distanze dai camini.`,
    });
  }
  const cap = roofCapacity(d);
  if (cap !== null) {
    out.push({
      id: 'roof-fit',
      title: 'Moduli che stanno sulla falda',
      ok: moduleCount(d) <= cap,
      detail: `${moduleCount(d)} moduli previsti, sulla falda scelta ne stanno ${cap} con la distanza dai bordi indicata e i posti esclusi (disposizione a griglia, da verificare sul posto).`,
    });
  }
  return out;
}

/** Verifiche dell'impianto intero: potenze e batteria. */
function globalChecks(d: PvDesign): PvCheck[] {
  const ac = acPowerW(d);
  const ratio = peakW(d) / ac;
  const out: PvCheck[] = [
    {
      id: 'dc-ac',
      title: 'Rapporto potenza DC / AC',
      ok: ratio >= 0.8 && ratio <= 1.3 ? true : null,
      detail: `${f(peakW(d))} Wp / ${f(ac)} W = ${f(ratio, 2)}. Valori tra circa 0,8 e 1,3 sono comuni (indicazione di massima): sopra, l'inverter taglia la potenza nelle ore migliori; sotto, è sovradimensionato.`,
    },
    {
      id: 'contract',
      title: 'Potenza dell\'inverter e potenza della fornitura',
      ok: ac <= Math.max(d.consumption.contractKW, 6) * 1000 ? true : null,
      detail: `${inverterUnits(d) > 1 ? `${inverterUnits(d)} inverter, in tutto` : 'Inverter'} ${f(ac / 1000, 1)} kW, fornitura ${f(d.consumption.contractKW, 1)} kW. La potenza immettibile e l'eventuale adeguamento della connessione vanno concordati con il distributore (CEI 0-21, riferimento non verificato su testo).`,
    },
  ];
  if (!threePhase(d) && ac > 6000) {
    out.push({
      id: 'phases',
      title: 'Monofase o trifase',
      ok: null,
      detail: `${f(ac / 1000, 1)} kW su una sola fase: oltre circa 6 kW il distributore chiede di solito un collegamento trifase (CEI 0-21, riferimento non verificato su testo). Valuta un inverter trifase.`,
    });
  }
  if (d.batteryKWh > 0 && !isHybrid(d) && !isBusiness(d)) {
    out.push({ id: 'battery', title: 'Batteria e inverter', ok: false, detail: "Per una batteria serve un inverter ibrido (o un inverter di batteria dedicato, non considerato qui): scegli un inverter ibrido o togli l'accumulo." });
  }
  return out;
}

// ------------------------------------------------------------------ cavi e protezioni

export interface CableSizing {
  section: number;
  auto: boolean;
  /** Corrente di progetto [A] */
  ib: number;
  /** Portata corretta [A] */
  iz: number | null;
  dropPct: number;
  lossPct: number;
  ok: boolean;
  notes: string[];
}

/** Lato DC: ogni stringa ha la sua coppia di cavi fino all'inverter. */
export function dcCable(d: PvDesign): CableSizing {
  const ib = 1.25 * d.module.isc; // criterio comune (IEC 62548): portata ≥ 1,25 × Isc della stringa
  const vmp = d.modulesPerString * d.module.vmp;
  const k = tempFactor('EPR', d.cables.dcAmbientC) ?? 0.71;
  const evalS = (s: number) => {
    const iz = (SOLAR_CABLE_AMPACITY[s] ?? 0) * k;
    const r = (2 * d.cables.dcLengthM * RHO_CU_70) / s;
    const drop = ((r * d.module.imp) / vmp) * 100;
    return { iz, drop };
  };
  const auto = d.cables.dcSection === null;
  const section = auto ? (SOLAR_CABLE_SECTIONS.find((s) => evalS(s).iz >= ib && evalS(s).drop <= 1) ?? 16) : d.cables.dcSection!;
  const { iz, drop } = evalS(section);
  const notes = [
    `Corrente di progetto 1,25 × Isc = 1,25 × ${f(d.module.isc, 2)} = ${f(ib, 1)} A (criterio di progetto comune, IEC 62548: testo non verificato).`,
    `Portata del cavo solare ${section} mm² in aria ${f(SOLAR_CABLE_AMPACITY[section] ?? 0)} A (valore di catalogo tipico) × ${f(k, 2)} per ${f(d.cables.dcAmbientC)} °C = ${f(iz, 1)} A.`,
    `Caduta di tensione alla corrente nominale: 2 × ${f(d.cables.dcLengthM)} m × ${RHO_CU_70} / ${section} mm² × ${f(d.module.imp, 2)} A = ${f((drop / 100) * vmp, 2)} V su ${f(vmp)} V (${f(drop, 2)}%). In un circuito in serie la perdita di potenza in percentuale è uguale alla caduta di tensione.`,
  ];
  return { section, auto, ib, iz, dropPct: drop, lossPct: drop, ok: iz >= ib && drop <= 2, notes };
}

const AC_SECTIONS: WireSection[] = [2.5, 4, 6, 10, 16];
const AC_BREAKERS = [10, 13, 16, 20, 25, 32, 40, 50];

/** Lato AC: linea monofase inverter → quadro, protetta da un magnetotermico differenziale dedicato. */
/**
 * Portata di un cavo multipolare in rame isolato in EPR/XLPE (tipo FG16OR16), tre conduttori carichi, in aria libera o su
 * passerella forata a 30 °C [A]: valori tipici di catalogo, da verificare su quello del cavo scelto.
 */
const TRI_AMPACITY: [number, number][] = [
  [2.5, 32], [4, 42], [6, 54], [10, 75], [16, 100], [25, 127], [35, 158], [50, 192], [70, 246], [95, 298], [120, 346], [150, 399], [185, 456], [240, 538],
];
export const AC_TRI_SECTIONS = TRI_AMPACITY.map(([sec]) => sec);
/** Correnti nominali commerciali di interruttori automatici e scatolati [A]. */
const TRI_BREAKERS = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400, 500, 630];

/** Linea trifase a 400 V dagli inverter al quadro generale. */
function acCableThreePhase(d: PvDesign): CableSizing & { inA: number } {
  const p = acPowerW(d);
  const ib = p / (Math.sqrt(3) * 400);
  const inA = TRI_BREAKERS.find((x) => x >= ib) ?? 630;
  const evalS = (sec: number) => {
    const iz = TRI_AMPACITY.find(([x]) => x === sec)?.[1] ?? null;
    const drop = ((Math.sqrt(3) * d.cables.acLengthM * RHO_CU_70 * ib) / sec / 400) * 100;
    return { iz, drop };
  };
  const auto = d.cables.acSection === null || !AC_TRI_SECTIONS.includes(d.cables.acSection);
  const section = auto ? (AC_TRI_SECTIONS.find((sec) => (evalS(sec).iz ?? 0) >= inA && evalS(sec).drop <= 1) ?? 240) : d.cables.acSection!;
  const { iz, drop } = evalS(section);
  const notes = [
    `Corrente d'impiego Ib = ${f(p)} W / (√3 × 400 V) = ${f(ib, 1)} A per fase (fattore di potenza 1)${inverterUnits(d) > 1 ? `, somma di ${inverterUnits(d)} inverter` : ''}.`,
    `Interruttore In = ${inA} A ≥ Ib. Portata del cavo multipolare ${section} mm² (rame, EPR/XLPE, in aria o su passerella, 30 °C): Iz = ${iz === null ? '—' : f(iz)} A (valore tipico di catalogo, da verificare).`,
    `Caduta di tensione: √3 × ${f(d.cables.acLengthM)} m × ${RHO_CU_70} / ${section} mm² × ${f(ib, 1)} A = ${f((drop / 100) * 400, 2)} V su 400 V (${f(drop, 2)}%).`,
    'Con più linee nello stesso percorso, temperature più alte o posa interrata la portata si riduce: applica i coefficienti del costruttore.',
    ...(section >= 150 ? ['Sezioni così grandi si posano di solito come più cavi in parallelo per fase, oppure con una linea per ogni inverter fino a un quadro di parallelo vicino al quadro generale.'] : []),
  ];
  return { section, auto, ib, iz, dropPct: drop, lossPct: drop, ok: iz !== null && ib <= inA && inA <= iz && drop <= 2, notes, inA };
}

export function acCable(d: PvDesign): CableSizing & { inA: number } {
  if (threePhase(d)) return acCableThreePhase(d);
  const ib = acPowerW(d) / 230;
  const inA = AC_BREAKERS.find((x) => x >= ib) ?? 50;
  const evalS = (s: WireSection) => {
    const iz = ampacity(s, d.cables.acMethod, 'PVC', 30, 1)?.iz ?? null;
    const drop = ((2 * d.cables.acLengthM * RHO_CU_70 * ib) / s / 230) * 100;
    return { iz, drop };
  };
  const auto = d.cables.acSection === null;
  const section = (auto ? (AC_SECTIONS.find((s) => (evalS(s).iz ?? 0) >= inA && evalS(s).drop <= 1) ?? 16) : d.cables.acSection!) as WireSection;
  const { iz, drop } = evalS(section);
  const notes = [
    `Corrente d'impiego Ib = ${f(acPowerW(d))} W / 230 V = ${f(ib, 1)} A (fattore di potenza 1).`,
    `Magnetotermico differenziale In = ${inA} A ≥ Ib. Portata del cavo ${section} mm² in posa ${d.cables.acMethod}: Iz = ${iz === null ? '—' : f(iz, 1)} A (IEC 60364-5-52, cavi PVC a 30 °C, un circuito).`,
    `Caduta di tensione: 2 × ${f(d.cables.acLengthM)} m × ${RHO_CU_70} / ${section} mm² × ${f(ib, 1)} A = ${f((drop / 100) * 230, 2)} V (${f(drop, 2)}%). Quando l'inverter immette in rete la tensione ai suoi morsetti SALE della stessa quantità: con una rete già alta può staccarsi per sovratensione.`,
  ];
  return { section, auto, ib, iz, dropPct: drop, lossPct: drop, ok: iz !== null && ib <= inA && inA <= iz && drop <= 2, notes, inA };
}

const GPV_FUSES = [6, 8, 10, 12, 15, 16, 20, 25, 30, 32];

export interface DcProtection {
  /** Fusibili di stringa necessari secondo il criterio IEC 62548 */
  fusesNeeded: boolean;
  fuseA: number | null;
  vocMax: number;
  switchV: number;
  switchA: number;
  spdUcpv: number;
  notes: string[];
}

export function dcProtection(d: PvDesign): DcProtection {
  const sp = stringsPerMppt(d);
  const isc = d.module.isc;
  const n = d.modulesPerString;
  const vocMax = n * d.module.voc * (1 + (d.module.tcVoc / 100) * (d.site.tMin - 25));
  const fusesNeeded = sp >= 2 && 1.35 * d.module.maxSeriesFuseA < (sp - 1) * isc;
  const fuseA = fusesNeeded ? (GPV_FUSES.find((x) => x >= 1.5 * isc && x <= Math.min(2.4 * isc, d.module.maxSeriesFuseA)) ?? null) : null;
  const switchV = [600, 800, 1000, 1100, 1500].find((v) => v >= vocMax) ?? 1500;
  const switchA = 1.25 * sp * isc;
  const spdUcpv = [600, 800, 1000, 1100, 1500].find((v) => v >= vocMax) ?? 1500;
  const notes = [
    `Tensione a vuoto massima della stringa con ${f(d.site.tMin)} °C: ${f(vocMax)} V. Sezionatore DC e SPD devono avere tensione nominale almeno pari a questo valore.`,
    sp >= 2
      ? `${sp} stringhe in parallelo sullo stesso ingresso: con un guasto in una stringa le altre possono spingere al massimo (${sp} − 1) × ${f(isc, 2)} = ${f((sp - 1) * isc, 1)} A al suo interno. ${fusesNeeded ? `È più di 1,35 × ${d.module.maxSeriesFuseA} A (fusibile massimo del modulo): servono fusibili di stringa gPV su + e −${fuseA ? ` da ${fuseA} A (tra 1,5 e 2,4 × Isc)` : ', ma nessun valore commerciale rientra tra 1,5 e 2,4 × Isc: rivedi la configurazione'}.` : `Non supera 1,35 × ${d.module.maxSeriesFuseA} A (fusibile massimo del modulo): i fusibili di stringa non sono necessari secondo il criterio IEC 62548 (testo non verificato).`}`
      : 'Una stringa per ingresso MPPT: nessuna corrente inversa da altre stringhe, i fusibili di stringa non servono.',
    `Sezionatore DC: almeno ${switchV} V DC e ${f(switchA, 1)} A per ingresso (1,25 × Isc delle stringhe in parallelo). Spesso è integrato nell'inverter: controlla i dati del costruttore.`,
    `SPD lato DC: tensione Ucpv ≥ ${f(vocMax)} V (valore commerciale ${spdUcpv} V), tipo 2, tra +, − e terra. La necessità dipende dalla valutazione del rischio di fulminazione.`,
  ];
  return { fusesNeeded, fuseA, vocMax, switchV, switchA, spdUcpv, notes };
}

// ------------------------------------------------------------------ produzione, autoconsumo, accumulo

export interface MonthResult {
  hPoa: number;
  productionKWh: number;
  consumptionKWh: number;
  selfKWh: number;
  exportKWh: number;
  importKWh: number;
  clipKWh: number;
  /** Andamento della giornata tipo del mese [W]: passi di 15 minuti (stima mensile) o di un'ora (anno tipo) */
  pv: number[];
  load: number[];
  soc: number[];
}

export interface LossItem {
  label: string;
  kWh: number;
}

/** Energia per fascia oraria F1, F2, F3 [kWh]. */
export type Bands = [number, number, number];

export interface YieldResult {
  months: MonthResult[];
  hPoaYear: number;
  productionKWh: number;
  consumptionKWh: number;
  selfKWh: number;
  exportKWh: number;
  importKWh: number;
  specificYield: number;
  /** Indice di rendimento (performance ratio) */
  pr: number;
  selfConsumptionPct: number;
  selfSufficiencyPct: number;
  losses: LossItem[];
  /** Energia ideale: potenza di picco × irraggiamento sul piano dei moduli / 1 kW/m² */
  idealKWh: number;
  /** Calcolo ora per ora sull'anno tipo PVGIS (altrimenti giorno medio di ogni mese) */
  hourly: boolean;
  /** Consumi aggiunti da pompa di calore e auto elettrica [kWh] */
  extrasKWh: number;
  /** Consumi, energia autoconsumata e prelevata per fascia oraria */
  bands: { load: Bands; self: Bands; import: Bands };
}

/** Ripartizione di un'ora del giorno (ora legale locale) tra le fasce F1, F2, F3 in una settimana tipo. */
export function bandFractions(hour: number): Bands {
  const h = Math.floor(((hour % 24) + 24) % 24);
  const weekday: Bands = h >= 8 && h < 19 ? [1, 0, 0] : (h >= 7 && h < 8) || (h >= 19 && h < 23) ? [0, 1, 0] : [0, 0, 1];
  const saturday: Bands = h >= 7 && h < 23 ? [0, 1, 0] : [0, 0, 1];
  return [0, 1, 2].map((i) => (5 * weekday[i]! + saturday[i]!) / 7 + (i === 2 ? 1 / 7 : 0)) as Bands;
}

/** Profilo orario tipico di una pompa di calore per il riscaldamento (peso relativo). */
const HEAT_PUMP_HOURS = [0.5, 0.5, 0.5, 0.5, 0.6, 0.9, 1.4, 1.5, 1.2, 0.9, 0.8, 0.8, 0.8, 0.8, 0.8, 0.9, 1.1, 1.4, 1.5, 1.4, 1.2, 1.0, 0.8, 0.6];
/** Consumo indicativo di un'auto elettrica [kWh/km]. */
export const EV_KWH_PER_KM = 0.17;

/** Consumi della casa: potenza media [W] in una data ora (locale) del giorno tipo di un mese, compresi gli extra. */
function loadModel(d: PvDesign) {
  const c = d.consumption;
  const prof = profileWeights(c);
  const profSum = prof.reduce((a, b) => a + b, 0) || 1;
  // Aziende: consumi simili tutto l'anno, salvo la chiusura di agosto (circa un terzo dei consumi del mese).
  const monthW = isBusiness(d) ? MONTH_LOAD_WEIGHTS.map((_, i) => (i === 7 && c.closedAugust ? 0.35 : 1)) : MONTH_LOAD_WEIGHTS;
  const mw = monthW.map((w, i) => w * MONTH_DAYS[i]!);
  const mwSum = mw.reduce((a, b) => a + b, 0);
  const hdd = d.site.tMean.map((t, m) => Math.max(0, 17 - t) * MONTH_DAYS[m]!);
  const hddSum = hdd.reduce((a, b) => a + b, 0) || 1;
  const hpSum = HEAT_PUMP_HOURS.reduce((a, b) => a + b, 0);
  const evDayWh = (c.evKm * EV_KWH_PER_KM * 1000) / 365;
  const evHours = c.evCharge === 'giorno' ? [10, 16] : [19, 23];
  const measured = c.measured && c.measured.length === 12 && c.measured.every((r) => r.length === 24) ? c.measured : null;
  // Sabato e domenica: consumo rispetto a un giorno feriale, normalizzato perché la media della settimana resti 1.
  const week = c.profile === 'manuale' || measured ? undefined : LOAD_PROFILES[c.profile]?.week;
  const weekMean = week ? (5 + week[0] + week[1]) / 7 : 1;
  const dayFactor = (dow: number | undefined) => (!week || dow === undefined ? 1 : (dow === 5 ? week[0] : dow === 6 ? week[1] : 1) / weekMean);
  /** dow: giorno della settimana (0 = lunedì); assente nel giorno medio del mese. */
  return (m: number, hour: number, dow?: number): { base: number; extra: number } => {
    const h = Math.floor(((hour % 24) + 24) % 24);
    const days = MONTH_DAYS[m]!;
    const base = measured ? measured[m]![h]! * 1000 : ((((c.annualKWh * 1000 * mw[m]!) / mwSum / days) * prof[h]!) / profSum) * dayFactor(dow);
    const hp = c.heatPumpKWh > 0 ? (((c.heatPumpKWh * 1000 * hdd[m]!) / hddSum / days) * HEAT_PUMP_HOURS[h]!) / hpSum : 0;
    const ev = evDayWh > 0 && h >= evHours[0]! && h < evHours[1]! ? evDayWh / (evHours[1]! - evHours[0]!) : 0;
    return { base, extra: hp + ev };
  };
}

/** Equazione del tempo [minuti] (Spencer, forma semplificata). */
function equationOfTime(n: number): number {
  const b = ((2 * Math.PI) / 364) * (n - 81);
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

/** Ora legale in Italia: dall'ultima domenica di marzo all'ultima di ottobre (giorni approssimati). */
const dstOffset = (n: number) => (n >= 87 && n < 301 ? 1 : 0);

export function computeYield(d: PvDesign): YieldResult {
  const fv = fields(d);
  const pstc = peakW(d);
  const fieldPeak = fv.map((x) => x.modulesPerString * x.strings * d.module.moduleWp);
  const dcLoss = fv.map((x) => dcCable(fieldDesign(d, x)).lossPct);
  const ac = acCable(d);
  const inv = d.inverter;
  const pacW = acPowerW(d);
  const eta = inv.euroEff / 100;
  const opt = d.optimizers;
  const mismatch = (opt ? 0.5 : 1) * d.losses.mismatchPct;
  const load = loadModel(d);
  const battery = batteryActive(d);
  const capWh = battery ? d.batteryKWh * 1000 * BATTERY_USABLE : 0;
  const pBat = battery ? batteryPowerW(d) : 0;
  const etaOneWay = Math.sqrt(BATTERY_ROUND_TRIP);
  const extraC = MOUNTINGS[d.site.mounting]?.extraC ?? 0;
  const avail = 1 - d.losses.availabilityPct / 100;
  const L = { shading: 0, optical: 0, temp: 0, soiling: 0, mismatch: 0, dcCable: 0, optimizer: 0, inverter: 0, clip: 0, acCable: 0, avail: 0 };
  let ideal = 0;
  const bands = { load: [0, 0, 0] as Bands, self: [0, 0, 0] as Bands, import: [0, 0, 0] as Bands };
  let extrasWh = 0;

  /** Catena delle perdite: dall'irraggiamento sui moduli di ogni falda alla potenza AC [W]. w = peso del passo [h]. */
  const acPower = (poa: number[], ta: number, w: number): { p: number; clip: number } => {
    let dcSum = 0;
    fv.forEach((_, k) => {
      const g = poa[k] ?? 0;
      const p0 = (fieldPeak[k]! * g) / 1000;
      ideal += p0 * w;
      const tc = ta + ((d.module.noct - 20) / 800 + extraC / 1000) * g;
      let p = p0;
      const step = (key: keyof typeof L, next: number) => {
        L[key] += (p - next) * w;
        p = next;
      };
      step('shading', p * (1 - d.site.shadingPct / 100));
      step('optical', p * (1 - d.losses.opticalPct / 100));
      step('temp', Math.max(0, p * (1 + (d.module.tcPmax / 100) * (tc - 25))));
      step('soiling', p * (1 - d.losses.soilingPct / 100));
      step('mismatch', p * (1 - mismatch / 100));
      // Le perdite nei cavi crescono col quadrato della corrente: in percentuale sono proporzionali alla potenza.
      step('dcCable', p * (1 - (dcLoss[k]! / 100) * (p / Math.max(1, fieldPeak[k]!))));
      if (opt) step('optimizer', p * 0.99);
      dcSum += p;
    });
    let p = dcSum;
    const step = (key: keyof typeof L, next: number) => {
      L[key] += (p - next) * w;
      p = next;
    };
    step('inverter', p * eta);
    const clipped = Math.min(p, pacW);
    const clip = p - clipped;
    step('clip', clipped);
    step('acCable', p * (1 - (ac.lossPct / 100) * (p / pacW)));
    step('avail', p * avail);
    return { p, clip };
  };

  /** Bilancio di un passo con la batteria; restituisce energie [Wh] e aggiorna lo stato di carica. */
  let soc = capWh * 0.5;
  const balance = (pv: number, ld: number, dt: number, bandHour: number, w: number) => {
    let net = ld - pv;
    const direct = Math.min(pv, ld);
    let fromBat = 0;
    if (capWh > 0 && net < 0) {
      const charge = Math.min(-net, pBat, (capWh - soc) / (dt * etaOneWay));
      soc += charge * dt * etaOneWay;
      net += charge;
    } else if (capWh > 0 && net > 0) {
      const out = Math.min(net, pBat, (soc * etaOneWay) / dt);
      soc -= (out * dt) / etaOneWay;
      net -= out;
      fromBat = out;
    }
    const self = (direct + fromBat) * dt;
    const imp = net > 0 ? net * dt : 0;
    const exp = net < 0 ? -net * dt : 0;
    const bf = bandFractions(bandHour);
    for (let b = 0; b < 3; b++) {
      bands.load[b] = (bands.load[b] ?? 0) + (ld * dt * w * bf[b]!) / 1000;
      bands.self[b] = (bands.self[b] ?? 0) + (self * w * bf[b]!) / 1000;
      bands.import[b] = (bands.import[b] ?? 0) + (imp * w * bf[b]!) / 1000;
    }
    return { self, imp, exp };
  };

  const months: MonthResult[] = [];
  const hPoaField: number[] = fv.map(() => 0);
  const weather = isWeather(d.site.weather) ? d.site.weather : null;

  if (weather) {
    // ---------------------------------------------------------------- anno tipo, ora per ora
    const lat = d.site.latitude;
    const lon = weather.lon;
    const normals = fv.map((x) => {
      const b = (x.tilt * Math.PI) / 180;
      const g = (x.azimuth * Math.PI) / 180;
      return { x: -Math.sin(b) * Math.sin(g), y: -Math.sin(b) * Math.cos(g), z: Math.cos(b), cosB: Math.cos(b) };
    });
    let i = 0;
    for (let m = 0; m < 12; m++) {
      const days = MONTH_DAYS[m]!;
      const acc = { prod: 0, cons: 0, self: 0, exp: 0, imp: 0, clip: 0, hpoa: 0 };
      const dayPv = new Array<number>(24).fill(0);
      const dayLoad = new Array<number>(24).fill(0);
      const daySoc = new Array<number>(24).fill(0);
      for (let k = 0; k < days * 24; k++, i++) {
        const n = Math.floor(i / 24) + 1;
        const utc = (i % 24) + 0.5;
        const solar = utc + lon / 15 + equationOfTime(n) / 60;
        const local = utc + 1 + dstOffset(n);
        const sp = sunPosition(lat, n, solar);
        const el = (sp.elevation * Math.PI) / 180;
        const az = (sp.azimuth * Math.PI) / 180;
        const sun = { x: -Math.sin(az) * Math.cos(el), y: -Math.cos(az) * Math.cos(el), z: Math.sin(el) };
        const visible = sp.elevation > 0 && sp.elevation >= horizonElevation(weather, sp.azimuth);
        const g = weather.g[i] ?? 0;
        const dni = visible ? Math.min(1100, weather.b[i] ?? 0) : 0;
        const dhi = weather.d[i] ?? 0;
        const poa = normals.map((nn, f) => {
          const cosI = Math.max(0, nn.x * sun.x + nn.y * sun.y + nn.z * sun.z);
          const v = Math.max(0, dni * cosI + (dhi * (1 + nn.cosB)) / 2 + (g * d.site.albedo * (1 - nn.cosB)) / 2);
          hPoaField[f]! += v / 1000;
          return v;
        });
        acc.hpoa += (poa[0] ?? 0) / 1000;
        const { p, clip } = acPower(poa, weather.t[i] ?? 15, 1);
        // L'anno tipo inizia di lunedì: serve solo a distinguere i giorni feriali dal fine settimana.
        const l = load(m, local, (n - 1) % 7);
        extrasWh += l.extra;
        const ld = l.base + l.extra;
        const r = balance(p, ld, 1, local, 1);
        acc.prod += p;
        acc.cons += ld;
        acc.self += r.self;
        acc.exp += r.exp;
        acc.imp += r.imp;
        acc.clip += clip;
        const hh = Math.floor(local) % 24;
        dayPv[hh]! += p / days;
        dayLoad[hh]! += ld / days;
        daySoc[hh]! += (capWh > 0 ? soc / capWh : 0) / days;
      }
      months.push({
        hPoa: acc.hpoa,
        productionKWh: acc.prod / 1000,
        consumptionKWh: acc.cons / 1000,
        selfKWh: acc.self / 1000,
        exportKWh: acc.exp / 1000,
        importKWh: acc.imp / 1000,
        clipKWh: acc.clip / 1000,
        pv: dayPv,
        load: dayLoad,
        soc: daySoc,
      });
    }
  } else {
    // ---------------------------------------------------------------- giorno medio di ogni mese, passi di 15 minuti
    for (let m = 0; m < 12; m++) {
      const suns = fv.map((x) => monthSun(d.site.latitude, m, d.site.hDay[m] ?? 0, x.tilt, x.azimuth, d.site.albedo));
      const days = MONTH_DAYS[m]!;
      const pvDay: number[] = [];
      const loadDay: number[] = [];
      let clipWh = 0;
      suns.forEach((s, f) => (hPoaField[f]! += s.hPoa * days));
      for (let i = 0; i < suns[0]!.poa.length; i++) {
        const hour = (i + 0.5) * STEP;
        // Temperatura dell'aria nel giorno: minima verso l'alba, massima verso le 15 (±5 °C, andamento semplificato).
        const ta = (d.site.tMean[m] ?? 15) + 5 * Math.cos((2 * Math.PI * (hour - 15)) / 24);
        const { p, clip } = acPower(
          suns.map((s) => s.poa[i]!),
          ta,
          STEP * days,
        );
        clipWh += clip * STEP;
        pvDay.push(p);
        const l = load(m, hour);
        extrasWh += l.extra * STEP * days;
        loadDay.push(l.base + l.extra);
      }
      // Bilancio del giorno medio con la batteria: due passate, la seconda parte dallo stato di carica di fine giornata.
      soc = capWh * 0.3;
      let self = 0;
      let exp = 0;
      let imp = 0;
      const socDay: number[] = [];
      const saved = bands.load.slice() as Bands;
      const savedSelf = bands.self.slice() as Bands;
      const savedImp = bands.import.slice() as Bands;
      for (let pass = 0; pass < 2; pass++) {
        self = exp = imp = 0;
        socDay.length = 0;
        bands.load = saved.slice() as Bands;
        bands.self = savedSelf.slice() as Bands;
        bands.import = savedImp.slice() as Bands;
        for (let i = 0; i < pvDay.length; i++) {
          const r = balance(pvDay[i]!, loadDay[i]!, STEP, (i + 0.5) * STEP, days);
          self += r.self;
          imp += r.imp;
          exp += r.exp;
          socDay.push(capWh > 0 ? soc / capWh : 0);
        }
      }
      const k = days / 1000;
      const prodWh = pvDay.reduce((a, b) => a + b, 0) * STEP;
      months.push({
        hPoa: suns[0]!.hPoa * days,
        productionKWh: prodWh * k,
        consumptionKWh: loadDay.reduce((a, b) => a + b, 0) * STEP * k,
        selfKWh: self * k,
        exportKWh: exp * k,
        importKWh: imp * k,
        clipKWh: clipWh * k,
        pv: pvDay,
        load: loadDay,
        soc: socDay,
      });
    }
  }

  const sum = (key: keyof MonthResult) => months.reduce((a, mm) => a + (mm[key] as number), 0);
  const production = sum('productionKWh');
  const consumption = sum('consumptionKWh');
  const self = sum('selfKWh');
  // Irraggiamento sui moduli: media delle falde pesata con la loro potenza.
  const hPoaYear = pstc > 0 ? hPoaField.reduce((a, h, k) => a + h * fieldPeak[k]!, 0) / pstc : 0;
  const kwh = (wh: number) => wh / 1000;
  const lossItems: LossItem[] = [
    { label: `Ombreggiamento (${f(d.site.shadingPct, 1)}%)`, kWh: kwh(L.shading) },
    { label: `Riflessione, spettro e basso irraggiamento (${f(d.losses.opticalPct, 1)}%)`, kWh: kwh(L.optical) },
    { label: `Temperatura delle celle (${MOUNTINGS[d.site.mounting]?.label.toLowerCase() ?? ''})`, kWh: kwh(L.temp) },
    { label: `Sporcamento (${f(d.losses.soilingPct, 1)}%)`, kWh: kwh(L.soiling) },
    { label: `Disaccoppiamento tra moduli (${f(mismatch, 1)}%${opt ? ', ridotto dagli ottimizzatori' : ''})`, kWh: kwh(L.mismatch) },
    { label: 'Cavi lato DC', kWh: kwh(L.dcCable) },
    ...(opt ? [{ label: 'Ottimizzatori (rendimento 99%)', kWh: kwh(L.optimizer) }] : []),
    { label: `Conversione dell'inverter (rendimento europeo ${f(inv.euroEff, 1)}%)`, kWh: kwh(L.inverter) },
    { label: "Limitazione di potenza dell'inverter", kWh: kwh(L.clip) },
    { label: 'Cavi lato AC', kWh: kwh(L.acCable) },
    { label: `Fermi e disponibilità (${f(d.losses.availabilityPct, 1)}%)`, kWh: kwh(L.avail) },
  ];
  return {
    months,
    hPoaYear,
    productionKWh: production,
    consumptionKWh: consumption,
    selfKWh: self,
    exportKWh: sum('exportKWh'),
    importKWh: sum('importKWh'),
    specificYield: pstc > 0 ? production / (pstc / 1000) : 0,
    pr: hPoaYear > 0 && pstc > 0 ? production / ((pstc / 1000) * hPoaYear) : 0,
    selfConsumptionPct: production > 0 ? (self / production) * 100 : 0,
    selfSufficiencyPct: consumption > 0 ? (self / consumption) * 100 : 0,
    idealKWh: kwh(ideal),
    losses: lossItems,
    hourly: !!weather,
    extrasKWh: kwh(extrasWh),
    bands,
  };
}

// ------------------------------------------------------------------ dimensionamento automatico

export interface SizingProposal {
  modulesPerString: number;
  strings: number;
  inverterId: string;
  /** Inverter uguali in parallelo */
  inverterCount: number;
  targetKWp: number;
  targetModules: number;
  note: string;
}

/**
 * Proposta: potenza di picco che produce in un anno circa quanto si consuma, poi la configurazione di stringhe valida
 * più vicina e l'inverter più piccolo con rapporto DC/AC ≤ 1,2. È un punto di partenza da rivedere.
 */
export function proposeSizing(d: PvDesign, inverters: PvDesign['inverter'][]): SizingProposal | null {
  // Resa di riferimento: una stringa di 10 moduli con un inverter che non limita la potenza.
  const one = computeYield({ ...d, modulesPerString: 10, strings: 1, batteryKWh: 0, inverter: { ...d.inverter, pacW: d.module.moduleWp * 20 } });
  const yieldPerKWp = one.specificYield;
  if (yieldPerKWp <= 0) return null;
  const targetKWp = d.consumption.annualKWh / yieldPerKWp;
  const target = Math.max(1, Math.round((targetKWp * 1000) / d.module.moduleWp));
  const cap = roofCapacity(d);
  if (isBusiness(d)) return proposeBusiness(d, inverters, target, targetKWp, yieldPerKWp, cap);
  const pool = inverters.filter((i) => i.hybrid === (d.batteryKWh > 0)).sort((a, b) => a.pacW - b.pacW);
  let best: { ns: number; np: number; inv: PvDesign['inverter']; score: number } | null = null;
  for (const inv of pool) {
    for (let np = 1; np <= inv.mppt * 2; np++) {
      for (let ns = 2; ns <= 30; ns++) {
        const cand: PvDesign = { ...d, inverter: inv, modulesPerString: ns, strings: np };
        if (generatorChecks(cand).some((c) => c.ok === false)) continue;
        if (cap !== null && ns * np > cap) continue;
        const ratio = peakW(cand) / inv.pacW;
        if (ratio > 1.2 || ratio < 0.8) continue;
        const score = Math.abs(ns * np - target) + (np - 1) * 0.3 + inv.pacW / 10000;
        if (!best || score < best.score) best = { ns, np, inv, score };
      }
    }
  }
  if (!best) return null;
  return {
    modulesPerString: best.ns,
    strings: best.np,
    inverterId: best.inv.id,
    inverterCount: 1,
    targetKWp,
    targetModules: target,
    note: `Con questo sito un kWp produce circa ${f(yieldPerKWp)} kWh all'anno: per coprire ${f(d.consumption.annualKWh)} kWh servono circa ${f(targetKWp, 2)} kWp (${target} moduli da ${d.module.moduleWp} Wp).`,
  };
}

/**
 * Azienda: inverter trifase (anche più di uno uguali), stringhe lunghe fino a 1000 V. Si cercano poche combinazioni
 * attorno al numero di moduli obiettivo, preferendo meno inverter e stringhe ripartite in modo uniforme sugli ingressi.
 */
function proposeBusiness(d: PvDesign, inverters: PvDesign['inverter'][], target: number, targetKWp: number, yieldPerKWp: number, cap: number | null): SizingProposal | null {
  const goal = cap !== null ? Math.min(target, cap) : target;
  const pool = inverters.filter((i) => isThreePhaseInverter(i) && !i.hybrid).sort((a, b) => a.pacW - b.pacW);
  let best: { ns: number; np: number; inv: PvDesign['inverter']; count: number; score: number } | null = null;
  for (const inv of pool) {
    for (let count = 1; count <= 20; count++) {
      const ac = inv.pacW * count;
      const r0 = (goal * d.module.moduleWp) / ac;
      if (r0 < 0.7 || r0 > 1.35) continue;
      for (let ns = 6; ns <= 30; ns++) {
        const np0 = Math.round(goal / ns);
        for (const np of [np0 - 1, np0, np0 + 1]) {
          if (np < 1) continue;
          if (cap !== null && ns * np > cap) continue;
          const cand: PvDesign = { ...d, inverter: inv, inverterCount: count, modulesPerString: ns, strings: np };
          const ratio = peakW(cand) / ac;
          if (ratio > 1.25 || ratio < 0.8) continue;
          const checks = generatorChecks(cand);
          if (checks.some((c) => c.ok === false)) continue;
          const uneven = checks.some((c) => c.id === 'mppt' && c.ok === null);
          // Rapporto DC/AC attorno a 1,1: inverter né sottoutilizzati né troppo piccoli.
          const score = Math.abs(ns * np - goal) + count * 3 + (uneven ? 4 : 0) + Math.abs(ratio - 1.1) * 40 + inv.pacW / 200000;
          if (!best || score < best.score) best = { ns, np, inv, count, score };
        }
      }
    }
  }
  if (!best) return null;
  return {
    modulesPerString: best.ns,
    strings: best.np,
    inverterId: best.inv.id,
    inverterCount: best.count,
    targetKWp,
    targetModules: target,
    note: `Con questo sito un kWp produce circa ${f(yieldPerKWp)} kWh all'anno: per coprire ${f(d.consumption.annualKWh)} kWh servono circa ${f(targetKWp, 1)} kWp (${target} moduli da ${d.module.moduleWp} Wp)${cap !== null && cap < target ? `, ma sul tetto ne stanno ${cap}` : ''}.`,
  };
}

// ------------------------------------------------------------------ costi e ritorno dell'investimento

export interface CostLine {
  id: PriceId;
  label: string;
  qty: number;
  unit: string;
  price: number;
  total: number;
}

export interface Economics {
  lines: CostLine[];
  subtotal: number;
  vat: number;
  total: number;
  perKWp: number;
  deductionTotal: number;
  /** Detrazione davvero recuperata (rate limitate dall'IRPEF) e quella persa [€] */
  deductionUsed: number;
  deductionLost: number;
  /** Contributo a fondo perduto [€] */
  grant: number;
  /** Beneficio del primo anno: energia non acquistata + energia venduta [€] */
  firstYearSaving: number;
  firstYearExport: number;
  /** Incentivo della comunità energetica nel primo anno [€] */
  firstYearCer: number;
  billBefore: number;
  billAfter: number;
  cashflow: { year: number; flow: number; cumulative: number }[];
  paybackYears: number | null;
  npv: number;
  /** Costo dell'energia prodotta, attualizzato [€/kWh] */
  lcoe: number;
  /** Flussi al netto delle imposte (azienda) */
  afterTax: boolean;
  /** IVA compresa nel costo (no se l'azienda la detrae) */
  vatIncluded: boolean;
  /** Primo anno: imposte in più sul risparmio e risparmio di imposte da ammortamento e iperammortamento [€] */
  firstYearTax: number;
  firstYearShield: number;
  /** Risparmio di imposte complessivo dell'ammortamento e della sola maggiorazione dell'iperammortamento [€] */
  shieldTotal: number;
  hyperTotal: number;
}

export function computeEconomics(d: PvDesign, y: YieldResult): Economics {
  const price = (id: PriceId) => d.economics.prices.find((p) => p.id === id)?.price ?? 0;
  const label = (id: PriceId) => d.economics.prices.find((p) => p.id === id);
  const fv = fields(d);
  const fuses = fv.reduce((a, x) => a + (dcProtection(fieldDesign(d, x)).fusesNeeded ? x.strings : 0), 0);
  const totalStrings = fv.reduce((a, x) => a + x.strings, 0);
  const kwp = peakW(d) / 1000;
  const items: [PriceId, number][] = [
    ['module', peakW(d)],
    ['inverter', acPowerW(d) / 1000],
    ['battery', batteryActive(d) ? d.batteryKWh : 0],
    ['mounting', moduleCount(d)],
    ['dcCable', totalStrings * 2 * d.cables.dcLengthM],
    ['acCable', (threePhase(d) ? 4 : 3) * d.cables.acLengthM],
    ['dcBox', inverterUnits(d)],
    ['stringFuse', fuses],
    ['acBox', 1],
    ['labour', kwp],
    ['design', 1],
    ['optimizer', d.optimizers ? moduleCount(d) : 0],
    // Oltre 11,08 kW la protezione di interfaccia è esterna; oltre 100 kW la connessione è in media tensione.
    ['spi', acPowerW(d) > 11080 ? 1 : 0],
    ['mtWorks', acPowerW(d) > 100000 ? 1 : 0],
  ];
  const lines: CostLine[] = items
    .filter(([, q]) => q > 0)
    .filter(([id]) => !!label(id))
    .map(([id, qty]) => {
      const p = label(id)!;
      return { id, label: p.label, qty, unit: p.unit, price: p.price, total: qty * p.price };
    });
  const base = lines.reduce((a, l) => a + l.total, 0);
  const misc = base * (price('misc') / 100);
  const m = label('misc')!;
  lines.push({ id: 'misc', label: m.label, qty: price('misc'), unit: m.unit, price: base / 100, total: misc });
  const subtotal = base + misc;
  const vat = subtotal * (d.economics.vatPct / 100);
  const e = d.economics;
  const biz = isBusiness(d);
  const bt = e.business;
  // Un'azienda che detrae l'IVA la recupera: il costo dell'impianto è l'imponibile.
  const vatIncluded = !(biz && bt.vatRecoverable);
  const total = subtotal + (vatIncluded ? vat : 0);
  const deductionTotal = biz ? 0 : total * (e.deductionPct / 100);
  const inverterCost = (acPowerW(d) / 1000) * price('inverter') * (vatIncluded ? 1 + e.vatPct / 100 : 1);
  // Prezzo dell'energia prelevata: unico o per fasce F1, F2, F3.
  const bp: Bands = e.tariff === 'fasce' ? e.bandPrices : [e.importPrice, e.importPrice, e.importPrice];
  const byBand = (v: Bands) => v.reduce((a, x, i) => a + x * bp[i]!, 0);
  const selfValue = byBand(y.bands.self);
  const exportValue = y.exportKWh * e.exportPrice;
  // Comunità energetica: incentivo sull'energia condivisa per 20 anni.
  // Con un contributo in conto capitale la tariffa cala in proporzione: con il 40% si dimezza, oltre il 40% non spetta.
  const grant = total * (e.grantPct / 100);
  const cerValue = e.cer ? y.exportKWh * (e.cerSharedPct / 100) * e.cerIncentive * Math.max(0, 1 - e.grantPct / 80) : 0;
  const saving = (k: number) => {
    const deg = (1 - d.losses.degradationPct / 100) ** (k - 1);
    const infl = (1 + e.energyInflationPct / 100) ** (k - 1);
    return deg * infl * (selfValue + exportValue) + (k <= 20 ? deg * cerValue : 0);
  };
  // Azienda: il risparmio e i ricavi aumentano l'utile e quindi le imposte (IRES e IRAP); l'impianto si ammortizza
  // (metà quota nel primo esercizio) e la maggiorazione dell'iperammortamento si deduce solo dall'IRES.
  const taxRate = biz ? (bt.iresPct + bt.irapPct) / 100 : 0;
  const depBase = total - grant;
  const depShares: number[] = [];
  for (let k = 1, left = 1; k <= e.years; k++) {
    const q = Math.min(left, ((k === 1 ? 0.5 : 1) * Math.max(0, bt.depreciationPct)) / 100);
    depShares.push(biz ? q : 0);
    left -= q;
  }
  let shieldTotal = 0;
  let hyperTotal = 0;
  let firstYearTax = 0;
  let firstYearShield = 0;
  const cashflow: Economics['cashflow'] = [{ year: 0, flow: grant - total, cumulative: grant - total }];
  let cum = grant - total;
  let npv = grant - total;
  let pvCost = total - grant;
  let dedUsed = 0;
  let pvEnergy = 0;
  let payback: number | null = null;
  for (let k = 1; k <= e.years; k++) {
    // La rata oltre l'IRPEF dell'anno non si recupera.
    const rate = k <= e.deductionYears && e.deductionYears > 0 ? deductionTotal / e.deductionYears : 0;
    const ded = e.taxPerYear > 0 ? Math.min(rate, e.taxPerYear) : rate;
    dedUsed += ded;
    const cost = e.omPerYear + (k === e.inverterReplaceYear ? inverterCost : 0);
    const share = depShares[k - 1] ?? 0;
    const hyper = share * depBase * (bt.hyperPct / 100) * (bt.iresPct / 100);
    const shield = share * depBase * taxRate + (biz ? hyper : 0);
    const tax = taxRate * (saving(k) - cost);
    if (biz) {
      shieldTotal += shield;
      hyperTotal += hyper;
    }
    if (k === 1) {
      firstYearTax = tax;
      firstYearShield = shield;
    }
    const flow = saving(k) + ded - cost - tax + shield;
    const prev = cum;
    cum += flow;
    const disc = (1 + e.discountPct / 100) ** k;
    npv += flow / disc;
    pvCost += (cost - ded) / disc;
    pvEnergy += (y.productionKWh * (1 - d.losses.degradationPct / 100) ** (k - 1)) / disc;
    if (payback === null && cum >= 0 && flow > 0) payback = k - 1 + -prev / flow;
    cashflow.push({ year: k, flow, cumulative: cum });
  }
  return {
    lines,
    subtotal,
    vat,
    total,
    perKWp: kwp > 0 ? total / kwp : 0,
    deductionTotal,
    deductionUsed: dedUsed,
    deductionLost: deductionTotal - dedUsed,
    grant,
    firstYearSaving: selfValue,
    firstYearExport: exportValue,
    firstYearCer: cerValue,
    billBefore: byBand(y.bands.load),
    billAfter: byBand(y.bands.import) - exportValue,
    cashflow,
    paybackYears: payback,
    npv,
    lcoe: pvEnergy > 0 ? pvCost / pvEnergy : 0,
    afterTax: biz,
    vatIncluded,
    firstYearTax,
    firstYearShield,
    shieldTotal,
    hyperTotal,
  };
}

// ------------------------------------------------------------------ accumulo consigliato

/** Capacità proposte per la batteria [kWh]. */
export const BATTERY_OPTIONS = [0, 2.5, 5, 7.5, 10, 12.5, 15] as const;
/**
 * Soglia per il consiglio: un kWh di batteria in più deve accumulare e restituire almeno questa energia in un anno
 * (circa 100 cicli completi). Sotto, la capacità aggiunta resterebbe quasi sempre inutilizzata.
 */
export const BATTERY_MIN_KWH_PER_KWH = 100;

/** Inverter ibrido adatto: il più piccolo con potenza almeno pari a quella attuale (o il più grande disponibile). */
export function hybridFor(d: PvDesign): PvDesign['inverter'] {
  if (isHybrid(d)) return d.inverter;
  const hy = INVERTERS.filter((i) => i.hybrid).sort((a, b) => a.pacW - b.pacW);
  return { ...(hy.find((i) => i.pacW >= d.inverter.pacW) ?? hy[hy.length - 1]!) };
}

/** Progetto con la batteria indicata (passa all'inverter ibrido se serve; in un'azienda l'accumulo è collegato in alternata). */
export function withBattery(d: PvDesign, kWh: number): PvDesign {
  if (isBusiness(d)) return { ...d, batteryKWh: kWh };
  return kWh > 0 ? { ...d, batteryKWh: kWh, inverter: hybridFor(d) } : { ...d, batteryKWh: 0 };
}

/** Capacità da provare: per un'abitazione quelle fisse, per un'azienda in proporzione alla potenza dei moduli. */
export function batteryOptions(d: PvDesign): number[] {
  if (!isBusiness(d)) return [...BATTERY_OPTIONS];
  const kwp = peakW(d) / 1000;
  const list = [0.25, 0.5, 1, 1.5, 2].map((k) => Math.max(5, Math.round((kwp * k) / 5) * 5));
  return [0, ...list.filter((v, i) => list.indexOf(v) === i)];
}

export interface BatteryOption {
  kWh: number;
  selfConsumptionPct: number;
  selfSufficiencyPct: number;
  /** Energia prodotta e usata in casa in un anno [kWh] */
  selfKWh: number;
  /** Spesa in più rispetto all'impianto senza batteria, IVA inclusa [€] */
  extraCost: number;
  paybackYears: number | null;
  npv: number;
  /** Energia usata in più per ogni kWh aggiunto rispetto alla capacità precedente [kWh/anno per kWh] */
  marginal: number | null;
}

export interface BatteryAdvice {
  options: BatteryOption[];
  recommended: number;
  reason: string;
}

/**
 * Consiglio sull'accumulo: si simula l'anno con ogni capacità e si guarda quanta energia in più viene usata in casa
 * per ogni kWh aggiunto. La capacità consigliata è la più grande per cui il kWh aggiunto supera la soglia.
 * È un criterio tecnico (uso della batteria), non economico: il rientro è mostrato a parte per ogni capacità.
 */
export function batteryAdvice(d: PvDesign): BatteryAdvice {
  const options: BatteryOption[] = [];
  let base: { total: number } | null = null;
  const sizes = batteryOptions(d);
  for (const kWh of sizes) {
    const dd = withBattery(d, kWh);
    const y = computeYield(dd);
    const e = computeEconomics(dd, y);
    if (!base) base = { total: e.total };
    const prev = options[options.length - 1];
    options.push({
      kWh,
      selfConsumptionPct: y.selfConsumptionPct,
      selfSufficiencyPct: y.selfSufficiencyPct,
      selfKWh: y.selfKWh,
      extraCost: e.total - base.total,
      paybackYears: e.paybackYears,
      npv: e.npv,
      marginal: prev ? (y.selfKWh - prev.selfKWh) / (kWh - prev.kWh) : null,
    });
  }
  let recommended = 0;
  for (const o of options.slice(1)) {
    if ((o.marginal ?? 0) >= BATTERY_MIN_KWH_PER_KWH) recommended = o.kWh;
    else break;
  }
  const rec = options.find((o) => o.kWh === recommended)!;
  const next = options.find((o) => o.kWh > recommended);
  const reason =
    recommended === 0
      ? `Con questi consumi e questa produzione resta poca energia da conservare: già i primi ${f(sizes[1] ?? 0, 1)} kWh di batteria accumulerebbero circa ${f(options[1]?.marginal ?? 0)} kWh all'anno per kWh, cioè pochi cicli. Meglio spostare i consumi nelle ore di sole o aumentare i moduli.`
      : `Fino a ${f(recommended, 1)} kWh ogni kWh di batteria accumula almeno ${f(BATTERY_MIN_KWH_PER_KWH)} kWh all'anno e l'autosufficienza sale al ${f(rec.selfSufficiencyPct)}%.${next ? ` Oltre, ogni kWh in più ne accumulerebbe solo ${f(next.marginal ?? 0)} all'anno.` : ''}`;
  return { options, recommended, reason };
}

/** Tutti i risultati del progetto. */
export function computeDesign(d: PvDesign) {
  const yieldRes = computeYield(d);
  return {
    checks: generatorChecks(d),
    dc: dcCable(d),
    ac: acCable(d),
    protection: dcProtection(d),
    yield: yieldRes,
    economics: computeEconomics(d, yieldRes),
  };
}
export type DesignResults = ReturnType<typeof computeDesign>;
