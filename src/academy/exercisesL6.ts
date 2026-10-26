import { dcVoltageBetween } from '../engine/measure';
import { stringChecks, maxStringVoc, pvEnv } from '../engine/pv';
import { inverterDay } from '../engine/pvDay';
import { simulate } from '../engine/simulate';
import { insulationResistance, loopImpedance } from '../engine/verify';
import type { ComponentInstance, Project } from '../model/types';
import { addLoad, contattore, fotovoltaico, monolocale, ProjectBuilder, setMcb, t } from '../projects/demos';
import type { CheckOutcome, Exercise } from './types';

/** Livello 6: fotovoltaico, comandi e verifiche strumentali. */

const inverter = (p: Project) => p.components.find((c) => c.params.kind === 'inverter');
const arrayOf = (p: Project) => p.components.find((c) => c.params.kind === 'pv-array');

/** Simulazione con le protezioni chiuse e i comandi nella posizione indicata. */
function simWith(p: Project, pos: (c: ComponentInstance) => boolean | undefined) {
  return simulate(p, { closed: (c) => pos(c) ?? (c.params.kind === 'wall-switch' || c.params.kind === 'button' ? c.closed : true) });
}

const lampOnWith = (p: Project, lampName: string, pos: (c: ComponentInstance) => boolean | undefined): boolean | null => {
  const lamp = p.components.find((c) => c.params.kind === 'load' && c.params.p.name === lampName);
  const r = simWith(p, pos);
  if (!lamp || !r.ok) return null;
  return r.loads.get(lamp.id)?.energized ?? null;
};

// ------------------------------------------------------------------ deviatori

function deviatoriBase(): Project {
  const b = new ProjectBuilder('Esercizio: luce da due punti', 1, 12);
  b.project.description = 'Collega i due deviatori in modo che la luce delle scale si accenda e si spenga da entrambi i punti.';
  const cnt = b.add('supply-mono', { position: { x: -280, y: 30 } });
  const earth = b.add('earth', { position: { x: -260, y: 300 } });
  const q1 = b.add('rcbo-1pn', { rail: { row: 0, slot: 0 } }, (c) => {
    setMcb(c, 10);
    c.closed = true;
  });
  const xpe = b.add('bar-pe-8', { rail: { row: 0, slot: 8 } });
  b.add('wall-deviatore', { position: { x: 0, y: 380 } }, (c) => {
    if (c.params.kind === 'wall-switch') c.params.p.name = 'Scale, piano terra';
  });
  b.add('wall-deviatore', { position: { x: 260, y: 380 } }, (c) => {
    if (c.params.kind === 'wall-switch') c.params.p.name = 'Scale, primo piano';
  });
  const lamp = addLoad(b, { catalogId: 'load-luce', name: 'Luce scale', powerW: 60, section: 1.5, length: 10 }, 130, 560, 1);
  b.wire(t(cnt, 'L'), t(q1, 'p0_in'), 6, 8).wire(t(cnt, 'N'), t(q1, 'p1_in'), 6, 8);
  b.wire(t(q1, 'p1_out'), t(lamp, 'N'), 1.5, 10);
  b.wire(t(earth, 'PE'), t(xpe, 't0'), 6, 5).wire(t(xpe, 't1'), t(lamp, 'PE'), 1.5, 10);
  return b.project;
}

