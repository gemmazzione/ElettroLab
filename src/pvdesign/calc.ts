import { stringChecks, type PvCheck } from '../engine/pv';
import { RHO_CU_70 } from '../model/constants';
import type { InverterParams, PvArrayParams, WireSection } from '../model/types';
import { ampacity, tempFactor } from '../rules/ampacity';
import { LOAD_PROFILES, MOUNTINGS, MONTH_DAYS, MONTH_LOAD_WEIGHTS, MONTH_REP_DAY, SOLAR_CABLE_AMPACITY, SOLAR_CABLE_SECTIONS, type PriceId } from './data';
import { isHybrid, type PvDesign } from './design';

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

export function declination(n: number): number {
  return 23.45 * Math.sin(RAD * ((360 * (284 + n)) / 365));
}

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
  batteryKWh: isHybrid(d) ? d.batteryKWh : 0,
  batteryW: isHybrid(d) && d.batteryKWh > 0 ? batteryPowerW(d) : 0,
});

/** Potenza di carica/scarica della batteria: circa 0,5 C, al massimo la potenza dell'inverter (indicativo). */
export const batteryPowerW = (d: PvDesign) => Math.min(d.inverter.pacW, d.batteryKWh * 500);

export const moduleCount = (d: PvDesign) => d.modulesPerString * d.strings;
export const peakW = (d: PvDesign) => moduleCount(d) * d.module.moduleWp;
/** Stringhe collegate allo stesso ingresso MPPT (ripartite in modo uniforme). */
export const stringsPerMppt = (d: PvDesign) => Math.ceil(d.strings / Math.max(1, d.inverter.mppt));

