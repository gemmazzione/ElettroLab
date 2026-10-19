import { catalogItem } from '../model/catalog';
import { WIRE_COLOR_LABEL } from '../model/constants';
import { getPoles, getTerminals, isResidualDevice, isSwitchingDevice, parseTerminalId, terminalId } from '../model/terminals';
import type { ComponentInstance, Project, Terminal, TerminalFunction } from '../model/types';
import { analyzeCircuits, buildNetGraph, netsConnected, phaseOfNet, residualDevicesIn } from './netGraph';

/**
 * Verifiche di cablaggio (Electrical Rule Check).
 * Sono controlli topologici e di identificazione dei conduttori: NON sono verifiche
 * di conformità alla CEI 64-8 (motore normativo previsto nella Fase 3).
 */

export type IssueSeverity = 'errore' | 'attenzione' | 'info';

export interface Issue {
  id: string;
  code: string;
  severity: IssueSeverity;
  title: string;
  message: string;
  explanation: string;
  componentIds: string[];
  wireIds: string[];
  terminalIds: string[];
}

const FN_NAME: Record<TerminalFunction, string> = { L: 'fase', N: 'neutro', PE: 'protezione (PE)' };

export function checkWiring(project: Project): Issue[] {
  const issues: Issue[] = [];
  const push = (i: Omit<Issue, 'id' | 'componentIds' | 'wireIds' | 'terminalIds'> & Partial<Issue>) =>
    issues.push({
      componentIds: [],
      wireIds: [],
      terminalIds: [],
      ...i,
      id: `${i.code}:${issues.length}`,
    });

  const byId = new Map(project.components.map((c) => [c.id, c]));
  const terminals = new Map<string, Terminal>();
  for (const c of project.components) for (const t of getTerminals(c)) terminals.set(t.id, t);
  const lbl = (c: ComponentInstance) => c.label;
  const termName = (tid: string) => {
    const t = terminals.get(tid);
    const c = byId.get(parseTerminalId(tid).componentId);
    return t && c ? `${c.label}·${t.label}` : tid;
  };

  // ------------------------------------------------------------ presenza elementi essenziali
  const supplies = project.components.filter((c) => c.params.kind === 'supply');
  const loads = project.components.filter((c) => c.params.kind === 'load');
  if (supplies.length === 0) {
    push({
      code: 'NO_SUPPLY',
      severity: 'attenzione',
      title: 'Manca il punto di fornitura',
      message: 'Il progetto non ha una fornitura: l\'impianto non può essere alimentato.',
      explanation: 'Aggiungi "Fornitura monofase 230 V" dalla categoria Alimentazione e collegane i morsetti L e N all\'interruttore generale.',
    });
  }
  if (loads.length > 0 && !project.components.some((c) => c.params.kind === 'earth')) {
    push({
      code: 'NO_EARTH',
      severity: 'errore',
      title: 'Impianto di terra assente',
      message: 'Sono presenti utilizzatori ma nessun impianto di terra.',
      explanation:
        'Nel sistema TT il distributore non fornisce il conduttore di protezione: le masse devono essere collegate al dispersore dell\'utente tramite i conduttori PE.',
    });
  }

  // ------------------------------------------------------------ conduttori
  const wireCount = new Map<string, number>();
  // Un pettine occupa il morsetto una volta sola, anche se ne partono due tratti.
  const combAt = new Set<string>();
  for (const w of project.wires) {
    for (const tid of [w.from, w.to]) {
      if (w.comb) {
        const key = `${tid}|${w.comb.id}`;
        if (combAt.has(key)) continue;
        combAt.add(key);
      }
      wireCount.set(tid, (wireCount.get(tid) ?? 0) + 1);
    }
    const ta = terminals.get(w.from);
    const tb = terminals.get(w.to);
    if (!ta || !tb) {
      push({
        code: 'DANGLING_WIRE',
        severity: 'errore',
        title: 'Conduttore scollegato',
        message: 'Un conduttore fa riferimento a un morsetto che non esiste più.',
        explanation: 'Elimina il conduttore o ricollegalo.',
        wireIds: [w.id],
      });
      continue;
    }
    const where = `${termName(w.from)} → ${termName(w.to)}`;
    if (ta.fn !== tb.fn) {
      const pe = ta.fn === 'PE' || tb.fn === 'PE';
      push({
        code: pe ? 'PE_TO_ACTIVE' : 'L_N_SWAP',
        severity: 'errore',
        title: pe ? 'PE collegato a un conduttore attivo' : 'Collegamento fase-neutro errato',
        message: `${where}: collega un morsetto di ${FN_NAME[ta.fn]} con uno di ${FN_NAME[tb.fn]}.`,
        explanation: pe
          ? 'Il conduttore di protezione non deve mai essere collegato a fase o neutro: le masse andrebbero in tensione o il PE diventerebbe un conduttore di ritorno.'
          : 'Fase e neutro hanno funzioni diverse: collegarli tra loro provoca un cortocircuito oppure inverte la polarità, lasciando la fase su morsetti che dovrebbero essere neutri.',
        wireIds: [w.id],
        terminalIds: [w.from, w.to],
      });
    }
    // Pettine: barra isolata, i colori dei cavi non si applicano.
    if (w.comb) continue;
    const fn: TerminalFunction = ta.fn === tb.fn ? ta.fn : ta.fn === 'PE' || tb.fn === 'PE' ? 'PE' : 'L';
    if (w.color === 'giallo-verde' && fn !== 'PE') {
      push({
        code: 'COLOR_GY_MISUSE',
        severity: 'errore',
        title: 'Uso improprio del giallo-verde',
        message: `${where}: conduttore giallo-verde usato come ${FN_NAME[fn]}.`,
        explanation: 'La combinazione giallo-verde è riservata esclusivamente al conduttore di protezione (CEI EN 60445).',
        wireIds: [w.id],
      });
    }
    if (fn === 'PE' && w.color !== 'giallo-verde') {
      push({
        code: 'COLOR_PE',
        severity: 'errore',
        title: 'Conduttore di protezione non identificato',
        message: `${where}: il PE è ${WIRE_COLOR_LABEL[w.color].toLowerCase()} invece che giallo-verde.`,
        explanation: 'Il conduttore di protezione deve essere identificato con la combinazione giallo-verde.',
        wireIds: [w.id],
      });
    }
    if (fn === 'N' && w.color !== 'blu') {
      push({
        code: 'COLOR_N',
        severity: 'attenzione',
        title: 'Neutro non identificato in blu',
        message: `${where}: il neutro è ${WIRE_COLOR_LABEL[w.color].toLowerCase()}.`,
        explanation: 'Il conduttore di neutro va identificato con il colore blu chiaro.',
        wireIds: [w.id],
      });
    }
    if (fn === 'L' && w.color === 'blu') {
      push({
        code: 'COLOR_L_BLUE',
        severity: 'attenzione',
        title: 'Fase in colore blu',
        message: `${where}: conduttore blu usato come fase.`,
        explanation: 'Il blu chiaro identifica il neutro: usarlo per la fase induce in errore chi interviene sull\'impianto.',
        wireIds: [w.id],
      });
    }
    const expectedConductor = fn === 'PE' ? ['PE'] : fn === 'N' ? ['N'] : ['L1', 'L2', 'L3'];
    if (ta.fn === tb.fn && !expectedConductor.includes(w.conductor)) {
      push({
        code: 'CONDUCTOR_ID',
        severity: 'attenzione',
        title: 'Identificazione del conduttore incoerente',
        message: `${where}: conduttore identificato come ${w.conductor} su morsetti di ${FN_NAME[fn]}.`,
        explanation: 'L\'identificazione del conduttore deve corrispondere alla funzione dei morsetti che collega.',
        wireIds: [w.id],
      });
    }
  }

  // Identificazione della fase (L1/L2/L3) coerente con la fase effettivamente raggiunta.
  {
    const gp = buildNetGraph(project);
    if (gp.supplyPhaseNets.length === 3) {
      for (const w of project.wires) {
        if (w.conductor !== 'L1' && w.conductor !== 'L2' && w.conductor !== 'L3') continue;
        const ph = phaseOfNet(gp, gp.netOf(w.from));
        if (ph && `L${ph}` !== w.conductor) {
          push({
            code: 'PHASE_ID',
            severity: 'attenzione',
            title: 'Identificazione della fase incoerente',
            message: `${termName(w.from)} → ${termName(w.to)}: conduttore identificato ${w.conductor} ma collegato alla fase L${ph}.`,
            explanation:
              'In un impianto trifase ogni conduttore di fase deve essere identificato con la fase a cui è realmente collegato: un errore di identificazione porta a squilibri non voluti e a errori durante la manutenzione.',
            wireIds: [w.id],
          });
        }
      }
    }
  }

  for (const [tid, n] of wireCount) {
    if (n > 2) {
      push({
        code: 'TERMINAL_CROWDED',
        severity: 'info',
        title: 'Più di due conduttori nello stesso morsetto',
        message: `${termName(tid)}: ${n} conduttori.`,
        explanation:
          'Verifica sui dati del costruttore il numero e la sezione dei conduttori ammessi dal morsetto; in alternativa usa una morsettiera o un pettine.',
        terminalIds: [tid],
        componentIds: [parseTerminalId(tid).componentId],
      });
    }
  }

  // ------------------------------------------------------------ morsetti non collegati
  for (const c of project.components) {
    if (c.params.kind === 'bar') continue;
    const free = getTerminals(c).filter((t) => !wireCount.has(t.id));
    if (free.length === 0) continue;
    push({
      code: 'UNCONNECTED',
      severity: 'attenzione',
      title: 'Morsetti non collegati',
      message: `${lbl(c)}: ${free.map((t) => `${t.label} (${t.fn})`).join(', ')} senza conduttore.`,
      explanation: isSwitchingDevice(c.params.kind)
        ? 'Un dispositivo deve avere ingresso e uscita collegati su tutti i poli usati; un polo di neutro lasciato libero interrompe il circuito.'
        : 'Ogni morsetto previsto deve essere collegato, altrimenti il circuito resta aperto o la massa non è protetta.',
      componentIds: [c.id],
      terminalIds: free.map((t) => t.id),
    });
  }

  // ------------------------------------------------------------ topologia
  const g = buildNetGraph(project);

  // Neutri di gruppi differenziali diversi uniti nella stessa rete.
  const rcds = project.components.filter((c) => isResidualDevice(c.params.kind));
  const nOutByNet = new Map<string, Set<string>>();
  for (const c of rcds) {
    for (const p of getPoles(c)) {
      if (p.fn !== 'N') continue;
      const net = g.netOf(terminalId(c.id, p.outKey));
      const s = nOutByNet.get(net) ?? new Set<string>();
      s.add(c.id);
      nOutByNet.set(net, s);
    }
  }
  const mixed = new Set<string>();
  for (const ids of nOutByNet.values()) {
    if (ids.size < 2) continue;
    const list = [...ids].map((id) => byId.get(id)!);
    list.forEach((c) => mixed.add(c.id));
    push({
      code: 'RCD_SHARED_NEUTRAL',
      severity: 'errore',
      title: 'Neutri di gruppi differenziali diversi collegati insieme',
      message: `I neutri a valle di ${list.map(lbl).join(' e ')} sono uniti.`,
      explanation:
        'Ogni differenziale deve vedere tornare sul proprio neutro esattamente la corrente uscita dalla propria fase. Unendo i neutri di gruppi diversi la corrente si ripartisce tra i dispositivi, che misurano una corrente differenziale fittizia e intervengono senza guasto (o non intervengono quando dovrebbero).',
      componentIds: list.map((c) => c.id),
    });
  }

  // Poli di un differenziale scavalcati da un collegamento diretto monte-valle.
  for (const c of rcds) {
    if (mixed.has(c.id)) continue;
    for (const p of getPoles(c)) {
      const out = g.netOf(terminalId(c.id, p.outKey));
      const ph = p.fn === 'L' ? phaseOfNet(g, out) : null;
      const src = p.fn === 'N' ? g.supplyNet.N : g.supplyPhaseNets.find((x) => x.phase === ph)?.net;
      if (!src || !netsConnected(g, out, src)) continue;
      if (netsConnected(g, out, src, c.id)) {
        push({
          code: 'RCD_BYPASS',
          severity: 'errore',
          title: 'Differenziale scavalcato',
          message: `${lbl(c)}: l'uscita ${p.fn === 'N' ? 'del neutro' : 'della fase'} è collegata alla fornitura anche senza passare dal dispositivo.`,
          explanation:
            'Se un conduttore attivo raggiunge i circuiti senza attraversare il differenziale, il dispositivo non misura più tutta la corrente del circuito e la protezione non è garantita.',
          componentIds: [c.id],
        });
      }
    }
  }

  // Dispositivi alimentati dal basso.
  for (const c of project.components) {
    if (!isSwitchingDevice(c.params.kind)) continue;
    for (const p of getPoles(c)) {
      const din = g.distance.get(g.netOf(terminalId(c.id, p.inKey)));
      const dout = g.distance.get(g.netOf(terminalId(c.id, p.outKey)));
      if (din !== undefined && dout !== undefined && dout < din) {
        push({
          code: 'REVERSE_FEED',
          severity: 'info',
          title: 'Dispositivo alimentato dai morsetti di uscita',
          message: `${lbl(c)}: la sorgente arriva dai morsetti inferiori (uscita).`,
          explanation: 'Alcuni dispositivi ammettono l\'alimentazione dal basso, altri no: verifica le istruzioni del costruttore. Per convenzione la linea entra dall\'alto.',
          componentIds: [c.id],
        });
        break;
      }
    }
  }

  // Scaricatori di sovratensione: il morsetto PE deve raggiungere l'impianto di terra.
  for (const c of project.components) {
    if (c.params.kind !== 'spd') continue;
    if (!g.earthNets.has(g.netOf(terminalId(c.id, 'PE')))) {
      push({
        code: 'SPD_NO_EARTH',
        severity: 'errore',
        title: 'Scaricatore senza collegamento a terra',
        message: `${lbl(c)}: il morsetto PE non è collegato all'impianto di terra.`,
        explanation:
          'Lo scaricatore limita le sovratensioni deviando la corrente impulsiva verso terra: senza collegamento al PE non può svolgere la sua funzione. Il collegamento va fatto con conduttori il più corti possibile.',
        componentIds: [c.id],
      });
    }
  }

  // Circuiti utilizzatori.
  for (const info of analyzeCircuits(project, g)) {
    const load = byId.get(info.loadId)!;
    const name = load.params.kind === 'load' ? `${load.label} (${load.params.p.name})` : load.label;
    if (!info.lConnected || !info.nConnected) {
      const missing = [!info.lConnected && 'fase', !info.nConnected && 'neutro'].filter(Boolean).join(' e ');
      push({
        code: 'LOAD_NOT_FED',
        severity: 'attenzione',
        title: 'Utilizzatore non collegato alla fornitura',
        message: `${name}: ${missing} non raggiungono il punto di fornitura.`,
        explanation: 'Segui il percorso dal morsetto dell\'utilizzatore fino al contatore: manca un conduttore o un ponticello.',
        componentIds: [load.id],
      });
    }
    if (!info.peConnected) {
      push({
        code: 'PE_MISSING',
        severity: 'errore',
        title: 'PE mancante o interrotto',
        message: `${name}: la massa non è collegata all'impianto di terra.`,
        explanation:
          'Senza continuità del conduttore di protezione, un guasto d\'isolamento porterebbe la massa alla tensione di fase senza che la corrente di guasto possa richiudersi verso terra e far intervenire il differenziale.',
        componentIds: [load.id],
      });
    }
    if (info.lConnected && info.nConnected && info.hasNeutral) {
      const rl = residualDevicesIn(project, info.lDevices);
      const rn = residualDevicesIn(project, info.nDevices);
      const same = rl.length === rn.length && rl.every((x) => rn.includes(x));
      if (!same) {
        const names = (ids: string[]) => (ids.length ? ids.map((id) => byId.get(id)!.label).join(', ') : 'nessuno');
        push({
          code: 'RCD_MISMATCH',
          severity: 'errore',
          title: 'Fase e neutro attraversano differenziali diversi',
          message: `${name}: fase protetta da ${names(rl)}, neutro da ${names(rn)}.`,
          explanation:
            'La corrente di un circuito deve uscire e rientrare dallo stesso differenziale. Se fase e neutro passano da dispositivi diversi, ciascuno misura una corrente sbilanciata pari all\'intera corrente di carico.',
          componentIds: [load.id, ...new Set([...rl, ...rn])],
        });
      }
      const ocp = info.lDevices.filter((id) => {
        const k = byId.get(id)!.params.kind;
        return k === 'mcb' || k === 'rcbo' || k === 'fuse';
      });
      if (ocp.length === 0) {
        push({
          code: 'NO_OVERCURRENT_PROTECTION',
          severity: 'attenzione',
          title: 'Circuito senza protezione contro le sovracorrenti',
          message: `${name}: nessun magnetotermico o fusibile sulla fase.`,
          explanation: 'Ogni circuito deve essere protetto contro sovraccarico e cortocircuito da un dispositivo posto sul conduttore di fase.',
          componentIds: [load.id],
        });
      }
      if (rl.length === 0) {
        push({
          code: 'NO_RCD',
          severity: 'attenzione',
          title: 'Circuito senza protezione differenziale',
          message: `${name}: nessun differenziale a monte.`,
          explanation:
            'Nei sistemi TT il differenziale è il mezzo con cui si realizza normalmente l\'interruzione automatica in caso di guasto verso terra. La verifica normativa completa sarà disponibile nella Fase 3.',
          componentIds: [load.id],
        });
      }
    }
  }

  return issues;
}

export function issuesFor(issues: Issue[], componentId: string): Issue[] {
  return issues.filter((i) => i.componentIds.includes(componentId) || i.terminalIds.some((t) => parseTerminalId(t).componentId === componentId));
}

export function describeComponent(c: ComponentInstance): string {
  return `${c.label} — ${catalogItem(c.catalogId).name}`;
}
