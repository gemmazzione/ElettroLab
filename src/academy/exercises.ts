import { clampReading, loadEndFaultCurrents, voltageBetween } from '../engine/measure';
import { analyzeCircuits, residualDevicesIn } from '../graph/netGraph';
import type { Project } from '../model/types';
import { addLoad, appartamento, bridge, line, monolocale, ProjectBuilder, setMcb, t, trifase } from '../projects/demos';
import { protectedCurrent } from '../protection/stepper';
import type { RuleStatus } from '../rules/types';
import type { CheckOutcome, Exercise, ExerciseCtx } from './types';
import { L6_EXERCISES } from './exercisesL6';

// ------------------------------------------------------------------ aiutanti per i controlli

const designLoad = (ctx: ExerciseCtx, name: string) => {
  const c = ctx.loadByName(name);
  const r = ctx.design();
  return c && r.ok ? (r.loads.get(c.id) ?? null) : null;
};

const loadsPowered = (ctx: ExerciseCtx, names: string[]): CheckOutcome => {
  const off = names.filter((n) => {
    const r = designLoad(ctx, n);
    return !r || !r.energized || r.i < 0.01;
  });
  return off.length
    ? { ok: false, hint: `Con tutte le protezioni chiuse non funziona: ${off.join(', ')}. Controlla fase, neutro e ponticelli.` }
    : { ok: true };
};

const noWiringErrors = (ctx: ExerciseCtx): CheckOutcome => {
  const errs = ctx.issues().filter((i) => i.severity === 'errore');
  return errs.length ? { ok: false, hint: `Errori di cablaggio: ${errs.map((e) => e.title).join('; ')}.` } : { ok: true };
};

const ruleAll = (ctx: ExerciseCtx, ruleId: string, accept: RuleStatus[] = ['conforme']): CheckOutcome => {
  const o = ctx.norm().outcomes.filter((x) => x.ruleId === ruleId);
  if (!o.length) return { ok: false, hint: `La verifica ${ruleId} non ha prodotto risultati: il circuito è completo?` };
  const bad = o.filter((x) => !accept.includes(x.status));
  return bad.length ? { ok: false, hint: bad.map((b) => `${b.subject}: ${b.message}`).join(' ') } : { ok: true };
};

const tripped = (ctx: ExerciseCtx, label: string, cause: string): CheckOutcome => {
  const c = ctx.byLabel(label);
  if (!c) return { ok: false, hint: `${label} non trovato.` };
  return ctx.prot[c.id]?.tripped === cause
    ? { ok: true }
    : { ok: false, hint: `${label} non risulta intervenuto per ${cause}. Avvia la simulazione e osserva il registro eventi.` };
};

const term = (ctx: ExerciseCtx, name: string, key: string) => {
  const c = ctx.loadByName(name);
  return c ? `${c.id}:${key}` : '';
};

/** Base monofase: fornitura e dispersore fuori dal quadro. */
function baseMono(name: string, rows: number, modules: number, contract = 3) {
  const b = new ProjectBuilder(name, rows, modules);
  const cnt = b.add('supply-mono', { position: { x: -280, y: 30 } }, (c) => {
    if (c.params.kind === 'supply') c.params.p.contractKW = contract;
  });
  const earth = b.add('earth', { position: { x: -260, y: 430 } });
  return { b, cnt, earth };
}

function singleLoad(name: string, catalogId: string, loadName: string, powerW: number, opts: { rcd?: boolean; inA?: number } = {}) {
  const { b, cnt, earth } = baseMono(name, 1, 12);
  let feed = cnt;
  let feedL = 'L';
  let feedN = 'N';
  if (opts.rcd) {
    const r = b.add('rcd-2p', { rail: { row: 0, slot: 0 } }, (c) => (c.closed = true));
    b.wire(t(cnt, 'L'), t(r, 'p0_in'), 6, 5).wire(t(cnt, 'N'), t(r, 'p1_in'), 6, 5);
    feed = r;
    feedL = 'p0_out';
    feedN = 'p1_out';
  }
  const q = b.add('mcb-1pn', { rail: { row: 0, slot: opts.rcd ? 2 : 0 } }, (c) => {
    c.closed = true;
    setMcb(c, opts.inA ?? 10);
  });
  const xpe = b.add('bar-pe-8', { rail: { row: 0, slot: 6 } });
  const u = addLoad(b, { catalogId, name: loadName, powerW, section: 2.5, length: 10 }, 60, 400, 1);
  b.wire(t(feed, feedL), t(q, 'p0_in'), 6, opts.rcd ? 0.2 : 5).wire(t(feed, feedN), t(q, 'p1_in'), 6, opts.rcd ? 0.2 : 5);
  b.wire(t(earth, 'PE'), t(xpe, 't0'), 6, 5);
  line(b, q, u, xpe, 1, 2.5);
  return b.project;
}

const withFault = (p: Project, loadName: string, type: 'short-LN' | 'L-PE' | 'open-N' | 'L-earth', resistance = 0, hidden = true): Project => {
  const u = p.components.find((c) => c.params.kind === 'load' && c.params.p.name === loadName)!;
  p.faults = [...(p.faults ?? []), { id: `hf-${type}`, type, targetId: u.id, resistance, hidden }];
  return p;
};

const MATERIALS_MONO = ['mcb-2p', 'switch-2p', 'rcd-2p', 'mcb-1pn', 'mcb-1p', 'rcbo-1pn', 'bar-pe-8', 'bar-n-8', 'bar-l-4'];

// ------------------------------------------------------------------ livello 1

