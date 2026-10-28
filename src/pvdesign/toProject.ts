import type { InverterParams, Project, WireSection } from '../model/types';
import { fotovoltaico } from '../projects/demos';
import { acCable, arrayParams, dcCable, f, inverterParams, peakW } from './calc';
import type { PvDesign } from './design';

/**
 * Progetto del laboratorio costruito dal progetto fotovoltaico: lo schema della demo «Casa con fotovoltaico»
 * con il generatore, l'inverter, le sezioni e le lunghezze dei cavi e la protezione della linea calcolati.
 * Il modello del laboratorio ha un solo ingresso DC: le stringhe sono messe in parallelo su quell'ingresso
 * e la corrente massima dell'inverter è la somma di quella dei suoi ingressi MPPT.
 */
export function designToProject(d: PvDesign): Project {
  const p = fotovoltaico();
  const dc = dcCable(d);
  const ac = acCable(d);
  p.name = d.name;
  p.description =
    `Generato da «Progetta FV»: ${d.strings} × ${d.modulesPerString} moduli da ${d.module.moduleWp} Wp (${f(peakW(d) / 1000, 2)} kWp), inverter ${d.inverter.label}. ` +
    `Cavi DC ${dc.section} mm² da ${f(d.cables.dcLengthM)} m, linea AC ${ac.section} mm² da ${f(d.cables.acLengthM)} m protetta da ${ac.inA} A. ` +
    (d.inverter.mppt > 1 ? `Il laboratorio ha un solo ingresso DC: le stringhe sono in parallelo e la corrente massima in ingresso è la somma dei ${d.inverter.mppt} MPPT. ` : '') +
    'Avvia la simulazione e cambia l\'irraggiamento nelle proprietà dell\'inverter.';
  p.pv = { irradiance: 800, ambientC: 25, minAmbientC: d.site.tMin, maxAmbientC: d.site.tMax };
  const ip = inverterParams(d);
  const invP: InverterParams = {
    pacW: ip.pacW,
    efficiency: ip.efficiency,
    maxDcV: ip.maxDcV,
    mpptMinV: ip.mpptMinV,
    mpptMaxV: ip.mpptMaxV,
    maxDcA: ip.maxDcA * Math.max(1, d.inverter.mppt),
    batteryKWh: ip.batteryKWh,
    batteryW: ip.batteryW,
  };
  const ids = { arr: '', inv: '', qdc: '', pm: '', qfv: '' };
  for (const c of p.components) {
    if (c.params.kind === 'supply') c.params.p.contractKW = d.consumption.contractKW;
    if (c.params.kind === 'pv-array') {
      c.params.p = { ...arrayParams(d), name: 'Generatore fotovoltaico' };
      ids.arr = c.id;
    }
    if (c.params.kind === 'inverter') {
      c.params.p = invP;
      ids.inv = c.id;
    }
    if (c.params.kind === 'dc-switch') ids.qdc = c.id;
    if (c.params.kind === 'meter') ids.pm = c.id;
    if (c.label === 'QFV' && c.params.kind === 'rcbo') {
      c.params.p = { ...c.params.p, in: ac.inA };
      ids.qfv = c.id;
    }
  }
  const own = (w: { from: string; to: string }, a: string, b: string) =>
    (w.from.startsWith(`${a}:`) && w.to.startsWith(`${b}:`)) || (w.from.startsWith(`${b}:`) && w.to.startsWith(`${a}:`));
  for (const w of p.wires) {
    if (own(w, ids.arr, ids.qdc) && !w.to.endsWith(':PE') && !w.from.endsWith(':PE')) {
      w.section = dc.section as WireSection;
      w.length = d.cables.dcLengthM;
    }
    if (own(w, ids.pm, ids.inv) || own(w, ids.qfv, ids.pm)) {
      w.section = ac.section as WireSection;
      if (own(w, ids.pm, ids.inv)) w.length = d.cables.acLengthM;
    }
  }
  return p;
}