const deviatori: Exercise = {
  id: 'l6-deviatori',
  level: 6,
  title: 'Luce da due punti con i deviatori',
  objective: 'Collegare due deviatori con i conduttori navetta in modo che la luce cambi stato da entrambi i punti, interrompendo la fase.',
  theory:
    'La fase protetta entra nel comune C del primo deviatore; i morsetti 1 e 2 dei due deviatori si collegano tra loro (due navette); dal comune del secondo deviatore parte il ritorno lampada. Il neutro va direttamente alla lampada.',
  materials: ['wall-deviatore'],
  environment: 'Magnetotermico differenziale Q1 già collegato; lampada con neutro e PE già collegati; due deviatori da cablare.',
  build: deviatoriBase,
  tasks: [
    {
      id: 'toggle',
      kind: 'check',
      text: 'La luce cambia stato azionando l\'uno o l\'altro deviatore.',
      points: 50,
      check: (ctx): CheckOutcome => {
        const devs = ctx.project.components.filter((c) => c.params.kind === 'wall-switch' && c.params.p.type === 'deviatore');
        if (devs.length < 2) return { ok: false, hint: 'Servono due deviatori.' };
        const [a, b] = devs as [ComponentInstance, ComponentInstance];
        const at = (va: boolean, vb: boolean) => lampOnWith(ctx.project, 'Luce scale', (c) => (c.id === a.id ? va : c.id === b.id ? vb : undefined));
        const s00 = at(false, false);
        const s10 = at(true, false);
        const s01 = at(false, true);
        const s11 = at(true, true);
        if ([s00, s10, s01, s11].some((x) => x === null)) return { ok: false, hint: 'Il circuito non è risolvibile: controlla i collegamenti.' };
        const works = s00 !== s10 && s00 !== s01 && s10 !== s11 && s01 !== s11;
        return works ? { ok: true } : { ok: false, hint: 'Con alcune combinazioni la luce non cambia stato: controlla le due navette (1 con 1 e 2 con 2, oppure incrociate) e i comuni.' };
      },
    },
    {
      id: 'phase',
      kind: 'check',
      text: 'I deviatori interrompono la fase (nessun errore di cablaggio).',
      points: 25,
      check: (ctx) => {
        const errs = ctx.issues().filter((i) => i.severity === 'errore');
        return errs.length ? { ok: false, hint: `Errori di cablaggio: ${errs.map((e) => e.title).join('; ')}.` } : { ok: true };
      },
    },
    {
      id: 'three',
      kind: 'choice',
      text: 'Per aggiungere un terzo punto di comando servono:',
      points: 25,
      options: ['un terzo deviatore in parallelo', 'un invertitore inserito sulle navette tra i due deviatori', 'un interruttore sul neutro', 'un pulsante'],
      correct: 1,
      explanation: 'L\'invertitore collega le navette diritte o incrociate: ogni invertitore aggiunge un punto di comando.',
    },
  ],
};

// ------------------------------------------------------------------ contattore

function contattoreBase(): Project {
  const p = contattore();
  p.name = 'Esercizio: comando dello scaldabagno';
  const km = p.components.find((c) => c.params.kind === 'contactor')!;
  const s1 = p.components.find((c) => c.params.kind === 'wall-switch')!;
  // si tolgono i collegamenti del circuito di comando: li fa lo studente
  p.wires = p.wires.filter((w) => !w.to.startsWith(`${km.id}:A`) && !w.from.startsWith(`${km.id}:A`) && !w.from.startsWith(`${s1.id}:`) && !w.to.startsWith(`${s1.id}:`));
  p.description = 'Il circuito di potenza dello scaldabagno passa già dai contatti del contattore KM1. Collega il circuito di comando: fase dopo Q3 → interruttore S1 → bobina A1, A2 al neutro.';
  return p;
}

const coilOn = (p: Project, switchClosed: boolean): boolean | null => {
  const km = p.components.find((c) => c.params.kind === 'contactor');
  if (!km) return null;
  const r = simulate(p, { closed: (c) => (c.params.kind === 'wall-switch' ? switchClosed : c.params.kind === 'contactor' ? false : c.params.kind === 'voltage-relay' ? true : true) });
  if (!r.ok) return null;
  const a = r.terminalV.get(`${km.id}:A1`);
  const b = r.terminalV.get(`${km.id}:A2`);
  return !!a && !!b && Math.hypot(a.re - b.re, a.im - b.im) >= 0.8 * (km.params.kind === 'contactor' ? km.params.p.coilV : 230);
};