const l1Basi: Exercise = {
  id: 'l1-fase-neutro-terra',
  level: 1,
  title: 'Fase, neutro e terra',
  objective: 'Riconoscere fase, neutro e conduttore di protezione misurando le tensioni con il multimetro.',
  theory:
    'La fase (L, marrone) è il conduttore in tensione. Il neutro (N, blu) chiude il circuito verso il trasformatore di cabina, dove è collegato a terra: per questo il suo potenziale verso terra è quasi zero. Il conduttore di protezione (PE, giallo-verde) collega le masse al dispersore e in servizio ordinario non porta corrente. La tensione è una differenza di potenziale: si misura sempre tra due punti.',
  materials: [],
  environment: 'Fornitura monofase 230 V, un magnetotermico 1P+N e una lampada già collegata con il suo PE.',
  build: () => singleLoad('Esercizio: fase, neutro e terra', 'load-luce', 'Lampada', 100),
  tasks: [
    {
      id: 'probe',
      kind: 'check',
      text: 'Avvia la simulazione, scegli lo strumento Multimetro e appoggia i puntali sui morsetti L e N della lampada.',
      points: 10,
      check: (ctx) => {
        const l = term(ctx, 'Lampada', 'L');
        const n = term(ctx, 'Lampada', 'N');
        const ok = ctx.running && ((ctx.probes.red === l && ctx.probes.black === n) || (ctx.probes.red === n && ctx.probes.black === l));
        return ok ? { ok } : { ok, hint: 'I puntali devono essere su L e N della lampada con la simulazione avviata.' };
      },
    },
    {
      id: 'vln',
      kind: 'numeric',
      text: 'Tensione misurata tra L e N della lampada:',
      unit: 'V',
      tolerancePct: 2,
      points: 20,
      expected: (ctx) => voltageBetween(ctx.design(), term(ctx, 'Lampada', 'L'), term(ctx, 'Lampada', 'N')),
    },
    {
      id: 'vlpe',
      kind: 'numeric',
      text: 'Tensione tra L e PE della lampada:',
      unit: 'V',
      tolerancePct: 2,
      points: 20,
      expected: (ctx) => voltageBetween(ctx.design(), term(ctx, 'Lampada', 'L'), term(ctx, 'Lampada', 'PE')),
    },
    {
      id: 'vnpe',
      kind: 'numeric',
      text: 'Tensione tra N e PE della lampada:',
      unit: 'V',
      toleranceAbs: 1.5,
      points: 20,
      expected: (ctx) => voltageBetween(ctx.design(), term(ctx, 'Lampada', 'N'), term(ctx, 'Lampada', 'PE')),
      explanation: 'Il neutro è vicino al potenziale di terra: la piccola differenza è la caduta di tensione sul conduttore di neutro percorso dalla corrente.',
    },
    {
      id: 'why',
      kind: 'choice',
      text: 'Perché il neutro ha una tensione verso terra quasi nulla?',
      points: 30,
      options: [
        'Perché il centro stella del trasformatore di cabina è collegato a terra',
        'Perché nel quadro il neutro è collegato al PE',
        'Perché il neutro non porta mai corrente',
        'Perché il colore blu identifica un conduttore isolato',
      ],
      correct: 0,
      explanation: 'Nel sistema TT il neutro è messo a terra in cabina (RB). Nel quadro dell\'utente neutro e PE NON vanno mai collegati.',
    },
  ],
};

const l1Potenza: Exercise = {
  id: 'l1-corrente-potenza',
  level: 1,
  title: 'Tensione, corrente e potenza',
  objective: 'Collegare legge di Ohm e potenza: calcolare corrente e potenza effettiva di un carico resistivo e la caduta di tensione sulla linea.',
  theory:
    'Per un carico resistivo I = U / R e P = U × I = U² / R. Una stufa da 2000 W "a 230 V" ha R = 230² / 2000 = 26,45 Ω. Se la tensione ai suoi capi è più bassa (caduta lungo la linea), la potenza scende con il quadrato della tensione.',
  materials: [],
  environment: 'Stufa da 2000 W alimentata da una linea di 10 m in 2,5 mm².',
  build: () => singleLoad('Esercizio: corrente e potenza', 'load-generico', 'Stufa', 2000, { inA: 16 }),
  tasks: [
    {
      id: 'i',
      kind: 'numeric',
      text: 'Corrente assorbita dalla stufa (simulazione o calcolo):',
      unit: 'A',
      tolerancePct: 2,
      points: 30,
      expected: (ctx) => designLoad(ctx, 'Stufa')?.i ?? null,
    },
    {
      id: 'p',
      kind: 'numeric',
      text: 'Potenza effettivamente assorbita:',
      unit: 'W',
      tolerancePct: 1,
      points: 30,
      expected: (ctx) => designLoad(ctx, 'Stufa')?.p ?? null,
      explanation: 'È un po\' meno di 2000 W perché la tensione ai capi è minore di 230 V.',
    },
    {
      id: 'sq',
      kind: 'choice',
      text: 'Se la tensione ai capi di una resistenza scende del 10%, la potenza…',
      points: 40,
      options: ['scende del 10%', 'scende di circa il 19%', 'resta uguale', 'aumenta del 10%'],
      correct: 1,
      explanation: 'P = U²/R: (0,9)² = 0,81, cioè −19%.',
    },
  ],
};

const l1Magnetotermico: Exercise = {
  id: 'l1-magnetotermico',
  level: 1,
  title: 'Funzione del magnetotermico',
  objective: 'Osservare l\'intervento ritardato dello sganciatore termico in sovraccarico.',
  theory:
    'Il termico non interviene appena la corrente supera In: si scalda come il cavo che protegge e interviene dopo un tempo tanto più breve quanto maggiore è il sovraccarico. Il magnetico interviene invece in pochi millisecondi oltre una soglia molto più alta (curva B, C, D).',
  materials: [],
  environment: 'Magnetotermico C10 che alimenta un carico da 3500 W (sovraccarico).',
  build: () => singleLoad('Esercizio: magnetotermico', 'load-generico', 'Carico eccessivo', 3500, { inA: 10 }),
  tasks: [
    {
      id: 'ratio',
      kind: 'numeric',
      text: 'Rapporto I/In nel magnetotermico Q1:',
      unit: '',
      tolerancePct: 3,
      points: 25,
      expected: (ctx) => {
        const r = ctx.design();
        const q = ctx.byLabel('Q1');
        return r.ok && q ? protectedCurrent(r, q) / 10 : null;
      },
    },
    {
      id: 'trip',
      kind: 'check',
      text: 'Avvia la simulazione (velocità 60×) e attendi l\'intervento di Q1.',
      points: 35,
      check: (ctx) => tripped(ctx, 'Q1', 'termico'),
    },
    {
      id: 'when',
      kind: 'choice',
      text: 'Quando interviene lo sganciatore termico?',
      points: 40,
      options: ['Appena I supera In', 'Dopo un tempo che dipende da quanto I supera In', 'Solo in cortocircuito', 'Mai, se il cavo è adeguato'],
      correct: 1,
    },
  ],
};