export function generatorChecks(d: PvDesign): PvCheck[] {
  const env = { irradiance: 1000, ambientC: 25, minAmbientC: d.site.tMin, maxAmbientC: d.site.tMax };
  const perInput = stringChecks(arrayParams(d, stringsPerMppt(d)), inverterParams(d), env).filter((c) => c.id !== 'dc-ac');
  const ratio = peakW(d) / d.inverter.pacW;
  const out: PvCheck[] = [
    ...perInput.map((c) => (c.id === 'isc-max' ? { ...c, title: `${c.title} (per ingresso MPPT)` } : c)),
    {
      id: 'mppt',
      title: 'Stringhe e ingressi MPPT',
      ok: d.strings <= d.inverter.mppt || d.strings % Math.max(1, d.inverter.mppt) === 0 ? true : null,
      detail: `${d.strings} stringhe su ${d.inverter.mppt} ingressi MPPT: ${stringsPerMppt(d)} per ingresso. Con stringhe in parallelo sullo stesso ingresso le stringhe devono essere uguali (stesso numero di moduli, stessa esposizione).`,
    },
    {
      id: 'dc-ac',
      title: 'Rapporto potenza DC / AC',
      ok: ratio >= 0.8 && ratio <= 1.3 ? true : null,
      detail: `${f(peakW(d))} Wp / ${f(d.inverter.pacW)} W = ${f(ratio, 2)}. Valori tra circa 0,8 e 1,3 sono comuni (indicazione di massima): sopra, l'inverter taglia la potenza nelle ore migliori; sotto, è sovradimensionato.`,
    },
    {
      id: 'contract',
      title: 'Potenza dell\'inverter e potenza della fornitura',
      ok: d.inverter.pacW <= Math.max(d.consumption.contractKW, 6) * 1000 ? true : null,
      detail: `Inverter ${f(d.inverter.pacW / 1000, 1)} kW, fornitura ${f(d.consumption.contractKW, 1)} kW. La potenza immettibile e l'eventuale adeguamento della connessione vanno concordati con il distributore (CEI 0-21, riferimento non verificato su testo).`,
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
  if (d.batteryKWh > 0 && !isHybrid(d)) {
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
export function acCable(d: PvDesign): CableSizing & { inA: number } {
  const ib = d.inverter.pacW / 230;
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
    `Corrente d'impiego Ib = ${f(d.inverter.pacW)} W / 230 V = ${f(ib, 1)} A (fattore di potenza 1).`,
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
  /** Andamento del giorno medio a passi di 15 minuti [W] */
  pv: number[];
  load: number[];
  soc: number[];
}

export interface LossItem {
  label: string;
  kWh: number;
}

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
}

export function computeYield(d: PvDesign): YieldResult {
  const pstc = peakW(d);
  const dc = dcCable(d);
  const ac = acCable(d);
  const inv = d.inverter;
  const eta = inv.euroEff / 100;
  const prof = LOAD_PROFILES[d.consumption.profile].weights;
  const profSum = prof.reduce((a, b) => a + b, 0);
  const mw = MONTH_LOAD_WEIGHTS.map((w, i) => w * MONTH_DAYS[i]!);
  const mwSum = mw.reduce((a, b) => a + b, 0);
  const battery = isHybrid(d) && d.batteryKWh > 0;
  const capWh = battery ? d.batteryKWh * 1000 * BATTERY_USABLE : 0;
  const pBat = battery ? batteryPowerW(d) : 0;
  const etaOneWay = Math.sqrt(BATTERY_ROUND_TRIP);
  const extraC = MOUNTINGS[d.site.mounting]?.extraC ?? 0;
  const L = { shading: 0, optical: 0, temp: 0, soiling: 0, mismatch: 0, dcCable: 0, inverter: 0, clip: 0, acCable: 0, avail: 0 };
  let ideal = 0;
  const months: MonthResult[] = [];
  const avail = 1 - d.losses.availabilityPct / 100;
  for (let m = 0; m < 12; m++) {
    const sun = monthSun(d.site.latitude, m, d.site.hDay[m] ?? 0, d.site.tilt, d.site.azimuth, d.site.albedo);
    const days = MONTH_DAYS[m]!;
    const dayLoadWh = ((d.consumption.annualKWh * 1000 * mw[m]!) / mwSum) / days;
    const pvDay: number[] = [];
    const loadDay: number[] = [];
    let clipWh = 0;
    for (let i = 0; i < sun.poa.length; i++) {
      const hour = (i + 0.5) * STEP;
      const g = sun.poa[i]!;
      const p0 = (pstc * g) / 1000;
      ideal += p0 * STEP * days;
      // Temperatura dell'aria nel giorno: minima verso l'alba, massima verso le 15 (±5 °C, andamento semplificato).
      const ta = (d.site.tMean[m] ?? 15) + 5 * Math.cos((2 * Math.PI * (hour - 15)) / 24);
      const tc = ta + ((d.module.noct - 20) / 800 + extraC / 1000) * g;
      let p = p0;
      const step = (key: keyof typeof L, next: number) => {
        L[key] += (p - next) * STEP * days;
        p = next;
      };
      step('shading', p * (1 - d.site.shadingPct / 100));
      step('optical', p * (1 - d.losses.opticalPct / 100));
      step('temp', Math.max(0, p * (1 + (d.module.tcPmax / 100) * (tc - 25))));
      step('soiling', p * (1 - d.losses.soilingPct / 100));
      step('mismatch', p * (1 - d.losses.mismatchPct / 100));
      // Le perdite nei cavi crescono col quadrato della corrente: in percentuale sono proporzionali alla potenza.
      step('dcCable', p * (1 - (dc.lossPct / 100) * (p / pstc)));
      step('inverter', p * eta);
      const clipped = Math.min(p, inv.pacW);
      clipWh += (p - clipped) * STEP;
      step('clip', clipped);
      step('acCable', p * (1 - (ac.lossPct / 100) * (p / inv.pacW)));
      step('avail', p * avail);
      pvDay.push(p);
      loadDay.push((dayLoadWh * prof[Math.floor(hour)]!) / profSum);
    }
    // Bilancio del giorno medio con la batteria: due passate, la seconda parte dallo stato di carica di fine giornata.
    let soc = capWh * 0.3;
    let self = 0;
    let exp = 0;
    let imp = 0;
    const socDay: number[] = [];
    for (let pass = 0; pass < 2; pass++) {
      self = exp = imp = 0;
      socDay.length = 0;
      for (let i = 0; i < pvDay.length; i++) {
        const pvI = pvDay[i]!;
        const loadI = loadDay[i]!;
        let net = loadI - pvI;
        const direct = Math.min(pvI, loadI);
        let fromBat = 0;
        if (capWh > 0 && net < 0) {
          const charge = Math.min(-net, pBat, (capWh - soc) / (STEP * etaOneWay));
          soc += charge * STEP * etaOneWay;
          net += charge;
        } else if (capWh > 0 && net > 0) {
          const out = Math.min(net, pBat, (soc * etaOneWay) / STEP);
          soc -= (out * STEP) / etaOneWay;
          net -= out;
          fromBat = out;
        }
        self += (direct + fromBat) * STEP;
        if (net > 0) imp += net * STEP;
        else exp += -net * STEP;
        socDay.push(capWh > 0 ? soc / capWh : 0);
      }
    }
    const prodWh = pvDay.reduce((a, b) => a + b, 0) * STEP;
    const k = days / 1000;
    months.push({
      hPoa: sun.hPoa * days,
      productionKWh: prodWh * k,
      consumptionKWh: dayLoadWh * k,
      selfKWh: self * k,
      exportKWh: exp * k,
      importKWh: imp * k,
      clipKWh: clipWh * k,
      pv: pvDay,
      load: loadDay,
      soc: socDay,
    });
  }
  const sum = (key: keyof MonthResult) => months.reduce((a, mm) => a + (mm[key] as number), 0);
  const production = sum('productionKWh');
  const consumption = sum('consumptionKWh');
  const self = sum('selfKWh');
  const hPoaYear = sum('hPoa');
  const kwh = (wh: number) => wh / 1000;
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
    losses: [
      { label: `Ombreggiamento (${f(d.site.shadingPct, 1)}%)`, kWh: kwh(L.shading) },
      { label: `Riflessione, spettro e basso irraggiamento (${f(d.losses.opticalPct, 1)}%)`, kWh: kwh(L.optical) },
      { label: `Temperatura delle celle (${MOUNTINGS[d.site.mounting]?.label.toLowerCase() ?? ''})`, kWh: kwh(L.temp) },
      { label: `Sporcamento (${f(d.losses.soilingPct, 1)}%)`, kWh: kwh(L.soiling) },
      { label: `Disaccoppiamento tra moduli (${f(d.losses.mismatchPct, 1)}%)`, kWh: kwh(L.mismatch) },
      { label: 'Cavi lato DC', kWh: kwh(L.dcCable) },
      { label: `Conversione dell'inverter (rendimento europeo ${f(inv.euroEff, 1)}%)`, kWh: kwh(L.inverter) },
      { label: 'Limitazione di potenza dell\'inverter', kWh: kwh(L.clip) },
      { label: 'Cavi lato AC', kWh: kwh(L.acCable) },
      { label: `Fermi e disponibilità (${f(d.losses.availabilityPct, 1)}%)`, kWh: kwh(L.avail) },
    ],
  };
}

// ------------------------------------------------------------------ dimensionamento automatico

export interface SizingProposal {
  modulesPerString: number;
  strings: number;
  inverterId: string;
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
  const pool = inverters.filter((i) => i.hybrid === (d.batteryKWh > 0)).sort((a, b) => a.pacW - b.pacW);
  let best: { ns: number; np: number; inv: PvDesign['inverter']; score: number } | null = null;
  for (const inv of pool) {
    for (let np = 1; np <= inv.mppt * 2; np++) {
      for (let ns = 2; ns <= 30; ns++) {
        const cand: PvDesign = { ...d, inverter: inv, modulesPerString: ns, strings: np };
        if (generatorChecks(cand).some((c) => c.ok === false)) continue;
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
    targetKWp,
    targetModules: target,
    note: `Con questo sito un kWp produce circa ${f(yieldPerKWp)} kWh all'anno: per coprire ${f(d.consumption.annualKWh)} kWh servono circa ${f(targetKWp, 2)} kWp (${target} moduli da ${d.module.moduleWp} Wp).`,
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
  /** Beneficio del primo anno: energia non acquistata + energia venduta [€] */
  firstYearSaving: number;
  firstYearExport: number;
  billBefore: number;
  billAfter: number;
  cashflow: { year: number; flow: number; cumulative: number }[];
  paybackYears: number | null;
  npv: number;
  /** Costo dell'energia prodotta, attualizzato [€/kWh] */
  lcoe: number;
}

export function computeEconomics(d: PvDesign, y: YieldResult): Economics {
  const price = (id: PriceId) => d.economics.prices.find((p) => p.id === id)?.price ?? 0;
  const label = (id: PriceId) => d.economics.prices.find((p) => p.id === id);
  const prot = dcProtection(d);
  const kwp = peakW(d) / 1000;
  const items: [PriceId, number][] = [
    ['module', peakW(d)],
    ['inverter', d.inverter.pacW / 1000],
    ['battery', isHybrid(d) ? d.batteryKWh : 0],
    ['mounting', moduleCount(d)],
    ['dcCable', d.strings * 2 * d.cables.dcLengthM],
    ['acCable', 3 * d.cables.acLengthM],
    ['dcBox', 1],
    ['stringFuse', prot.fusesNeeded ? d.strings : 0],
    ['acBox', 1],
    ['labour', kwp],
    ['design', 1],
  ];
  const lines: CostLine[] = items
    .filter(([, q]) => q > 0)
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
  const total = subtotal + vat;
  const e = d.economics;
  const deductionTotal = total * (e.deductionPct / 100);
  const inverterCost = (d.inverter.pacW / 1000) * price('inverter') * (1 + e.vatPct / 100);
  const saving = (k: number) => {
    const deg = (1 - d.losses.degradationPct / 100) ** (k - 1);
    const infl = (1 + e.energyInflationPct / 100) ** (k - 1);
    return deg * infl * (y.selfKWh * e.importPrice + y.exportKWh * e.exportPrice);
  };
  const cashflow: Economics['cashflow'] = [{ year: 0, flow: -total, cumulative: -total }];
  let cum = -total;
  let npv = -total;
  let pvCost = total;
  let pvEnergy = 0;
  let payback: number | null = null;
  for (let k = 1; k <= e.years; k++) {
    const ded = k <= e.deductionYears && e.deductionYears > 0 ? deductionTotal / e.deductionYears : 0;
    const cost = e.omPerYear + (k === e.inverterReplaceYear ? inverterCost : 0);
    const flow = saving(k) + ded - cost;
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
    firstYearSaving: y.selfKWh * e.importPrice,
    firstYearExport: y.exportKWh * e.exportPrice,
    billBefore: y.consumptionKWh * e.importPrice,
    billAfter: y.importKWh * e.importPrice - y.exportKWh * e.exportPrice,
    cashflow,
    paybackYears: payback,
    npv,
    lcoe: pvEnergy > 0 ? pvCost / pvEnergy : 0,
  };
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