const contattoreEx: Exercise = {
  id: 'l6-contattore',
  level: 6,
  title: 'Circuito di comando di un contattore',
  objective: 'Collegare interruttore e bobina perché lo scaldabagno si accenda solo con l\'interruttore chiuso.',
  theory:
    'Il contattore separa il circuito di comando (piccola corrente nella bobina A1-A2) dal circuito di potenza (contatti 1-2 e N). La bobina riceve la fase attraverso il comando e il neutro direttamente.',
  materials: [],
  environment: 'Contattore KM1, interruttore S1 e scaldabagno; circuito di potenza già collegato.',
  build: contattoreBase,
  tasks: [
    {
      id: 'coil',
      kind: 'check',
      text: 'Con S1 chiuso la bobina è alimentata, con S1 aperto no.',
      points: 50,
      check: (ctx) => {
        const on = coilOn(ctx.project, true);
        const off = coilOn(ctx.project, false);
        if (on === null || off === null) return { ok: false, hint: 'Circuito non risolvibile o contattore mancante.' };
        if (!on) return { ok: false, hint: 'Con S1 chiuso la bobina non riceve tensione: collega fase → S1 → A1 e A2 al neutro.' };
        if (off) return { ok: false, hint: 'La bobina resta alimentata anche con S1 aperto: S1 deve essere in serie sulla fase della bobina.' };
        return { ok: true };
      },
    },
    {
      id: 'errors',
      kind: 'check',
      text: 'Nessun errore di cablaggio.',
      points: 25,
      check: (ctx) => {
        const errs = ctx.issues().filter((i) => i.severity === 'errore');
        return errs.length ? { ok: false, hint: errs.map((e) => e.title).join('; ') } : { ok: true };
      },
    },
    {
      id: 'why',
      kind: 'choice',
      text: 'Cosa succede ai contatti del contattore se manca la tensione sulla bobina?',
      points: 25,
      options: ['Restano nell\'ultima posizione', 'Si aprono per effetto della molla', 'Si chiudono', 'Il contattore interviene come un magnetotermico'],
      correct: 1,
      explanation: 'Diversamente dal relè passo-passo, il contattore è monostabile: senza bobina alimentata i contatti NA tornano aperti.',
    },
  ],
};

// ------------------------------------------------------------------ fotovoltaico: stringa

function stringaBase(): Project {
  const p = fotovoltaico();
  p.name = 'Esercizio: dimensionamento della stringa';
  const a = arrayOf(p)!;
  if (a.params.kind === 'pv-array') a.params.p.modulesPerString = 15;
  p.description = 'Il progettista ha messo 15 moduli in una stringa. Verifica la tensione a vuoto con il freddo e correggi il numero di moduli.';
  return p;
}

const stringa: Exercise = {
  id: 'l6-stringa',
  level: 6,
  title: 'Dimensionare la stringa per l\'inverter',
  objective: 'Calcolare la tensione a vuoto massima della stringa e scegliere un numero di moduli compatibile con l\'inverter.',
  theory:
    'Con il freddo la tensione dei moduli sale: Voc,max = N × Voc × (1 + βVoc × (Tmin − 25)). Deve restare sotto la massima tensione DC dell\'inverter; la tensione MPP con la cella calda deve restare sopra il minimo dell\'MPPT.',
  materials: [],
  environment: 'Casa con fotovoltaico: stringa da 15 moduli da 400 Wp, inverter da 3 kW (massimo 600 V DC, MPPT 90–550 V), sito con minima di −10 °C.',
  build: stringaBase,
  tasks: [
    {
      id: 'vocmax',
      kind: 'numeric',
      text: 'Tensione a vuoto massima della stringa da 15 moduli a −10 °C (calcolala prima di modificare il progetto):',
      unit: 'V',
      tolerancePct: 1.5,
      points: 30,
      expected: () => {
        const a = arrayOf(stringaBase())!;
        return a.params.kind === 'pv-array' ? maxStringVoc(a.params.p, -10) : null;
      },
      explanation: '15 × 41 V × (1 + 0,0027 × 35) ≈ 673 V: oltre i 600 V dell\'inverter.',
    },
    {
      id: 'fix',
      kind: 'check',
      text: 'Modifica il numero di moduli in serie in modo che tutte le verifiche stringa-inverter siano superate (proprietà del generatore).',
      points: 40,
      check: (ctx) => {
        const a = arrayOf(ctx.project);
        const inv = inverter(ctx.project);
        if (!a || !inv || a.params.kind !== 'pv-array' || inv.params.kind !== 'inverter') return { ok: false, hint: 'Generatore o inverter mancanti.' };
        const bad = stringChecks(a.params.p, inv.params.p, pvEnv(ctx.project.pv)).filter((c) => c.ok === false);
        return bad.length ? { ok: false, hint: bad.map((b) => b.title).join('; ') } : { ok: true };
      },
    },
    {
      id: 'cold',
      kind: 'choice',
      text: 'Perché la verifica di tensione massima si fa alla temperatura minima del sito?',
      points: 30,
      options: ['Perché d\'inverno il sole è più forte', 'Perché la tensione dei moduli aumenta quando la cella è fredda', 'Perché l\'inverter si raffredda', 'Perché lo prescrive il contatore'],
      correct: 1,
    },
  ],
};