const l1Differenziale: Exercise = {
  id: 'l1-differenziale',
  level: 1,
  title: 'Funzione del differenziale',
  objective: 'Provocare un guasto a massa e osservare l\'intervento del differenziale.',
  theory:
    'Il differenziale confronta la corrente che va verso il carico con quella che ritorna. Se una parte si disperde verso terra (guasto a massa, persona), la differenza supera la soglia e il dispositivo apre il circuito. Non protegge dal sovraccarico.',
  materials: [],
  environment: 'Differenziale 30 mA, magnetotermico e lavatrice con PE collegato al dispersore (RA = 50 Ω).',
  build: () => singleLoad('Esercizio: differenziale', 'load-generico', 'Lavatrice', 2000, { rcd: true, inA: 16 }),
  tasks: [
    {
      id: 'ig',
      kind: 'numeric',
      text: 'Corrente di guasto franco a massa presunta (vedi «Correnti di guasto presunte» della lavatrice):',
      unit: 'A',
      tolerancePct: 3,
      points: 30,
      expected: (ctx) => {
        const c = ctx.loadByName('Lavatrice');
        return c ? loadEndFaultCurrents(ctx.project, c.id).lpe : null;
      },
      explanation: 'Nel sistema TT la corrente di guasto è limitata da RA + RB: pochi ampere, troppo pochi per il magnetico ma moltissimi per un differenziale da 30 mA.',
    },
    {
      id: 'trip',
      kind: 'check',
      text: 'Seleziona la lavatrice, inserisci un «Guasto a massa (L-PE)» e avvia la simulazione.',
      points: 35,
      check: (ctx) => tripped(ctx, 'Q1', 'differenziale'),
    },
    {
      id: 'what',
      kind: 'choice',
      text: 'Che cosa misura il differenziale?',
      points: 35,
      options: ['La corrente di fase', 'La somma vettoriale delle correnti dei conduttori attivi', 'La tensione verso terra', 'La resistenza del dispersore'],
      correct: 1,
    },
  ],
};

// ------------------------------------------------------------------ livello 2

function primoQuadroBase(): Project {
  const { b } = baseMono('Esercizio: primo quadro', 2, 12);
  addLoad(b, { catalogId: 'load-luce', name: 'Luci', powerW: 300, section: 1.5, length: 15 }, 60, 700, 2);
  addLoad(b, { catalogId: 'load-prese', name: 'Prese', powerW: 1500, section: 2.5, length: 20, sockets: true }, 280, 700, 2);
  b.project.description = 'Realizza il quadro: generale, differenziale e due circuiti protetti (luci e prese).';
  return b.project;
}

const l2PrimoQuadro: Exercise = {
  id: 'l2-primo-quadro',
  level: 2,
  title: 'Il primo quadro: luci e prese',
  objective: 'Realizzare da zero un quadro monofase che alimenti luci e prese nel rispetto delle regole verificate.',
  theory:
    'Sequenza tipica: contatore → interruttore generale onnipolare → differenziale → un magnetotermico per ogni circuito. Il PE di ogni utilizzatore arriva alla morsettiera PE, collegata al dispersore. I neutri seguono la propria fase: un 1P+N porta con sé il neutro del circuito.',
  materials: MATERIALS_MONO,
  environment: 'Quadro vuoto da 24 moduli; fornitura, dispersore, luci (1,5 mm²) e prese (2,5 mm²) già posizionati, con i dati di posa (B1, 2 circuiti raggruppati).',
  build: primoQuadroBase,
  tasks: [
    { id: 'pw', kind: 'check', text: 'Luci e prese funzionano con tutte le protezioni chiuse.', points: 20, check: (ctx) => loadsPowered(ctx, ['Luci', 'Prese']) },
    { id: 'erc', kind: 'check', text: 'Nessun errore di cablaggio.', points: 15, check: noWiringErrors },
    { id: 'sez', kind: 'check', text: 'Ogni circuito è sezionabile su fase e neutro (462.1).', points: 15, check: (ctx) => ruleAll(ctx, 'SEZ-462') },
    { id: 'tt', kind: 'check', text: 'Entrambi i circuiti sono protetti da un differenziale (413.1.4.2).', points: 15, check: (ctx) => ruleAll(ctx, 'TT-DIFF') },
    { id: 'add', kind: 'check', text: 'Le prese hanno un differenziale ≤ 30 mA (412.5.3).', points: 10, check: (ctx) => ruleAll(ctx, 'RES-412.5.3') },
    { id: 'ol', kind: 'check', text: 'Protezioni coordinate con i cavi: IB ≤ In ≤ Iz (433.2).', points: 15, check: (ctx) => ruleAll(ctx, 'OL-433') },
    {
      id: 'div',
      kind: 'check',
      text: 'Luci e prese hanno magnetotermici distinti (314.1).',
      points: 10,
      check: (ctx) => {
        const o = ctx.norm().outcomes.find((x) => x.ruleId === 'DIV-314' && x.subject === 'Circuiti terminali');
        return o?.status === 'conforme' ? { ok: true } : { ok: false, hint: o?.message ?? 'Circuiti non suddivisi.' };
      },
    },
  ],
};

function neutriBase(wrong: boolean): Project {
  const { b, cnt, earth } = baseMono(wrong ? 'Esercizio: cablaggio errato' : 'Esercizio: neutri e differenziali', 2, 12);
  const q1 = b.add('mcb-2p', { rail: { row: 0, slot: 0 } }, (c) => setMcb(c, 25, 'C', 6));
  const d1 = b.add('rcd-2p', { rail: { row: 0, slot: 3 } });
  const d2 = b.add('rcd-2p', { rail: { row: 0, slot: 6 } });
  const ql = b.add('mcb-1p', { rail: { row: 0, slot: 9 } }, (c) => setMcb(c, 10));
  const qp = b.add('mcb-1p', { rail: { row: 0, slot: 10 } }, (c) => setMcb(c, 16));
  const xn1 = b.add('bar-n-8', { rail: { row: 1, slot: 0 } });
  const xn2 = b.add('bar-n-8', { rail: { row: 1, slot: 4 } });
  const xpe = b.add('bar-pe-8', { rail: { row: 1, slot: 8 } });
  const luci = addLoad(b, { catalogId: 'load-luce', name: 'Luci', powerW: 300, section: 1.5, length: 15 }, 60, 700, 2);
  const prese = addLoad(b, { catalogId: 'load-prese', name: 'Prese', powerW: 1500, section: 2.5, length: 20, sockets: true }, 280, 700, 2);
  b.wire(t(cnt, 'L'), t(q1, 'p0_in'), 6, 8).wire(t(cnt, 'N'), t(q1, 'p1_in'), 6, 8);
  b.wire(t(earth, 'PE'), t(xpe, 't0'), 6, 5);
  b.wire(t(xpe, 't1'), t(luci, 'PE'), 1.5, 0.5).wire(t(xpe, 't2'), t(prese, 'PE'), 2.5, 0.5);
  if (wrong) {
    for (const d of [d1, d2]) b.wire(t(q1, 'p0_out'), t(d, 'p0_in'), 6, 0.3).wire(t(q1, 'p1_out'), t(d, 'p1_in'), 6, 0.3);
    b.wire(t(d1, 'p0_out'), t(ql, 'p0_in'), 4, 0.2).wire(t(d2, 'p0_out'), t(qp, 'p0_in'), 4, 0.2);
    b.wire(t(d1, 'p1_out'), t(xn1, 't0'), 4, 0.3).wire(t(d2, 'p1_out'), t(xn2, 't0'), 4, 0.3);
    b.wire(t(ql, 'p0_out'), t(luci, 'L'), 1.5, 0.4).wire(t(xn1, 't1'), t(luci, 'N'), 1.5, 0.4);
    // errore 1: il neutro delle prese è preso dalla morsettiera del gruppo luci
    b.wire(t(qp, 'p0_out'), t(prese, 'L'), 2.5, 0.4).wire(t(xn1, 't2'), t(prese, 'N'), 2.5, 0.4);
    // errore 2: conduttore di protezione delle luci in colore blu
    const pe = b.project.wires.find((w) => w.to === t(luci, 'PE'))!;
    pe.color = 'blu';
    for (const c of b.project.components) if (c.params.kind !== 'load') c.closed = true;
  }
  b.project.description = wrong
    ? 'Un collega ha cablato questo quadro, ma il differenziale delle prese scatta senza motivo. Trova e correggi gli errori.'
    : 'I dispositivi sono già montati: completa il cablaggio con due gruppi differenziali indipendenti (luci e prese).';
  return b.project;
}

