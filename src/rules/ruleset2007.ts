import { getPoles } from '../model/terminals';
import type { ComponentInstance } from '../model/types';
import { magneticZone, MAGNETIC_BAND, thermalTripTime } from '../protection/curves';
import { AMPACITY_SOURCE, K_ADIABATIC } from './ampacity';
import type { CircuitCtx, NormCtx } from './context';
import type { NormRef, Rule, RuleOutcome, RuleSet } from './types';

/**
 * Regole verificate sul testo CEI 64-8:2007 (6ª edizione, gennaio 2007) fornito dall'utente.
 * Per ogni regola è indicato anche l'articolo presunto dell'edizione vigente (IX, in vigore dal
 * 1/11/2024): la corrispondenza NON è verificata sul testo ufficiale e va controllata.
 */

const E07 = 'CEI 64-8:2007';
const EIX = 'CEI 64-8 IX ed. (vigente dal 1/11/2024)';
const r07 = (article: string, note?: string): NormRef => ({ edition: E07, article, verified: true, ...(note ? { note } : {}) });
const rIX = (article: string): NormRef => ({
  edition: EIX,
  article,
  verified: false,
  note: 'Corrispondenza presunta (numerazione armonizzata HD 60364): non verificata sul testo ufficiale vigente.',
});

const f = (v: number, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const fA = (a: number) => (a >= 1000 ? `${f(a / 1000, 2)} kA` : `${f(a, a >= 100 ? 0 : 1)} A`);

type R = Rule<NormCtx>;

const ocpParams = (c: ComponentInstance | undefined) =>
  c && (c.params.kind === 'mcb' || c.params.kind === 'rcbo') ? c.params.p : null;
const idnOf = (c: ComponentInstance) => (c.params.kind === 'rcd' || c.params.kind === 'rcbo' ? c.params.p.idn : null);

const fedCircuits = (ctx: NormCtx) => ctx.circuits.filter((c) => c.info.lConnected && c.info.nConnected);

// ------------------------------------------------------------------ 1. contatti elettrici

const contattiDiretti: R = {
  id: 'CD-412',
  version: '1.0',
  title: 'Protezione contro i contatti diretti',
  description: 'Isolamento delle parti attive, involucri e barriere.',
  area: 'Protezione contro i contatti elettrici',
  scope: 'Tutto l\'impianto',
  severity: 'errore',
  explanation:
    'Le parti attive devono essere inaccessibili: isolate (412.1) oppure poste entro involucri o dietro barriere (412.2). Il differenziale da 30 mA è solo una protezione addizionale e non sostituisce queste misure (412.5.2).',
  refs: [r07('412.1'), r07('412.2'), r07('412.5.2')],
  requiredData: ['Esame a vista di involucri, coperture, grado di protezione'],
  evaluate: () => [
    {
      ruleId: 'CD-412',
      status: 'verifica-campo',
      subject: 'Impianto',
      message: 'Isolamento, involucri e barriere non sono rappresentati nel modello: vanno accertati con l\'esame a vista.',
      componentIds: [],
    },
  ],
};

const ttReIdn: R = {
  id: 'TT-RE-IDN',
  version: '1.0',
  title: 'Sistema TT: coordinamento dispersore-differenziale',
  description: 'RE × IΔn ≤ UL per ogni differenziale che protegge masse.',
  area: 'Protezione contro i contatti elettrici',
  scope: 'Sistemi TT, dispositivi differenziali che proteggono masse',
  severity: 'errore',
  explanation:
    'In un guasto a massa la corrente si richiude attraverso il dispersore: la massa assume la tensione RE × Ig. Se il differenziale interviene per Ig ≥ IΔn, la tensione di contatto massima che può permanere senza intervento è RE × IΔn, che non deve superare la tensione di contatto limite UL (50 V in c.a., art. 22.4 e Nota 1 a 413.1.1.1; valori inferiori per luoghi speciali secondo la Nota 3).',
  refs: [r07('413.1.4.2'), r07('22.4', 'Definizione di UL'), r07('413.1.1.1', 'Nota 1: UL = 50 V c.a.; Nota 3: valori inferiori per luoghi speciali'), rIX('411.5.3')],
  requiredData: ['Resistenza del dispersore RE (misurata)', 'IΔn dei differenziali', 'UL dell\'ambiente'],
  evaluate: (ctx) => {
    const out: RuleOutcome[] = [];
    const earth = ctx.earths[0];
    const rcds = ctx.devices.filter((d) => idnOf(d) !== null);
    if (!earth || earth.params.kind !== 'earth') {
      return [
        {
          ruleId: 'TT-RE-IDN',
          status: 'errore',
          subject: 'Impianto di terra',
          message: 'Impianto di terra assente: la condizione non può essere soddisfatta.',
          componentIds: [],
        },
      ];
    }
    const re = earth.params.p.ra;
    const measured = !!earth.params.p.raMeasured;
    for (const d of rcds) {
      const idn = idnOf(d)! / 1000;
      const ut = re * idn;
      const ok = ut <= ctx.settings.ul;
      out.push({
        ruleId: 'TT-RE-IDN',
        status: !ok ? 'errore' : measured ? 'conforme' : 'verifica-campo',
        subject: d.label,
        message: ok
          ? measured
            ? `RE × IΔn = ${f(re, 1)} Ω × ${f(idn, 3)} A = ${f(ut, 2)} V ≤ UL = ${ctx.settings.ul} V.`
            : `Con RE di progetto ${f(re, 1)} Ω: ${f(ut, 2)} V ≤ ${ctx.settings.ul} V. Il valore di RE va misurato sul campo (61.3.6.2).`
          : `RE × IΔn = ${f(ut, 1)} V > UL = ${ctx.settings.ul} V: serve RE ≤ ${f(ctx.settings.ul / idn, 0)} Ω oppure un differenziale più sensibile (413.1.4.3: collegamento equipotenziale supplementare se non soddisfatta).`,
        details: [`RE = ${f(re, 1)} Ω (${measured ? 'misurata' : 'valore di progetto'})`, `IΔn = ${idnOf(d)} mA`, `UL = ${ctx.settings.ul} V`],
        componentIds: [d.id, earth.id],
      });
    }
    return out;
  },
};

// ------------------------------------------------------------------ 5. differenziale

const ttDiff: R = {
  id: 'TT-DIFF',
  version: '1.0',
  title: 'Sistema TT: impiego di dispositivi differenziali',
  description: 'Ogni circuito di un sistema TT deve essere protetto da un differenziale.',
  area: 'Protezione differenziale',
  scope: 'Circuiti utilizzatori in sistema TT',
  severity: 'errore',
  explanation:
    'Nel sistema TT la corrente di guasto a terra è limitata dalle resistenze di terra (RE + RB) a pochi ampere: in genere insufficiente a far intervenire rapidamente un magnetotermico. Per questo la norma richiede dispositivi a corrente differenziale.',
  refs: [r07('413.1.4.2'), rIX('411.5')],
  requiredData: ['Schema dei circuiti'],
  evaluate: (ctx) =>
    fedCircuits(ctx).map((c) => ({
      ruleId: 'TT-DIFF',
      status: c.rcds.length ? 'conforme' : 'errore',
      subject: c.name,
      message: c.rcds.length
        ? `Protetto da ${c.rcds.map((d) => `${d.label} (${idnOf(d)} mA)`).join(', ')}.`
        : `Nessun differenziale a monte${c.iccEnd.lpe !== null ? `: un guasto franco a massa produrrebbe solo ${fA(c.iccEnd.lpe)}` : ''}.`,
      componentIds: [c.load.id, ...c.rcds.map((d) => d.id)],
    })),
};

// ------------------------------------------------------------------ 6. impianto di terra

const masseATerra: R = {
  id: 'TT-MASSE',
  version: '1.0',
  title: 'Masse collegate all\'impianto di terra',
  description: 'Le masse protette dallo stesso dispositivo devono essere collegate allo stesso impianto di terra.',
  area: 'Impianto di terra',
  scope: 'Masse degli utilizzatori',
  severity: 'errore',
  explanation:
    'Senza continuità del conduttore di protezione la corrente di guasto a massa non trova un percorso verso terra: il differenziale non vede corrente differenziale e la massa resta in tensione.',
  refs: [r07('413.1.4.1'), rIX('411.5.1')],
  requiredData: ['Collegamenti PE'],
  evaluate: (ctx) =>
    ctx.circuits.map((c) => ({
      ruleId: 'TT-MASSE',
      status: c.info.peConnected ? 'conforme' : 'errore',
      subject: c.name,
      message: c.info.peConnected ? 'La massa è collegata al dispersore tramite il PE.' : 'Massa non collegata all\'impianto di terra.',
      componentIds: [c.load.id],
    })),
};

const sezionePE: R = {
  id: 'PE-SEZ',
  version: '1.0',
  title: 'Sezione dei conduttori di protezione',
  description: 'Sezione minima del PE in funzione della sezione di fase (Tab. 54F).',
  area: 'Impianto di terra',
  scope: 'Conduttori PE del quadro e delle linee',
  severity: 'errore',
  explanation:
    'Il PE deve sopportare la corrente di guasto senza danneggiarsi. Con la Tab. 54F (S ≤ 16 mm² → Sp = S; 16 < S ≤ 35 → 16 mm²; S > 35 → S/2) non serve il calcolo di 543.1.1. Un PE comune a più circuiti va dimensionato sulla fase di sezione maggiore (543.1.4).',
  refs: [r07('543.1.2'), r07('543.1.4'), rIX('543.1.2')],
  requiredData: ['Sezioni dei conduttori'],
  evaluate: (ctx) => {
    const req = (s: number) => (s <= 16 ? s : s <= 35 ? 16 : s / 2);
    const out: RuleOutcome[] = [];
    const loadOfPeNet = new Map<string, CircuitCtx[]>();
    for (const c of ctx.circuits) {
      const net = ctx.graph.netOf(`${c.load.id}:PE`);
      loadOfPeNet.set(net, [...(loadOfPeNet.get(net) ?? []), c]);
    }
    for (const w of ctx.project.wires) {
      if (w.conductor !== 'PE') continue;
      const touchesEarth = [w.from, w.to].some((t) => ctx.earths.some((e) => t === `${e.id}:PE`));
      const loadEnd = ctx.circuits.find((c) => w.from === `${c.load.id}:PE` || w.to === `${c.load.id}:PE`);
      const served = loadEnd ? [loadEnd] : touchesEarth ? ctx.circuits : (loadOfPeNet.get(ctx.graph.netOf(w.from)) ?? []);
      if (!served.length) continue;
      const maxPhase = Math.max(...served.map((c) => c.p.cableSection));
      const need = req(maxPhase);
      if (touchesEarth) {
        out.push({
          ruleId: 'PE-SEZ',
          status: 'dati-insufficienti',
          subject: 'Conduttore di terra',
          message: `Il conduttore tra collettore e dispersore (${w.section} mm²) ha prescrizioni proprie per i conduttori di terra non implementate nel simulatore.`,
          componentIds: [],
        });
        continue;
      }
      out.push({
        ruleId: 'PE-SEZ',
        status: w.section >= need ? 'conforme' : 'errore',
        subject: loadEnd ? `PE verso ${loadEnd.name}` : 'PE comune',
        message: `Sezione ${w.section} mm², richiesta ≥ ${need} mm² (fase max ${maxPhase} mm²).`,
        componentIds: served.map((c) => c.load.id),
      });
    }
    for (const c of ctx.circuits) {
      out.push({
        ruleId: 'PE-SEZ',
        status: 'conforme',
        subject: `Linea ${c.name}`,
        message: `Il PE della conduttura ha la stessa sezione delle fasi (${c.p.cableSection} mm²) nel modello: Tab. 54F soddisfatta.`,
        componentIds: [c.load.id],
      });
    }
    return out;
  },
};

// ------------------------------------------------------------------ 2/4. sovracorrenti e coordinamento

const sovraccarico: R = {
  id: 'OL-433',
  version: '1.0',
  title: 'Protezione contro il sovraccarico: coordinamento cavo-protezione',
  description: 'IB ≤ In ≤ Iz e If ≤ 1,45 Iz.',
  area: 'Coordinamento cavo-protezione',
  scope: 'Condutture terminali verso gli utilizzatori',
  severity: 'errore',
  explanation:
    'La protezione deve lasciar passare la corrente d\'impiego IB (IB ≤ In) e intervenire prima che il cavo si surriscaldi (In ≤ Iz). If è la corrente che assicura l\'intervento entro il tempo convenzionale: per gli interruttori automatici è la corrente convenzionale di funzionamento (533.2), pari a 1,45·In per i magnetotermici CEI EN 60898-1, per cui la seconda condizione equivale a In ≤ Iz. Iz è la portata reale del cavo: dipende da posa, isolante, temperatura e raggruppamento, non solo dalla sezione.',
  refs: [r07('433.2'), r07('523.1.2', 'Portate da Tabelle CEI-UNEL 35024/1'), r07('533.2', 'Valore di If per interruttori automatici'), rIX('433.1')],
  requiredData: ['Potenza dell\'utilizzatore (IB)', 'In della protezione', 'Metodo di posa', 'Isolante', 'Temperatura ambiente', 'Circuiti raggruppati (oppure Iz da tabella/costruttore)'],
  evaluate: (ctx) =>
    fedCircuits(ctx).map((c): RuleOutcome => {
      const p = ocpParams(c.ocp);
      if (!p || !c.ocp) {
        return {
          ruleId: 'OL-433',
          status: 'errore',
          subject: c.name,
          message: 'Nessun dispositivo di protezione contro i sovraccarichi sulla fase (433.1).',
          componentIds: [c.load.id],
        };
      }
      if (!c.iz) {
        return {
          ruleId: 'OL-433',
          status: 'dati-insufficienti',
          subject: c.name,
          message: `IB = ${fA(c.ib)}, In = ${p.in} A: manca la portata Iz della conduttura.`,
          missingData: ['metodo di posa', 'isolante', 'temperatura ambiente', 'numero di circuiti raggruppati', 'oppure Iz da tabella CEI-UNEL / costruttore'],
          componentIds: [c.load.id, c.ocp.id],
        };
      }
      const iz = c.iz.value;
      const iF = 1.45 * p.in;
      const c1a = c.ib <= p.in;
      const c1b = p.in <= iz;
      const c2 = iF <= 1.45 * iz;
      const details = [
        c.p.phases === 3 ? `IB = P / (3 × U0) = ${f(c.p.powerW, 0)} W / 690 V = ${fA(c.ib)} (carico trifase equilibrato)` : `IB = P / U0 = ${f(c.p.powerW, 0)} W / 230 V = ${fA(c.ib)}`,
        `In = ${p.in} A (${c.ocp.label}, curva ${p.curve})`,
        c.iz.source === 'utente'
          ? `Iz = ${f(iz, 1)} A (inserita dall'utente)`
          : `Iz = I0 × k1 × k2 = ${f(c.iz.calc!.i0, 1)} × ${f(c.iz.calc!.k1, 2)} × ${f(c.iz.calc!.k2, 2)} = ${f(iz, 1)} A — ${c.p.cableSection} mm², posa ${c.install?.method}, ${c.install?.insulation}, ${c.install?.ambientC} °C, ${c.install?.grouped} circuiti`,
        `If = 1,45 × In = ${f(iF, 1)} A ≤ 1,45 × Iz = ${f(1.45 * iz, 1)} A → ${c2 ? 'sì' : 'no'}`,
        ...(c.iz.source === 'tabella' ? [AMPACITY_SOURCE] : []),
      ];
      const ok = c1a && c1b && c2;
      return {
        ruleId: 'OL-433',
        status: ok ? 'conforme' : 'errore',
        subject: c.name,
        message: ok
          ? `${fA(c.ib)} ≤ ${p.in} A ≤ ${f(iz, 1)} A: condizioni soddisfatte.`
          : !c1a
            ? `IB = ${fA(c.ib)} > In = ${p.in} A: la protezione interverrebbe in servizio ordinario (sottodimensionata per il carico).`
            : `In = ${p.in} A > Iz = ${f(iz, 1)} A: il cavo non è protetto dal sovraccarico (conduttore sottodimensionato o protezione troppo grande).`,
        details,
        componentIds: [c.load.id, c.ocp.id],
      };
    }),
};

const potereInterruzione: R = {
  id: 'SC-434-PDI',
  version: '1.0',
  title: 'Potere di interruzione',
  description: 'Il potere di interruzione non deve essere inferiore alla Icc presunta nel punto di installazione.',
  area: 'Protezione contro le sovracorrenti',
  scope: 'Magnetotermici e magnetotermici differenziali',
  severity: 'errore',
  explanation:
    'Se la corrente di cortocircuito supera il potere di interruzione, l\'interruttore può non riuscire a estinguere l\'arco e danneggiarsi. È ammesso un potere inferiore solo se a monte c\'è un dispositivo con il potere necessario e i due sono coordinati secondo i dati del costruttore (protezione di back-up).',
  refs: [r07('434.3.1'), r07('434.2', 'Determinazione delle Icc presunte'), rIX('434.5.1')],
  requiredData: ['Impedenza della rete', 'Icc dichiarata dal distributore (opzionale)', 'Icn dei dispositivi'],
  evaluate: (ctx) => {
    const out: RuleOutcome[] = [];
    const declared = ctx.settings.declaredIccKA ? ctx.settings.declaredIccKA * 1000 : null;
    for (const d of ctx.devices) {
      const p = ocpParams(d);
      if (!p) continue;
      let icc = ctx.deviceIcc.get(d.id) ?? null;
      const atOrigin = getPoles(d).some((pl) => ctx.graph.distance.get(ctx.graph.netOf(`${d.id}:${pl.inKey}`)) === 0);
      if (declared !== null && atOrigin) icc = Math.max(icc ?? 0, declared);
      if (icc === null) {
        out.push({
          ruleId: 'SC-434-PDI',
          status: 'dati-insufficienti',
          subject: d.label,
          message: 'Icc presunta non calcolabile in questo punto (dispositivo senza polo di neutro o non collegato alla fornitura).',
          componentIds: [d.id],
        });
        continue;
      }
      const icnA = p.icn * 1000;
      if (icc <= icnA) {
        out.push({
          ruleId: 'SC-434-PDI',
          status: 'conforme',
          subject: d.label,
          message: `Icc presunta ${fA(icc)} ≤ Icn ${f(p.icn, 1)} kA.`,
          details: [declared !== null && atOrigin ? `Considerata la Icc dichiarata dal distributore (${f(declared / 1000, 1)} kA)` : 'Icc massima calcolata dal modello (guasto franco L-N e, se trifase, trifase simmetrico ai morsetti di valle)'],
          componentIds: [d.id],
        });
        continue;
      }
      const upstream = ctx.circuits
        .flatMap((c) => {
          const i = c.info.lDevices.indexOf(d.id);
          return i > 0 ? c.info.lDevices.slice(0, i) : [];
        })
        .map((id) => ctx.devices.find((x) => x.id === id)!)
        .filter((u) => (ocpParams(u)?.icn ?? 0) * 1000 >= icc!);
      out.push({
        ruleId: 'SC-434-PDI',
        status: upstream.length ? 'dati-insufficienti' : 'errore',
        subject: d.label,
        message: upstream.length
          ? `Icc ${fA(icc)} > Icn ${f(p.icn, 1)} kA, ma a monte c'è ${upstream[0]!.label} con potere sufficiente: ammesso solo con coordinamento di back-up dichiarato dal costruttore.`
          : `Icc presunta ${fA(icc)} > Icn ${f(p.icn, 1)} kA e nessun dispositivo a monte ha il potere necessario.`,
        componentIds: [d.id],
      });
    }
    return out;
  },
};

const energiaPassante: R = {
  id: 'SC-434-I2T',
  version: '1.0',
  title: 'Cortocircuito a fondo linea: tempo di interruzione e I²t ≤ K²S²',
  description: 'Le correnti di cortocircuito devono essere interrotte prima che i conduttori raggiungano la temperatura limite.',
  area: 'Coordinamento cavo-protezione',
  scope: 'Condutture terminali, cortocircuito minimo a fondo linea',
  severity: 'errore',
  explanation:
    'Durante un cortocircuito il riscaldamento del cavo è adiabatico: il conduttore sopporta un\'energia specifica K²S² (K = 115 rame/PVC, 143 rame/EPR). Il caso critico è spesso il cortocircuito a fondo linea, dove la corrente è minima e la protezione può essere lenta. Per durate < 0,1 s il confronto va fatto con l\'I²t lasciato passare dichiarato dal costruttore (Nota 1).',
  refs: [r07('434.3.2'), rIX('434.5.2')],
  requiredData: ['Icc minima a fondo linea', 'Isolante (K)', 'Sezione', 'Caratteristica di intervento / I²t del costruttore'],
  evaluate: (ctx) =>
    fedCircuits(ctx).flatMap((c): RuleOutcome[] => {
      const p = ocpParams(c.ocp);
      if (!p || !c.ocp || c.iccEnd.ln === null) return [];
      if (!c.install) {
        return [
          {
            ruleId: 'SC-434-I2T',
            status: 'dati-insufficienti',
            subject: c.name,
            message: 'Manca l\'isolante della conduttura (serve per K).',
            missingData: ['isolante (PVC o EPR)'],
            componentIds: [c.load.id],
          },
        ];
      }
      const k = K_ADIABATIC[c.install.insulation];
      const s = c.p.cableSection;
      const k2s2 = k * k * s * s;
      const ik = c.iccEnd.ln;
      const ratio = ik / p.in;
      const zone = magneticZone(ratio, p.curve);
      const base = [`Icc minima a fondo linea ≈ ${fA(ik)} (${f(ratio, 1)}·In)`, `K²S² = ${k}² × ${s}² = ${Math.round(k2s2).toLocaleString('it-IT')} A²s`];
      if (zone === 'certa') {
        return [
          {
            ruleId: 'SC-434-I2T',
            status: 'dati-insufficienti',
            subject: c.name,
            message: `Intervento magnetico certo (≥ ${MAGNETIC_BAND[p.curve][1]}·In), durata < 0,1 s: confrontare K²S² con l'I²t lasciato passare indicato dal costruttore di ${c.ocp.label}.`,
            details: base,
            missingData: [`I²t lasciato passare da ${c.ocp.label} a ${fA(ik)}`],
            componentIds: [c.load.id, c.ocp.id],
          },
        ];
      }
      const t = thermalTripTime(0, ratio);
      if (!Number.isFinite(t) || t > 5) {
        return [
          {
            ruleId: 'SC-434-I2T',
            status: 'errore',
            subject: c.name,
            message: `A fondo linea ${fA(ik)} non raggiunge la soglia magnetica: interruzione ${Number.isFinite(t) ? `in circa ${f(t, 0)} s (modello)` : 'non garantita'}, oltre i 5 s di validità della formula. Ridurre la lunghezza, aumentare la sezione o usare una curva con soglia magnetica più bassa.`,
            details: base,
            componentIds: [c.load.id, c.ocp.id],
          },
        ];
      }
      const i2t = ik * ik * t;
      return [
        {
          ruleId: 'SC-434-I2T',
          status: i2t <= k2s2 ? 'dati-insufficienti' : 'errore',
          subject: c.name,
          message:
            i2t <= k2s2
              ? `Verifica indicativa superata (I²t ≈ ${Math.round(i2t).toLocaleString('it-IT')} A²s ≤ K²S²) con il tempo del modello sintetico (${f(t, 2)} s): confermare con la curva del costruttore.`
              : `I²t ≈ ${Math.round(i2t).toLocaleString('it-IT')} A²s > K²S²: il cavo supererebbe la temperatura limite prima dell'intervento.`,
          details: [...base, `Tempo di intervento (modello termico, zona ${zone === 'incerta' ? 'magnetica incerta' : 'termica'}) ≈ ${f(t, 2)} s`],
          componentIds: [c.load.id, c.ocp.id],
        },
      ];
    }),
};

// ------------------------------------------------------------------ 3. condutture

const sezioniMinime: R = {
  id: 'SEZ-524',
  version: '1.0',
  title: 'Sezioni minime dei conduttori',
  description: 'Circuiti di potenza in rame: almeno 1,5 mm² (Tab. 52E).',
  area: 'Dimensionamento delle condutture',
  scope: 'Conduttori del quadro e delle linee',
  severity: 'errore',
  explanation: 'La sezione minima garantisce resistenza meccanica e una portata minima; non sostituisce il dimensionamento termico (433) e per caduta di tensione (525).',
  refs: [r07('524.1', 'Tab. 52E'), rIX('524.1')],
  requiredData: ['Sezioni'],
  evaluate: (ctx) => {
    const small = ctx.project.wires.filter((w) => w.section < 1.5);
    const smallLines = ctx.circuits.filter((c) => c.p.cableSection < 1.5);
    return [
      {
        ruleId: 'SEZ-524',
        status: small.length || smallLines.length ? 'errore' : 'conforme',
        subject: 'Impianto',
        message: small.length || smallLines.length ? `${small.length + smallLines.length} conduttori sotto 1,5 mm².` : 'Tutti i conduttori di potenza hanno sezione ≥ 1,5 mm².',
        componentIds: smallLines.map((c) => c.load.id),
      },
    ];
  },
};

const identificazione: R = {
  id: 'ID-514',
  version: '1.0',
  title: 'Identificazione dei conduttori di neutro e di protezione',
  description: 'Neutro blu; PE giallo/verde e giallo/verde solo per il PE.',
  area: 'Dimensionamento delle condutture',
  scope: 'Tutti i conduttori',
  severity: 'errore',
  explanation:
    'Chi interviene sull\'impianto riconosce la funzione di un conduttore dal colore: il neutro è identificato dal colore blu per tutta la lunghezza (514.3.2); la combinazione giallo/verde identifica il conduttore di protezione e non deve essere usata per altri scopi (514.3.3).',
  refs: [r07('514.3.2'), r07('514.3.3'), rIX('514.3')],
  requiredData: ['Colori dei conduttori'],
  evaluate: (ctx) => {
    const bad = ctx.project.wires.filter(
      (w) => (w.conductor === 'N' && w.color !== 'blu') || (w.conductor === 'PE' && w.color !== 'giallo-verde') || (w.conductor !== 'PE' && w.color === 'giallo-verde'),
    );
    return [
      {
        ruleId: 'ID-514',
        status: bad.length ? 'errore' : 'conforme',
        subject: 'Conduttori del quadro',
        message: bad.length ? `${bad.length} conduttori con colore non coerente con la funzione.` : 'Neutri blu e PE giallo/verde; giallo/verde non usato per altri conduttori.',
        componentIds: [],
      },
    ];
  },
};

const cadutaTensione: R = {
  id: 'CDT-525',
  version: '1.0',
  title: 'Caduta di tensione',
  description: 'Raccomandazione: caduta tra origine e utilizzatore non superiore al 4%.',
  area: 'Dimensionamento delle condutture',
  scope: 'Ogni utilizzatore, tutti i carichi accesi',
  severity: 'attenzione',
  explanation:
    'È una raccomandazione ("si raccomanda"), non una prescrizione: una caduta eccessiva riduce le prestazioni degli apparecchi. Il valore è calcolato dal modello con tutti gli utilizzatori accesi alla potenza nominale.',
  refs: [r07('525'), rIX('525')],
  requiredData: ['Lunghezze e sezioni', 'Potenze'],
  evaluate: (ctx) =>
    ctx.circuits.map((c) => ({
      ruleId: 'CDT-525',
      status: c.dropPct === null ? 'dati-insufficienti' : c.dropPct <= 4 ? 'conforme' : 'attenzione',
      subject: c.name,
      message: c.dropPct === null ? 'Utilizzatore non alimentato nel modello.' : `Caduta di tensione ${f(c.dropPct, 2)}% (raccomandato ≤ 4%).`,
      componentIds: [c.load.id],
    })),
};

// ------------------------------------------------------------------ 7. sezionamento

const sezionamento: R = {
  id: 'SEZ-462',
  version: '1.0',
  title: 'Sezionamento su tutti i conduttori attivi',
  description: 'Ogni circuito deve poter essere sezionato su fase e neutro.',
  area: 'Sezionamento e comando',
  scope: 'Circuiti utilizzatori',
  severity: 'errore',
  explanation:
    'Per lavorare in sicurezza occorre poter separare il circuito dall\'alimentazione su tutti i conduttori attivi; nel sistema TT il neutro è un conduttore attivo e va sezionato (l\'eccezione di 461.2 riguarda il PEN dei sistemi TN-C). L\'idoneità al sezionamento del dispositivo è dichiarata dal costruttore (537.2).',
  refs: [r07('462.1'), r07('537.2.1'), rIX('Capitolo 46')],
  requiredData: ['Poli dei dispositivi', 'Idoneità al sezionamento (costruttore)'],
  evaluate: (ctx) =>
    fedCircuits(ctx).map((c) => {
      // Con neutro: un dispositivo deve aprire fase e neutro. Senza neutro (carico trifase): un dispositivo che apra le tre fasi.
      const both = c.info.hasNeutral
        ? c.info.lDevices.filter((id) => c.info.nDevices.includes(id))
        : c.info.lDevices.filter((id) => (ctx.devices.find((d) => d.id === id) ? getPoles(ctx.devices.find((d) => d.id === id)!).filter((p) => p.fn === 'L').length >= 3 : false));
      return {
        ruleId: 'SEZ-462',
        status: both.length ? 'conforme' : 'errore',
        subject: c.name,
        message: both.length
          ? `Sezionabile su fase e neutro con ${both.map((id) => ctx.devices.find((d) => d.id === id)?.label).join(', ')}.`
          : 'Nessun dispositivo interrompe insieme fase e neutro del circuito.',
        componentIds: [c.load.id, ...both],
      };
    }),
};

// ------------------------------------------------------------------ 8. suddivisione

const suddivisione: R = {
  id: 'DIV-314',
  version: '1.0',
  title: 'Suddivisione dell\'impianto in circuiti',
  description: 'L\'impianto deve essere in genere suddiviso in più circuiti.',
  area: 'Suddivisione dei circuiti',
  scope: 'Impianto',
  severity: 'attenzione',
  explanation:
    'Suddividere i circuiti limita le conseguenze di un guasto (es. un guasto sulle prese non spegne la luce) e facilita prove e manutenzione. La norma lo richiede "in genere", senza un numero minimo nell\'edizione 2007.',
  refs: [r07('314.1'), r07('314.2'), rIX('314.1')],
  requiredData: ['Schema dei circuiti'],
  evaluate: (ctx) => {
    const fed = fedCircuits(ctx);
    const byOcp = new Map<string, CircuitCtx[]>();
    for (const c of fed) if (c.ocp) byOcp.set(c.ocp.id, [...(byOcp.get(c.ocp.id) ?? []), c]);
    const shared = [...byOcp.values()].filter((l) => l.length > 1);
    const rcdSets = new Set(fed.map((c) => c.rcds.map((d) => d.id).join(',')));
    const out: RuleOutcome[] = [
      {
        ruleId: 'DIV-314',
        status: shared.length ? 'attenzione' : 'conforme',
        subject: 'Circuiti terminali',
        message: shared.length
          ? `Più utilizzatori sotto lo stesso magnetotermico: ${shared.map((l) => l.map((c) => c.load.label).join(' + ')).join('; ')}.`
          : `${fed.length} circuiti, ciascuno con la propria protezione contro le sovracorrenti.`,
        componentIds: shared.flat().map((c) => c.load.id),
      },
    ];
    if (fed.length > 1 && rcdSets.size === 1 && fed[0]!.rcds.length) {
      out.push({
        ruleId: 'DIV-314',
        status: 'attenzione',
        subject: 'Differenziali',
        message: 'Un solo gruppo differenziale per tutti i circuiti: un guasto a terra disalimenta l\'intero impianto. Valutare più gruppi differenziali (314.1: ridurre gli inconvenienti in caso di guasto).',
        componentIds: fed[0]!.rcds.map((d) => d.id),
      });
    }
    return out;
  },
};

// ------------------------------------------------------------------ 9. sovratensioni

const sovratensioni: R = {
  id: 'SPD-443',
  version: '1.0',
  title: 'Protezione contro le sovratensioni',
  description: 'Valutazione delle sovratensioni di origine atmosferica e di manovra.',
  area: 'Protezione dalle sovratensioni',
  scope: 'Impianto',
  severity: 'attenzione',
  explanation:
    'La necessità di SPD dipende dalla rete di alimentazione (aerea o interrata), dal livello ceraunico, dal luogo e dalla tenuta a impulso dei componenti (443.1, 443.2). Senza questi dati la verifica non è possibile. La scelta degli SPD (534) non è ancora simulata.',
  refs: [r07('443.1'), r07('443.4'), r07('534'), rIX('443')],
  requiredData: ['Tipo di linea di alimentazione', 'Livello ceraunico', 'Valutazione del rischio', 'Categorie di tenuta a impulso'],
  evaluate: () => [
    {
      ruleId: 'SPD-443',
      status: 'dati-insufficienti',
      subject: 'Impianto',
      message: 'Dati per la valutazione delle sovratensioni non disponibili nel progetto; scelta degli SPD: funzionalità non implementata.',
      missingData: ['linea aerea o interrata', 'livello ceraunico', 'valutazione del rischio'],
      componentIds: [],
    },
  ],
};

// ------------------------------------------------------------------ 10. residenziale

const addizionale30mA: R = {
  id: 'RES-412.5.3',
  version: '1.0',
  title: 'Prese a spina nei locali ad uso abitativo: differenziale ≤ 30 mA',
  description: 'Protezione addizionale con IΔn ≤ 30 mA per i circuiti prese ≤ 20 A.',
  area: 'Prescrizioni per ambienti residenziali',
  scope: 'Locali ad uso abitativo, circuiti che alimentano prese a spina con In ≤ 20 A',
  severity: 'errore',
  explanation:
    'Un differenziale ad alta sensibilità limita le conseguenze di un contatto diretto quando le altre misure falliscono (es. apparecchio danneggiato collegato a una presa). Nell\'edizione 2007 è richiesto nei locali ad uso abitativo per i circuiti prese fino a 20 A; nell\'edizione vigente il campo di applicazione è stato esteso (da verificare sul testo ufficiale).',
  refs: [r07('412.5.3 a)'), r07('412.5.1'), rIX('411.3.3')],
  requiredData: ['Destinazione dei locali', 'Presenza e corrente nominale delle prese'],
  evaluate: (ctx) => {
    if (!ctx.settings.residential) return [];
    return fedCircuits(ctx)
      .filter((c) => c.hasSockets && (c.p.socketRating ?? 16) <= 20)
      .map((c) => {
        const best = Math.min(Infinity, ...c.rcds.map((d) => idnOf(d) ?? Infinity));
        return {
          ruleId: 'RES-412.5.3',
          status: best <= 30 ? 'conforme' : 'errore',
          subject: c.name,
          message: best <= 30 ? `Protetto con IΔn = ${best} mA.` : c.rcds.length ? `Differenziale più sensibile a monte: ${best} mA (> 30 mA).` : 'Nessun differenziale a monte.',
          componentIds: [c.load.id, ...c.rcds.map((d) => d.id)],
        };
      });
  },
};

const sezione37: R = {
  id: 'RES-37',
  version: '1.0',
  title: 'Prescrizioni specifiche per gli ambienti residenziali (Sezione 37)',
  description: 'Dotazioni minime e livelli prestazionali degli impianti residenziali.',
  area: 'Prescrizioni per ambienti residenziali',
  scope: 'Unità abitative',
  severity: 'attenzione',
  explanation:
    'Il testo 2007 disponibile non contiene una Sezione 37. Le prescrizioni residenziali dell\'edizione vigente (numero di circuiti, punti presa, livelli) richiedono il testo ufficiale: non vengono inventate.',
  refs: [{ edition: EIX, article: 'Sezione 37', verified: false, note: 'Testo non disponibile al simulatore.' }],
  requiredData: ['Testo dell\'edizione vigente', 'Superficie e locali dell\'unità abitativa'],
  evaluate: (ctx) =>
    ctx.settings.residential
      ? [
          {
            ruleId: 'RES-37',
            status: 'dati-insufficienti',
            subject: 'Unità abitativa',
            message: 'Funzionalità non implementata: richiede il testo dell\'edizione vigente e i dati dei locali.',
            componentIds: [],
          },
        ]
      : [],
};

// ------------------------------------------------------------------ 11. verifiche iniziali

const VERIFICHE: [string, string, string][] = [
  ['61.2', 'Esame a vista', 'Componenti conformi, scelti e posati correttamente, non danneggiati; documentazione di progetto.'],
  ['61.3.2', 'Continuità dei conduttori', 'Continuità dei conduttori di protezione e dei collegamenti equipotenziali (nel simulatore: multimetro in continuità a impianto disalimentato).'],
  ['61.3.3', 'Resistenza d\'isolamento', 'Misura a impianto non in tensione; non rappresentabile nel modello.'],
  ['61.3.6.2', 'Misura della resistenza di terra', 'Misura di RE per confermare il coordinamento RE × IΔn ≤ UL.'],
  ['61.3.7', 'Protezione addizionale mediante interruttore differenziale', 'Prova dei differenziali con strumento (il pulsante T verifica solo il meccanismo).'],
  ['61.3.8', 'Prova di polarità', 'Verifica che i dispositivi unipolari siano sulla fase.'],
  ['61.3.10', 'Prove di funzionamento', 'Funzionamento di quadri, comandi e interblocchi.'],
  ['61.3.11', 'Verifica della caduta di tensione', 'Conferma strumentale dei valori di progetto.'],
];

const verificheIniziali: R = {
  id: 'VER-61',
  version: '1.0',
  title: 'Verifiche iniziali',
  description: 'Esame a vista e prove da eseguire prima della messa in servizio.',
  area: 'Verifiche iniziali',
  scope: 'Impianto',
  severity: 'attenzione',
  explanation:
    'Nessun calcolo sostituisce le verifiche iniziali: devono essere eseguite da persona esperta, competente in lavori di verifica (61.1.6), con strumenti idonei.',
  refs: [r07('61.1.6'), r07('61.2'), r07('61.3'), rIX('Parte 6')],
  requiredData: ['Misure strumentali sul campo'],
  evaluate: () =>
    VERIFICHE.map(([art, title, msg]) => ({
      ruleId: 'VER-61',
      status: 'verifica-campo' as const,
      subject: `${art} — ${title}`,
      message: msg,
      componentIds: [],
    })),
};

export const RULESET_2007: RuleSet<NormCtx> = {
  id: 'cei-64-8-2007',
  version: '1.0.0',
  title: 'CEI 64-8:2007 — studio storico',
  edition: 'CEI 64-8 6ª edizione, gennaio 2007',
  status: 'storico',
  note:
    'Regole verificate sul testo 2007 fornito. Edizione vigente: CEI 64-8 IX edizione, in vigore dal 1/11/2024 (comunicato CEI): i riferimenti all\'edizione vigente sono indicati come corrispondenze presunte e non verificate. Questo esito non attesta la conformità dell\'impianto.',
  rules: [
    contattiDiretti,
    ttReIdn,
    sovraccarico,
    potereInterruzione,
    energiaPassante,
    sezioniMinime,
    identificazione,
    cadutaTensione,
    ttDiff,
    masseATerra,
    sezionePE,
    sezionamento,
    suddivisione,
    sovratensioni,
    addizionale30mA,
    sezione37,
    verificheIniziali,
  ],
};