// ------------------------------------------------------------------ fotovoltaico: polarità

function polaritaBase(): Project {
  const p = fotovoltaico();
  p.name = 'Esercizio: l\'inverter non parte';
  for (const c of p.components) if (c.params.kind !== 'load') c.closed = true;
  const a = arrayOf(p)!;
  for (const w of p.wires) {
    if (w.from === `${a.id}:DC+`) w.from = `${a.id}:DC-`;
    else if (w.from === `${a.id}:DC-`) w.from = `${a.id}:DC+`;
  }
  p.description = 'Dopo l\'installazione l\'inverter non produce. Misura la tensione DC ai suoi morsetti con il multimetro (portata V⎓, puntale rosso sul +) e correggi il collegamento.';
  return p;
}

const polarita: Exercise = {
  id: 'l6-polarita',
  level: 6,
  title: 'Trovare la polarità invertita della stringa',
  objective: 'Usare il multimetro in continua per riconoscere una stringa collegata al contrario e correggerla.',
  theory: 'In continua il multimetro indica il segno: con il puntale rosso sul + e il nero sul − la lettura è positiva. Una lettura negativa significa che i due conduttori sono scambiati.',
  materials: [],
  environment: 'Casa con fotovoltaico: la stringa arriva al sezionatore DC con + e − scambiati.',
  build: polaritaBase,
  tasks: [
    {
      id: 'read',
      kind: 'numeric',
      text: 'Lettura del multimetro (V⎓) con il rosso sul morsetto + dell\'inverter e il nero sul −, PRIMA della correzione:',
      unit: 'V',
      tolerancePct: 2,
      points: 30,
      expected: () => {
        const p = polaritaBase();
        const inv = inverter(p)!;
        return dcVoltageBetween(p, `${inv.id}:DC+`, `${inv.id}:DC-`, null);
      },
      explanation: 'Il valore negativo indica la polarità invertita: è la tensione a vuoto della stringa con il segno meno.',
    },
    {
      id: 'fixed',
      kind: 'check',
      text: 'Correggi i collegamenti: l\'inverter deve risultare in produzione con il sole impostato.',
      points: 50,
      check: (ctx) => {
        const r = ctx.design();
        const inv = inverter(ctx.project);
        if (!r.ok || !inv) return { ok: false, hint: 'Circuito non risolvibile.' };
        const st = r.inverters.get(inv.id)?.state;
        return st === 'produzione' ? { ok: true } : { ok: false, hint: `Stato dell'inverter: ${st}.` };
      },
    },
    {
      id: 'safety',
      kind: 'choice',
      text: 'Prima di scambiare i conduttori della stringa:',
      points: 20,
      options: ['basta aprire il generale in alternata', 'si apre il sezionatore DC a inverter fermo, sapendo che i cavi dei moduli restano in tensione con la luce', 'si spegne la luce del locale', 'non serve nessuna precauzione: è bassa tensione'],
      correct: 1,
    },
  ],
};

// ------------------------------------------------------------------ fotovoltaico: autoconsumo

function autoconsumoBase(): Project {
  const p = fotovoltaico();
  p.name = 'Esercizio: autoconsumo e accumulo';
  p.description = 'Usa la «Giornata tipo» nelle proprietà dell\'inverter (mezza stagione) per valutare autoconsumo e prelievi, poi prova ad aggiungere una batteria.';
  return p;
}

const dayOf = (p: Project) => {
  const inv = inverter(p);
  return inv ? inverterDay(p, inv, 'mezza stagione') : null;
};