const differentRcds = (ctx: ExerciseCtx): CheckOutcome => {
  const circ = analyzeCircuits(ctx.project);
  const l = ctx.loadByName('Luci');
  const p = ctx.loadByName('Prese');
  const cl = circ.find((c) => c.loadId === l?.id);
  const cp = circ.find((c) => c.loadId === p?.id);
  if (!cl || !cp) return { ok: false };
  const rl = residualDevicesIn(ctx.project, cl.lDevices);
  const rp = residualDevicesIn(ctx.project, cp.lDevices);
  const ok = rl.length === 1 && rp.length === 1 && rl[0] !== rp[0];
  return ok ? { ok } : { ok, hint: 'Luci e prese devono essere protette ciascuna da un differenziale diverso.' };
};

const l2Neutri: Exercise = {
  id: 'l2-neutri',
  level: 2,
  title: 'Cablaggio dei neutri con due differenziali',
  objective: 'Collegare due gruppi differenziali indipendenti, ciascuno con la propria morsettiera di neutro.',
  theory:
    'Con magnetotermici unipolari (1P) il neutro dei circuiti arriva da una morsettiera. Ogni differenziale deve vedere tornare sul suo neutro tutta la corrente uscita dalla sua fase: quindi ogni gruppo ha la propria morsettiera di neutro, collegata solo all\'uscita N del proprio differenziale.',
  materials: [],
  environment: 'Generale 2P, due differenziali 30 mA, due magnetotermici 1P, due morsettiere N e una PE già montati. Fornitura e PE già collegati.',
  build: () => neutriBase(false),
  tasks: [
    { id: 'pw', kind: 'check', text: 'Luci e prese funzionano con tutte le protezioni chiuse.', points: 25, check: (ctx) => loadsPowered(ctx, ['Luci', 'Prese']) },
    { id: 'grp', kind: 'check', text: 'Luci e prese sono su differenziali diversi.', points: 25, check: differentRcds },
    { id: 'erc', kind: 'check', text: 'Nessun errore di cablaggio (neutri non mescolati).', points: 25, check: noWiringErrors },
    {
      id: 'why',
      kind: 'choice',
      text: 'Che cosa succede se il neutro delle prese viene preso dalla morsettiera del gruppo luci?',
      points: 25,
      options: [
        'Nulla, il neutro è comune a tutto l\'impianto',
        'I differenziali vedono correnti sbilanciate e intervengono senza guasto',
        'Si brucia il magnetotermico delle prese',
        'Le prese funzionano a 400 V',
      ],
      correct: 1,
    },
  ],
};

// ------------------------------------------------------------------ livello 3

function dimensionamentoBase(): Project {
  const p = appartamento();
  p.name = 'Esercizio: dimensionamento';
  const byName = (n: string) => p.components.find((c) => c.params.kind === 'load' && c.params.p.name === n)!;
  const q = (l: string) => p.components.find((c) => c.label === l)!;
  setMcb(q('Q3'), 16); // luci 1,5 mm² protette a 16 A
  const pg = byName('Prese zona giorno');
  if (pg.params.kind === 'load') pg.params.p.cableSection = 1.5; // prese in 1,5 mm² su C16
  const lav = byName('Lavatrice');
  if (lav.params.kind === 'load') delete lav.params.p.install; // dati di posa mancanti
  const forno = byName('Forno');
  if (forno.params.kind === 'load') forno.params.p.cableLength = 70; // linea molto lunga
  p.description = 'Il progetto contiene errori di dimensionamento e dati mancanti. Correggi protezioni, sezioni e lunghezze.';
  return p;
}

const l3Dimensionamento: Exercise = {
  id: 'l3-dimensionamento',
  level: 3,
  title: 'Dimensionamento di protezioni e linee',
  objective: 'Correggere un appartamento in cui protezioni e cavi non sono coordinati e una linea è troppo lunga.',
  theory:
    'Per ogni circuito: IB ≤ In ≤ Iz, dove Iz dipende da sezione, posa, isolante, temperatura e raggruppamento. Il cortocircuito a fondo linea deve far intervenire il magnetico: linee lunghe e sezioni piccole riducono la corrente di cortocircuito. Si raccomanda una caduta di tensione non superiore al 4%.',
  materials: [],
  environment: 'Appartamento da 4,5 kW con due gruppi differenziali. Modifica In dei magnetotermici, sezioni, lunghezze e dati di posa dal pannello Proprietà.',
  build: dimensionamentoBase,
  tasks: [
    { id: 'ol', kind: 'check', text: 'Tutti i circuiti rispettano IB ≤ In ≤ Iz con dati di posa completi.', points: 40, check: (ctx) => ruleAll(ctx, 'OL-433') },
    { id: 'sc', kind: 'check', text: 'Nessun circuito con cortocircuito a fondo linea non eliminato (434.3.2).', points: 25, check: (ctx) => ruleAll(ctx, 'SC-434-I2T', ['conforme', 'dati-insufficienti']) },
    { id: 'cdt', kind: 'check', text: 'Caduta di tensione ≤ 4% su tutti gli utilizzatori (525).', points: 20, check: (ctx) => ruleAll(ctx, 'CDT-525') },
    {
      id: 'all',
      kind: 'check',
      text: 'Nessun errore nella verifica normativa complessiva (attenzione anche alla sezione dei PE).',
      points: 15,
      check: (ctx) => {
        const e = ctx.norm().outcomes.filter((o) => o.status === 'errore');
        return e.length ? { ok: false, hint: e.map((o) => `${o.rule.title} — ${o.subject}`).join('; ') } : { ok: true };
      },
    },
  ],
};

function carichiBase(): Project {
  const p = appartamento();
  p.name = 'Esercizio: carichi';
  for (const c of p.components) if (c.params.kind === 'load') c.params.p.on = true;
  p.description = 'Tutti gli utilizzatori sono accesi contemporaneamente.';
  return p;
}

const l3Carichi: Exercise = {
  id: 'l3-carichi',
  level: 3,
  title: 'Simulazione dei carichi e potenza disponibile',
  objective: 'Valutare la potenza assorbita con tutti gli utilizzatori accesi e la corrente nell\'interruttore generale.',
  theory:
    'La corrente nel generale è la somma delle correnti dei circuiti (carichi resistivi, in fase tra loro). Il contatore elettronico consente di prelevare la potenza impegnata più il 10%: oltre, il limitatore può aprire l\'alimentazione.',
  materials: [],
  environment: 'Appartamento 4,5 kW con forno, lavatrice, luci e prese accesi.',
  build: carichiBase,
  tasks: [
    {
      id: 'p',
      kind: 'numeric',
      text: 'Potenza attiva totale assorbita:',
      unit: 'W',
      tolerancePct: 2,
      points: 35,
      expected: (ctx) => {
        const r = ctx.design();
        return r.ok ? r.supply.p : null;
      },
    },
    {
      id: 'i',
      kind: 'numeric',
      text: 'Corrente nell\'interruttore generale Q1:',
      unit: 'A',
      tolerancePct: 2,
      points: 35,
      expected: (ctx) => {
        const r = ctx.design();
        const q = ctx.byLabel('Q1');
        return r.ok && q ? protectedCurrent(r, q) : null;
      },
    },
    {
      id: 'lim',
      kind: 'choice',
      text: 'Con 4,5 kW impegnati, che cosa comporta questo assorbimento?',
      points: 30,
      options: [
        'Nulla: la potenza disponibile è illimitata',
        'Si supera la potenza disponibile (4,95 kW): il limitatore del contatore può aprire l\'alimentazione',
        'Interviene subito il differenziale',
        'Il neutro va in sovratensione',
      ],
      correct: 1,
      explanation: 'Il simulatore segnala il superamento ma non modella il limitatore del contatore.',
    },
  ],
};

// ------------------------------------------------------------------ livello 4

const l4Corto: Exercise = {
  id: 'l4-cortocircuito',
  level: 4,
  title: 'Ricerca guasti: cortocircuito',
  objective: 'Individuare il circuito in cortocircuito e rimettere in servizio il resto dell\'impianto.',
  theory:
    'Un cortocircuito fa intervenire il magnetico in pochi millisecondi. Se generale e derivata hanno la stessa taratura possono intervenire insieme (mancanza di selettività). Per individuare il circuito guasto si richiudono le protezioni una alla volta.',
  materials: [],
  environment: 'Monolocale 3 kW con un guasto nascosto. Chiudi il generale Q1 e osserva cosa succede.',
  build: () => withFault(monolocale(), 'Prese soggiorno', 'short-LN', 0.02),
  tasks: [
    { id: 'where', kind: 'choice', text: 'Quale circuito è guasto?', points: 25, options: ['Luci', 'Prese soggiorno', 'Forno'], correct: 1 },
    { id: 'what', kind: 'choice', text: 'Di che guasto si tratta?', points: 25, options: ['Sovraccarico', 'Cortocircuito', 'Dispersione verso terra', 'Neutro interrotto'], correct: 1 },
    {
      id: 'restore',
      kind: 'check',
      text: 'Con la simulazione avviata, rimetti in servizio luci e forno lasciando aperto solo il circuito guasto.',
      points: 50,
      check: (ctx) => {
        const st = (l: string) => ctx.byLabel(l)?.closed;
        const ok = ctx.running && !!st('Q1') && !!st('Q2') && !!st('Q3') && !!st('Q5') && !st('Q4');
        return ok ? { ok } : { ok, hint: 'Servono Q1, Q2, Q3 e Q5 chiusi e Q4 (prese) aperto, a impianto alimentato.' };
      },
    },
  ],
};

function sovraccaricoBase(): Project {
  const p = appartamento();
  p.name = 'Esercizio: sovraccarico';
  const pg = p.components.find((c) => c.params.kind === 'load' && c.params.p.name === 'Prese zona giorno')!;
  if (pg.params.kind === 'load') pg.params.p = { ...pg.params.p, name: 'Prese zona giorno', powerW: 5000 };
  for (const c of p.components) if (c.params.kind !== 'load') c.closed = true;
  p.description = 'Nella zona giorno sono collegati stufa, phon e bollitore sulla stessa linea prese.';
  return p;
}

const l4Sovraccarico: Exercise = {
  id: 'l4-sovraccarico',
  level: 4,
  title: 'Ricerca guasti: sovraccarico',
  objective: 'Riconoscere un intervento per sovraccarico e scegliere il rimedio corretto.',
  theory: 'Il sovraccarico non è un guasto dell\'impianto ma un uso oltre la portata del circuito. Aumentare la taratura della protezione lascerebbe il cavo non protetto.',
  materials: [],
  environment: 'Appartamento 4,5 kW con troppi apparecchi sulla linea prese zona giorno. Usa la velocità 60×.',
  build: sovraccaricoBase,
  tasks: [
    {
      id: 'i',
      kind: 'numeric',
      text: 'Corrente sulla linea prese zona giorno:',
      unit: 'A',
      tolerancePct: 2,
      points: 25,
      expected: (ctx) => designLoad(ctx, 'Prese zona giorno')?.i ?? null,
    },
    { id: 'trip', kind: 'check', text: 'Avvia la simulazione e osserva l\'intervento di Q4.', points: 25, check: (ctx) => tripped(ctx, 'Q4', 'termico') },
    {
      id: 'fix',
      kind: 'choice',
      text: 'Qual è il rimedio corretto?',
      points: 50,
      options: [
        'Sostituire Q4 con un magnetotermico da 25 A',
        'Ridurre gli apparecchi contemporanei o realizzare una linea dedicata dimensionata per il carico',
        'Sostituire il differenziale con uno meno sensibile',
        'Collegare il neutro al PE',
      ],
      correct: 1,
      explanation: 'Con 25 A la protezione non rispetterebbe più In ≤ Iz e il cavo potrebbe surriscaldarsi senza che nulla intervenga.',
    },
  ],
};