const autoconsumo: Exercise = {
  id: 'l6-autoconsumo',
  level: 6,
  title: 'Autoconsumo e batteria',
  objective: 'Leggere il bilancio energetico della giornata tipo e valutare l\'effetto di un accumulo.',
  theory:
    'Autoconsumo = energia prodotta e consumata in casa / energia prodotta. Senza batteria l\'eccedenza di mezzogiorno va in rete e la sera si preleva; con la batteria l\'eccedenza viene spostata alla sera.',
  materials: [],
  environment: 'Casa con fotovoltaico 3,2 kWp, consumi costanti pari agli utilizzatori accesi.',
  build: autoconsumoBase,
  tasks: [
    {
      id: 'produced',
      kind: 'numeric',
      text: 'Energia prodotta nella giornata tipo di mezza stagione (senza modificare il progetto):',
      unit: 'kWh',
      tolerancePct: 3,
      points: 30,
      expected: () => dayOf(autoconsumoBase())?.producedKWh ?? null,
    },
    {
      id: 'exported',
      kind: 'numeric',
      text: 'Energia immessa in rete nella stessa giornata, senza batteria:',
      unit: 'kWh',
      tolerancePct: 5,
      points: 30,
      expected: () => dayOf(autoconsumoBase())?.exportedKWh ?? null,
    },
    {
      id: 'battery',
      kind: 'check',
      text: 'Aggiungi all\'inverter una batteria (proprietà dell\'inverter) che riduca i prelievi dalla rete di almeno 2 kWh nella giornata tipo.',
      points: 40,
      check: (ctx) => {
        const base = dayOf(autoconsumoBase());
        const now = dayOf(ctx.project);
        if (!base || !now) return { ok: false, hint: 'Inverter o generatore non collegati.' };
        const saved = base.importedKWh - now.importedKWh;
        return saved >= 2 ? { ok: true } : { ok: false, hint: `Prelievi ridotti di ${saved.toFixed(1).replace('.', ',')} kWh: aumenta capacità o potenza della batteria.` };
      },
    },
  ],
};

// ------------------------------------------------------------------ verifiche strumentali

function verificheBase(): Project {
  const p = monolocale();
  p.name = 'Esercizio: verifiche con lo strumento';
  for (const c of p.components) if (c.params.kind !== 'load') c.closed = true;
  const u2 = p.components.find((c) => c.label === 'U2')!;
  p.faults = [{ id: 'hf-iso', type: 'L-PE', targetId: u2.id, resistance: 180000, hidden: true }];
  p.description = 'Prima di consegnare l\'impianto esegui le verifiche con il Verificatore: isolamento a impianto disalimentato, anello di guasto e prova dei differenziali.';
  return p;
}

const verifiche: Exercise = {
  id: 'l6-verifiche',
  level: 6,
  title: 'Verifiche iniziali con lo strumento',
  objective: 'Misurare isolamento e impedenza dell\'anello di guasto e interpretare la prova del differenziale.',
  theory:
    'La resistenza d\'isolamento si misura in continua tra conduttori attivi e PE, a impianto disalimentato e apparecchi scollegati. L\'anello di guasto L-PE nel sistema TT comprende le resistenze di terra. La prova del differenziale controlla che non intervenga a ½·IΔn e intervenga entro i tempi a IΔn.',
  materials: [],
  environment: 'Monolocale con un difetto d\'isolamento nascosto su una linea.',
  build: verificheBase,
  tasks: [
    {
      id: 'iso',
      kind: 'numeric',
      text: 'Resistenza d\'isolamento misurata sulla linea delle prese soggiorno (in kΩ):',
      unit: 'kΩ',
      tolerancePct: 2,
      points: 35,
      expected: (ctx) => {
        const u = ctx.loadByName('Prese soggiorno');
        if (!u) return null;
        const r = insulationResistance(ctx.project, u.id);
        return Number.isFinite(r) ? r / 1000 : null;
      },
      explanation: 'Un valore di poche centinaia di kΩ indica un difetto d\'isolamento: va cercato e riparato prima della consegna.',
    },
    {
      id: 'zs',
      kind: 'numeric',
      text: 'Impedenza dell\'anello di guasto L-PE alla linea delle luci:',
      unit: 'Ω',
      tolerancePct: 3,
      points: 35,
      expected: (ctx) => {
        const u = ctx.loadByName('Luci');
        return u ? loopImpedance(ctx.project, u.id).zLpe : null;
      },
    },
    {
      id: 'half',
      kind: 'choice',
      text: 'Nella prova a ½·IΔn (15 mA per un differenziale da 30 mA) il differenziale:',
      points: 30,
      options: ['deve intervenire entro 300 ms', 'non deve intervenire', 'deve intervenire entro 40 ms', 'si danneggia'],
      correct: 1,
      explanation: '½·IΔn è la corrente di non intervento: serve a verificare che il dispositivo non sia troppo sensibile.',
    },
  ],
};

export const L6_EXERCISES: Exercise[] = [deviatori, contattoreEx, stringa, polarita, autoconsumo, verifiche];