function dispersioneBase(): Project {
  const p = appartamento();
  p.name = 'Esercizio: dispersione';
  for (const c of p.components) if (c.params.kind !== 'load') c.closed = true;
  p.description = 'Il differenziale Q6 (cucina) interviene ogni tanto, senza un motivo apparente.';
  return withFault(p, 'Forno', 'L-PE', 11000);
}

const l4Dispersione: Exercise = {
  id: 'l4-dispersione',
  level: 4,
  title: 'Ricerca guasti: dispersione',
  objective: 'Trovare con la pinza amperometrica la linea che disperde corrente verso terra.',
  theory:
    'Una pinza che abbraccia fase e neutro di una linea misura la loro somma vettoriale: in un circuito sano è zero, in presenza di una dispersione è pari alla corrente che va verso terra. Tra 0,5 e 1·IΔn il differenziale può intervenire o no.',
  materials: [],
  environment: 'Appartamento 4,5 kW con una dispersione nascosta nel gruppo cucina. Avvia la simulazione, scegli la Pinza e clicca sugli utilizzatori.',
  build: dispersioneBase,
  tasks: [
    { id: 'where', kind: 'choice', text: 'Quale linea disperde?', points: 35, options: ['Luci', 'Prese zona giorno', 'Prese zona notte', 'Forno', 'Lavatrice'], correct: 3 },
    {
      id: 'ileak',
      kind: 'numeric',
      text: 'Corrente di dispersione misurata con la pinza (L+N):',
      unit: 'mA',
      tolerancePct: 5,
      points: 35,
      expected: (ctx) => {
        const r = ctx.design();
        const c = ctx.loadByName('Forno');
        return r.ok && c ? clampReading(r, { kind: 'line', id: c.id }) * 1000 : null;
      },
    },
    {
      id: 'why',
      kind: 'choice',
      text: 'Perché il differenziale da 30 mA non interviene sempre?',
      points: 30,
      options: [
        'Perché è guasto',
        'Perché la dispersione è tra 0,5 e 1·IΔn: l\'intervento è possibile ma non garantito',
        'Perché il forno è spento',
        'Perché la corrente di dispersione passa nel neutro',
      ],
      correct: 1,
    },
  ],
};

function neutroBase(): Project {
  const p = monolocale();
  p.name = 'Esercizio: neutro interrotto';
  for (const c of p.components) if (c.params.kind !== 'load') c.closed = true;
  p.description = 'Le luci non si accendono, ma il magnetotermico Q3 è chiuso.';
  return withFault(p, 'Luci', 'open-N');
}

const l4Neutro: Exercise = {
  id: 'l4-neutro-interrotto',
  level: 4,
  title: 'Ricerca guasti: neutro interrotto',
  objective: 'Diagnosticare un\'interruzione sulla linea con misure di tensione e di resistenza.',
  theory:
    'Se la tensione L-N è presente all\'inizio della linea ma l\'apparecchio non funziona, l\'interruzione è lungo la conduttura o nell\'apparecchio. Con l\'impianto disalimentato una misura di resistenza tra L e N della linea mostra se il circuito è chiuso (resistenza della lampada) o aperto (OL).',
  materials: [],
  environment: 'Monolocale 3 kW con un guasto nascosto sulla linea luci.',
  build: neutroBase,
  tasks: [
    {
      id: 'vln',
      kind: 'numeric',
      text: 'Tensione tra L e N della linea luci, misurata ai morsetti dell\'utilizzatore (lato quadro):',
      unit: 'V',
      tolerancePct: 2,
      points: 30,
      expected: (ctx) => voltageBetween(ctx.design(), term(ctx, 'Luci', 'L'), term(ctx, 'Luci', 'N')),
    },
    {
      id: 'ohm',
      kind: 'choice',
      text: 'A impianto disalimentato, che cosa legge il multimetro in Ω tra L e N della linea luci?',
      points: 35,
      options: ['Circa 176 Ω, la resistenza della lampada', 'OL: circuito aperto', '0 Ω: cortocircuito', 'Circa 50 Ω, la resistenza di terra'],
      correct: 1,
    },
    {
      id: 'what',
      kind: 'choice',
      text: 'Qual è il guasto?',
      points: 35,
      options: ['Magnetotermico difettoso', 'Interruzione di un conduttore della linea luci', 'Dispersione verso terra', 'Sovraccarico'],
      correct: 1,
      explanation: 'Il guasto nascosto è un neutro interrotto: lato apparecchio le parti collegate al neutro si portano al potenziale di fase.',
    },
  ],
};

const l4Cablaggio: Exercise = {
  id: 'l4-cablaggio-errato',
  level: 4,
  title: 'Ricerca guasti: cablaggio errato',
  objective: 'Trovare e correggere gli errori di cablaggio di un quadro con due gruppi differenziali.',
  theory: 'Gli errori di cablaggio più insidiosi non impediscono il funzionamento: neutri scambiati tra gruppi differenziali e conduttori di protezione non identificati.',
  materials: [],
  environment: 'Quadro con due differenziali già cablato e alimentato. Usa la scheda «Cablaggio» per orientarti.',
  build: () => neutriBase(true),
  tasks: [
    { id: 'erc', kind: 'check', text: 'Nessun errore di cablaggio.', points: 40, check: noWiringErrors },
    { id: 'grp', kind: 'check', text: 'Luci e prese su differenziali diversi, ciascuno con il proprio neutro.', points: 30, check: differentRcds },
    { id: 'pw', kind: 'check', text: 'Luci e prese funzionano.', points: 30, check: (ctx) => loadsPowered(ctx, ['Luci', 'Prese']) },
  ],
};

// ------------------------------------------------------------------ livello 5

function distribuzioneBase(): Project {
  const b = new ProjectBuilder('Esercizio: distribuzione sulle fasi', 2, 18);
  b.project.norm = { residential: false, ul: 50 };
  const cnt = b.add('supply-tri', { position: { x: -280, y: 20 } });
  const earth = b.add('earth', { position: { x: -260, y: 440 } });
  const q1 = b.add('mcb-3pn', { rail: { row: 0, slot: 0 } }, (c) => ((c.closed = true), setMcb(c, 32, 'C', 10)));
  const q2 = b.add('rcd-4p', { rail: { row: 0, slot: 4 } }, (c) => (c.closed = true));
  const qs = [9, 10, 11].map((slot) => b.add('mcb-1pn', { rail: { row: 0, slot } }, (c) => ((c.closed = true), setMcb(c, 16))));
  const xn = b.add('bar-n-8', { rail: { row: 1, slot: 0 } });
  const xpe = b.add('bar-pe-8', { rail: { row: 1, slot: 5 } });
  const loads = ['Carico A', 'Carico B', 'Carico C'].map((name, k) =>
    addLoad(b, { catalogId: 'load-generico', name, powerW: 2000, section: 2.5, length: 15 }, -40 + k * 200, 700, 3),
  );
  ['L1', 'L2', 'L3'].forEach((k, i) => b.wire(t(cnt, k), t(q1, `p${i}_in`), 10, 15));
  b.wire(t(cnt, 'N'), t(q1, 'p3_in'), 10, 15);
  for (let i = 0; i < 4; i++) b.wire(t(q1, `p${i}_out`), t(q2, `p${i}_in`), 10, 0.3);
  b.wire(t(q2, 'p3_out'), t(xn, 't0'), 10, 0.4);
  // tutti e tre i circuiti presi dalla fase L1
  b.wire(t(q2, 'p0_out'), t(qs[0]!, 'p0_in'), 4, 0.3);
  bridge(b, qs, 4);
  b.project.wires = b.project.wires.filter((w) => !(w.from === t(qs[0]!, 'p1_in') && w.to === t(qs[1]!, 'p1_in')) && !(w.from === t(qs[1]!, 'p1_in') && w.to === t(qs[2]!, 'p1_in')));
  qs.forEach((q, i) => b.wire(t(xn, `t${i + 1}`), t(q, 'p1_in'), 4, 0.4));
  b.wire(t(earth, 'PE'), t(xpe, 't0'), 10, 5);
  qs.forEach((q, i) => line(b, q, loads[i]!, xpe, i + 1, 2.5));
  b.project.description = 'Tre carichi da 2 kW sono tutti alimentati dalla fase L1. Ridistribuiscili sulle tre fasi.';
  return b.project;
}

const l5Distribuzione: Exercise = {
  id: 'l5-distribuzione',
  level: 5,
  title: 'Distribuzione dei carichi su L1, L2, L3',
  objective: 'Ricollegare i circuiti monofase in modo da equilibrare le correnti di fase e annullare quasi la corrente di neutro.',
  theory:
    'In un sistema trifase i carichi monofase si collegano tra una fase e il neutro. Se le tre fasi sono caricate allo stesso modo, le correnti sono uguali e sfasate di 120°: la loro somma, che percorre il neutro, è nulla.',
  materials: [],
  environment: 'Quadro trifase 3P+N con differenziale 4P; i ponticelli di fase collegano i tre magnetotermici alla sola L1.',
  build: distribuzioneBase,
  tasks: [
    { id: 'pw', kind: 'check', text: 'I tre carichi funzionano.', points: 20, check: (ctx) => loadsPowered(ctx, ['Carico A', 'Carico B', 'Carico C']) },
    {
      id: 'bal',
      kind: 'check',
      text: 'Squilibrio tra le correnti di fase inferiore al 20% e corrente di neutro inferiore a 1 A.',
      points: 50,
      check: (ctx) => {
        const r = ctx.design();
        if (!r.ok) return { ok: false };
        const is = r.supply.phases.map((p) => p.i);
        const max = Math.max(...is);
        const min = Math.min(...is);
        const ok = max > 0 && (max - min) / max < 0.2 && r.supply.iN < 1;
        return ok
          ? { ok }
          : { ok, hint: `Correnti di fase ${is.map((i) => i.toFixed(1)).join(' / ')} A, neutro ${r.supply.iN.toFixed(1)} A.` };
      },
    },
    { id: 'erc', kind: 'check', text: 'Nessun errore di cablaggio e identificazione delle fasi coerente.', points: 30, check: (ctx) => {
      const base = noWiringErrors(ctx);
      if (!base.ok) return base;
      const ph = ctx.issues().filter((i) => i.code === 'PHASE_ID');
      return ph.length ? { ok: false, hint: 'Alcuni conduttori sono identificati con una fase diversa da quella reale: correggi l\'identificazione nel pannello del conduttore.' } : { ok: true };
    } },
  ],
};

const l5Tensioni: Exercise = {
  id: 'l5-tensioni',
  level: 5,
  title: 'Tensioni concatenate e corrente di neutro',
  objective: 'Misurare tensioni di fase e concatenate e calcolare la corrente di neutro con carichi squilibrati.',
  theory: 'La tensione concatenata (tra due fasi) vale √3 volte la tensione di fase: 230 × 1,732 ≈ 400 V. Con carichi squilibrati il neutro porta la somma vettoriale delle tre correnti di fase.',
  materials: [],
  environment: 'Quadro trifase con carichi monofase squilibrati (3 kW, 1 kW, 0,3 kW) e un carico trifase da 6 kW.',
  build: () => {
    const p = trifase();
    for (const c of p.components) if (c.params.kind !== 'load') c.closed = true;
    return p;
  },
  tasks: [
    {
      id: 'u12',
      kind: 'numeric',
      text: 'Tensione concatenata U12 ai morsetti della fornitura:',
      unit: 'V',
      tolerancePct: 1,
      points: 25,
      expected: (ctx) => {
        const r = ctx.design();
        return r.ok && r.supply.lineV.length ? r.supply.lineV[0]! : null;
      },
    },
    {
      id: 'u1n',
      kind: 'numeric',
      text: 'Tensione di fase U1N ai morsetti della fornitura:',
      unit: 'V',
      tolerancePct: 1,
      points: 25,
      expected: (ctx) => {
        const r = ctx.design();
        return r.ok ? r.supply.phases[0]!.v : null;
      },
    },
    {
      id: 'in',
      kind: 'numeric',
      text: 'Corrente nel neutro della fornitura:',
      unit: 'A',
      tolerancePct: 3,
      points: 25,
      expected: (ctx) => {
        const r = ctx.design();
        return r.ok ? r.supply.iN : null;
      },
      explanation: 'Non è la differenza aritmetica tra le correnti: è la somma vettoriale di tre correnti sfasate di 120°. Il carico trifase equilibrato non contribuisce.',
    },
    {
      id: 'sqrt3',
      kind: 'choice',
      text: 'Perché U12 ≈ 400 V se U1N = 230 V?',
      points: 25,
      options: ['Perché 230 + 230 = 460 meno le perdite', 'Perché le due tensioni di fase sono sfasate di 120° e la loro differenza vale √3·230', 'Perché il neutro aggiunge 170 V', 'Perché il contatore trifase innalza la tensione'],
      correct: 1,
    },
  ],
};

function neutroComuneBase(): Project {
  const p = trifase();
  p.name = 'Esercizio: neutro comune interrotto';
  for (const c of p.components) if (c.params.kind !== 'load') c.closed = true;
  const q2 = p.components.find((c) => c.label === 'Q2')!;
  const xn = p.components.find((c) => c.label === 'XN1')!;
  const w = p.wires.find((x) => x.from === `${q2.id}:p3_out` && x.to === `${xn.id}:t0`)!;
  p.faults = [{ id: 'hf-nc', type: 'open-wire', targetId: w.id, resistance: 0, hidden: true }];
  p.description = 'Dopo un intervento di manutenzione le luci sono deboli e i piccoli apparecchi su L3 si sono guastati.';
  return p;
}

const l5NeutroComune: Exercise = {
  id: 'l5-neutro-comune',
  level: 5,
  title: 'Neutro comune interrotto e spostamento del centro stella',
  objective: 'Riconoscere gli effetti dell\'interruzione del neutro comune con carichi squilibrati.',
  theory:
    'Senza neutro i carichi monofase delle tre fasi formano una stella con centro libero. Il suo potenziale (teorema di Millman) si sposta verso la fase più caricata: i carichi piccoli ricevono una tensione vicina alla concatenata (400 V), quelli grandi molto meno di 230 V.',
  materials: [],
  environment: 'Quadro trifase con un guasto nascosto. Osserva il diagramma fasoriale nella dashboard.',
  build: neutroComuneBase,
  tasks: [
    {
      id: 'v3',
      kind: 'numeric',
      text: 'Tensione ai capi dei «Piccoli carichi (L3)»:',
      unit: 'V',
      tolerancePct: 3,
      points: 30,
      expected: (ctx) => designLoad(ctx, 'Piccoli carichi (L3)')?.v ?? null,
    },
    {
      id: 'v1',
      kind: 'numeric',
      text: 'Tensione ai capi del «Forno (L1)»:',
      unit: 'V',
      tolerancePct: 3,
      points: 30,
      expected: (ctx) => designLoad(ctx, 'Forno (L1)')?.v ?? null,
    },
    {
      id: 'why',
      kind: 'choice',
      text: 'Perché il carico più piccolo riceve la tensione più alta?',
      points: 40,
      options: [
        'Perché la sua fase ha più potenza disponibile',
        'Perché, senza neutro, i carichi sono in serie tra le fasi: la resistenza maggiore (carico piccolo) prende la parte maggiore della tensione concatenata',
        'Perché il differenziale 4P è intervenuto',
        'Perché il carico trifase immette tensione nel neutro',
      ],
      correct: 1,
    },
  ],
};

function multipolariBase(): Project {
  const b = new ProjectBuilder('Esercizio: protezioni multipolari', 1, 18);
  b.project.norm = { residential: false, ul: 50 };
  b.add('supply-tri', { position: { x: -280, y: 20 } });
  b.add('earth', { position: { x: -260, y: 380 } });
  addLoad(b, { catalogId: 'load-tri', name: 'Riscaldatore trifase', powerW: 6000, section: 2.5, length: 20 }, 120, 420, 1);
  b.project.description = 'Proteggi e seziona la linea del riscaldatore trifase senza neutro.';
  return b.project;
}

const l5Multipolari: Exercise = {
  id: 'l5-protezioni-multipolari',
  level: 5,
  title: 'Protezioni multipolari per un carico trifase',
  objective: 'Scegliere e collegare le protezioni di un carico trifase equilibrato senza neutro.',
  theory:
    'Un carico trifase senza neutro si protegge con un magnetotermico tripolare: un guasto su una fase apre tutte e tre, evitando il funzionamento su due fasi. Nel sistema TT serve comunque un differenziale; un 4P funziona anche se il neutro non è usato dal carico.',
  materials: ['mcb-3p', 'mcb-3pn', 'mcb-4p', 'rcd-4p', 'switch-4p', 'bar-pe-8'],
  environment: 'Fornitura trifase, dispersore e riscaldatore da 6 kW (2,5 mm², posa B1) già posizionati. Quadro vuoto da 18 moduli.',
  build: multipolariBase,
  tasks: [
    { id: 'pw', kind: 'check', text: 'Il riscaldatore funziona su tutte e tre le fasi.', points: 20, check: (ctx) => loadsPowered(ctx, ['Riscaldatore trifase']) },
    { id: 'erc', kind: 'check', text: 'Nessun errore di cablaggio.', points: 15, check: noWiringErrors },
    { id: 'ol', kind: 'check', text: 'Protezione coordinata con il cavo (433.2).', points: 20, check: (ctx) => ruleAll(ctx, 'OL-433') },
    { id: 'tt', kind: 'check', text: 'Presenza del differenziale (413.1.4.2).', points: 15, check: (ctx) => ruleAll(ctx, 'TT-DIFF') },
    { id: 'sez', kind: 'check', text: 'Sezionamento su tutte le fasi (462.1).', points: 15, check: (ctx) => ruleAll(ctx, 'SEZ-462') },
    {
      id: 'why3p',
      kind: 'choice',
      text: 'Perché non si usano tre magnetotermici unipolari separati?',
      points: 15,
      options: ['Costano di più', 'Se ne interviene uno solo, il carico resta alimentato da due fasi', 'Non esistono unipolari da 16 A', 'Perché il neutro non sarebbe protetto'],
      correct: 1,
    },
  ],
};

export const EXERCISES: Exercise[] = [
  l1Basi,
  l1Potenza,
  l1Magnetotermico,
  l1Differenziale,
  l2PrimoQuadro,
  l2Neutri,
  l3Dimensionamento,
  l3Carichi,
  l4Corto,
  l4Sovraccarico,
  l4Dispersione,
  l4Neutro,
  l4Cablaggio,
  l5Distribuzione,
  l5Tensioni,
  l5NeutroComune,
  l5Multipolari,
  ...L6_EXERCISES,
];

export const exerciseById = (id: string) => EXERCISES.find((e) => e.id === id);

