/**
 * Schede didattiche dei componenti del catalogo: funzione, principio di funzionamento,
 * collegamento, scelta, errori tipici e modello usato dal simulatore.
 */

export interface InfoSection {
  title: string;
  text: string;
}

export interface ComponentInfo {
  title: string;
  summary: string;
  sections: InfoSection[];
}

const S = (title: string, text: string): InfoSection => ({ title, text });

const MCB_COMMON: InfoSection[] = [
  S(
    'Come funziona',
    'Contiene due sganciatori in serie sul polo protetto. Lo sganciatore TERMICO è una lamina bimetallica riscaldata dalla corrente: con un sovraccarico si incurva lentamente e sgancia il meccanismo, tanto più rapidamente quanto maggiore è la corrente (caratteristica a tempo inverso). Lo sganciatore MAGNETICO è una bobina con un nucleo mobile: oltre una certa corrente (multipla di In, fissata dalla curva B, C o D) attira il nucleo e apre i contatti in pochi millisecondi. L\'arco che si forma all\'apertura viene allungato e spento nella camera di estinzione.',
  ),
  S(
    'Curve B, C, D',
    'Indicano la soglia d\'intervento magnetico: B tra 3 e 5·In (linee lunghe, carichi resistivi), C tra 5 e 10·In (uso generale civile), D tra 10 e 20·In (carichi con forti correnti di spunto, es. trasformatori, motori). La soglia esatta dipende dall\'esemplare: la norma di prodotto (CEI EN 60898-1) fissa solo la fascia.',
  ),
  S(
    'Come si sceglie',
    'In deve essere almeno pari alla corrente d\'impiego del circuito e non superiore alla portata del cavo (IB ≤ In ≤ Iz). Il potere di interruzione Icn deve essere almeno pari alla corrente di cortocircuito presunta nel punto di installazione. La curva va scelta in modo che il cortocircuito a fondo linea faccia intervenire il magnetico.',
  ),
  S(
    'Collegamento',
    'Per convenzione la linea entra dai morsetti superiori (1, 3 o N) ed esce dai morsetti inferiori (2, 4 o N). Il neutro va collegato al polo marcato N. Più dispositivi affiancati si alimentano con ponticelli o con un pettine.',
  ),
  S(
    'Errori tipici',
    'Scegliere In in base alla potenza senza considerare la portata del cavo; scambiare fase e neutro su un 1P+N (il polo protetto finisce sul neutro); confondere Icn con la corrente nominale; affidarsi al magnetotermico per la protezione delle persone nei guasti a terra in un sistema TT.',
  ),
  S(
    'Nel simulatore',
    'Termico: modello del primo ordine con memoria termica tarato sui punti convenzionali (non intervento a 1,13·In, intervento a 1,45·In entro 1 h, a 2,55·In tra 1 e 60 s). Magnetico: intervento certo in 10 ms oltre la soglia superiore della curva; nella fascia di incertezza il simulatore non sceglie e lo segnala. All\'apertura su cortocircuito la corrente interrotta è confrontata con Icn.',
  ),
];

const RCD_COMMON: InfoSection[] = [
  S(
    'Come funziona',
    'Tutti i conduttori attivi (fase e neutro) passano dentro un trasformatore toroidale. In condizioni normali la corrente che va verso il carico è uguale a quella che ritorna: i flussi magnetici si annullano. Se una parte della corrente si disperde verso terra (guasto d\'isolamento o persona), la somma non è più zero: nel secondario del toroide si induce una corrente che, oltre la soglia, comanda lo sgancio.',
  ),
  S(
    'Sensibilità e tipi',
    'IΔn è la corrente differenziale nominale d\'intervento: 30 mA (alta sensibilità, protezione addizionale delle persone), 100–300 mA (protezione contro i contatti indiretti e incendio). La norma di prodotto prevede che non intervenga sotto 0,5·IΔn e che intervenga sicuramente a IΔn. Il tipo indica le forme d\'onda rilevate: AC solo alternata sinusoidale; A anche pulsante unidirezionale (elettronica monofase); F anche frequenze miste (inverter monofase); B anche corrente continua livellata. I modelli S (selettivi) sono ritardati per ottenere selettività con differenziali a valle.',
  ),
  S(
    'Come si sceglie',
    'Nel sistema TT il coordinamento con il dispersore richiede RE × IΔn ≤ UL. Il tipo va scelto in base agli apparecchi alimentati (es. tipo A o F con elettronica). La corrente nominale In indica la corrente che i contatti possono portare in servizio continuo.',
  ),
  S(
    'Pulsante di prova T',
    'Crea internamente uno squilibrio di corrente e verifica che il meccanismo di sgancio funzioni. Non verifica né il dispersore né l\'efficacia della protezione dell\'impianto: per questo servono misure strumentali.',
  ),
  S(
    'Errori tipici',
    'Collegare a valle di un differenziale il neutro di un altro gruppo (scatti intempestivi o protezione inefficace); far passare il PE dentro il differenziale; ritenere che il differenziale protegga da sovraccarico o cortocircuito (il differenziale puro non lo fa).',
  ),
];

export const COMPONENT_INFO: Record<string, ComponentInfo> = {
  'supply-mono': {
    title: 'Fornitura monofase 230 V (contatore)',
    summary: 'Il punto di consegna dell\'energia: qui finisce la rete del distributore e inizia l\'impianto dell\'utente.',
    sections: [
      S('A cosa serve', 'Rende disponibili fase (L) e neutro (N) a 230 V, 50 Hz. Il contatore misura l\'energia e, nei contatori elettronici, limita la potenza prelevata alla potenza disponibile (impegnata + 10%).'),
      S('Sistema TT', 'Nelle forniture in bassa tensione italiane il neutro è collegato a terra in cabina (resistenza RB) e le masse dell\'utente sono collegate a un dispersore proprio (RA). Il conduttore di protezione quindi NON arriva dal contatore: nasce dall\'impianto di terra dell\'utente.'),
      S('Impedenza di rete', 'Trasformatore e linea di distribuzione hanno un\'impedenza che limita la corrente di cortocircuito. Più la rete è "robusta" (impedenza bassa), più alta è la Icc presunta e più alto deve essere il potere di interruzione degli interruttori.'),
      S('Nel simulatore', 'Generatore ideale da U0 con impedenza R + jX ripartita tra fase e neutro; neutro di cabina a terra tramite RB. La potenza impegnata serve solo a segnalare il superamento; il limitatore del contatore non è simulato.'),
    ],
  },
  'supply-tri': {
    title: 'Fornitura trifase 400/230 V',
    summary: 'Tre fasi (L1, L2, L3) e neutro: 400 V tra le fasi, 230 V tra fase e neutro.',
    sections: [
      S('Come funziona', 'Le tre tensioni di fase hanno lo stesso valore efficace (230 V) e sono sfasate di 120° l\'una dall\'altra. La differenza tra due fasi (tensione concatenata) vale √3 × 230 ≈ 400 V. Il neutro è il centro stella del trasformatore di cabina, collegato a terra (sistema TT).'),
      S('Carichi monofase', 'Ogni utilizzatore monofase si collega tra una fase e il neutro. Conviene distribuirli sulle tre fasi in modo da equilibrare le correnti: con carichi uguali la corrente nel neutro si annulla (somma vettoriale di tre correnti uguali sfasate di 120°).'),
      S('Neutro comune', 'Il neutro è condiviso da tutti i carichi monofase. Se si interrompe, i carichi delle tre fasi restano collegati in serie tra loro e il loro centro stella si sposta: le fasi meno caricate ricevono una tensione più alta (fino a 400 V), quelle più caricate più bassa. È un guasto pericoloso per gli apparecchi.'),
      S('Nel simulatore', 'Tre generatori da 230 V a 0°, −120° e +120° con impedenza di rete per fase e del neutro; neutro di cabina a terra tramite RB. Tutte le tensioni e lo spostamento del centro stella risultano dall\'analisi nodale del circuito.'),
    ],
  },
  earth: {
    title: 'Impianto di terra (dispersore e collettore)',
    summary: 'Collega a terra le masse dell\'impianto tramite i conduttori di protezione.',
    sections: [
      S('A cosa serve', 'In caso di guasto d\'isolamento, offre alla corrente un percorso verso terra: la corrente di guasto attraversa il dispersore e fa intervenire il differenziale prima che la tensione sulla massa diventi pericolosa per un tempo eccessivo.'),
      S('Come è fatto', 'Uno o più elementi metallici a contatto con il terreno (picchetti, corde, ferri di fondazione), un conduttore di terra e il collettore (nodo) principale di terra a cui arrivano i conduttori di protezione e gli equipotenziali.'),
      S('Resistenza di terra RA', 'Dipende dal terreno, dall\'umidità e dalla forma del dispersore. Una massa in guasto si porta a RA × Ig: per questo nel sistema TT deve valere RE × IΔn ≤ UL (50 V in ambienti ordinari). RA si misura sul campo con strumenti appositi.'),
      S('Errori tipici', 'Considerare il valore di progetto di RA come definitivo senza misurarlo; collegare il PE al neutro; lasciare masse senza conduttore di protezione.'),
      S('Nel simulatore', 'Resistenza RA tra il morsetto PE e la terra di riferimento, che si richiude al neutro di cabina tramite RB.'),
    ],
  },
  'switch-2p': {
    title: 'Interruttore-sezionatore bipolare',
    summary: 'Apre e chiude il circuito su fase e neutro e garantisce il sezionamento. Non è una protezione.',
    sections: [
      S('A cosa serve', 'Comando manuale e sezionamento: permette di mettere fuori tensione l\'impianto o una parte di esso su tutti i conduttori attivi, per esempio come "generale" a valle del contatore.'),
      S('Come funziona', 'Contatti mobili azionati dalla leva con meccanismo a scatto; la distanza tra i contatti aperti è tale da garantire il sezionamento (se dichiarato idoneo dal costruttore).'),
      S('Attenzione', 'Non contiene sganciatori: non interviene per sovraccarico, cortocircuito o dispersione. Deve essere protetto a monte o a valle da un dispositivo coordinato.'),
      S('Nel simulatore', 'Contatto con resistenza di 5 mΩ per polo quando chiuso, circuito aperto ideale quando aperto.'),
    ],
  },
  'mcb-1p': {
    title: 'Interruttore magnetotermico unipolare (1P)',
    summary: 'Protegge la sola fase da sovraccarico e cortocircuito. Il neutro passa fuori dal dispositivo.',
    sections: [
      S('A cosa serve', 'Protezione di una linea contro le sovracorrenti quando il sezionamento del neutro è assicurato da un altro dispositivo a monte.'),
      ...MCB_COMMON,
      S('Attenzione nel sistema TT', 'Il 1P non interrompe il neutro: per sezionare il circuito su tutti i conduttori attivi serve un dispositivo onnipolare a monte.'),
    ],
  },
  'mcb-1pn': {
    title: 'Interruttore magnetotermico 1P+N',
    summary: 'Fase protetta, neutro sezionato ma non protetto. Il dispositivo più comune nei circuiti terminali domestici.',
    sections: [
      S('A cosa serve', 'Protegge la linea contro sovraccarico e cortocircuito e permette di sezionarla su fase e neutro con una sola manovra.'),
      ...MCB_COMMON,
      S('Polarità', 'Il polo N non ha sganciatori: se fase e neutro vengono invertiti la protezione agisce sul conduttore sbagliato e il circuito aperto resta con la fase collegata.'),
    ],
  },
  'mcb-2p': {
    title: 'Interruttore magnetotermico bipolare (2P)',
    summary: 'Due poli entrambi protetti, spesso usato come interruttore generale monofase.',
    sections: [S('A cosa serve', 'Protezione e sezionamento di una linea monofase con rilevazione delle sovracorrenti su entrambi i conduttori.'), ...MCB_COMMON],
  },
  'mcb-3p': {
    title: 'Magnetotermico tripolare (3P)',
    summary: 'Protezione delle tre fasi di una linea trifase senza neutro, per esempio un carico trifase equilibrato.',
    sections: [
      S('Interruzione onnipolare', 'I tre poli sono legati meccanicamente: il sovraccarico o il cortocircuito su una sola fase apre tutte e tre. Si evita così che un motore o un carico trifase resti alimentato da due sole fasi.'),
      ...MCB_COMMON.slice(0, 3),
      S('Nel simulatore', 'Il modello termico usa la corrente massima tra le tre fasi; il magnetico interviene se una qualsiasi fase supera la soglia.'),
    ],
  },
  'mcb-3pn': {
    title: 'Magnetotermico 3P+N',
    summary: 'Tre fasi protette e neutro sezionato: linee trifase con carichi monofase o generale trifase.',
    sections: [
      S('Il neutro', 'Il polo N apre e chiude insieme alle fasi (sezionamento di tutti i conduttori attivi) ma non ha sganciatori. Questo è ammesso quando il neutro ha la stessa sezione delle fasi (CEI 64-8:2007, 473.3.2.1 a).'),
      ...MCB_COMMON.slice(0, 3),
    ],
  },
  'mcb-4p': {
    title: 'Magnetotermico quadripolare (4P)',
    summary: 'Quattro poli tutti protetti, compreso il neutro.',
    sections: [
      S('Quando serve', 'La rilevazione delle sovracorrenti sul neutro è necessaria, per esempio, quando la sezione del neutro è inferiore a quella delle fasi (CEI 64-8:2007, 473.3.2.1 b).'),
      ...MCB_COMMON.slice(0, 3),
    ],
  },
  'switch-4p': {
    title: 'Interruttore-sezionatore quadripolare',
    summary: 'Sezionamento di una linea trifase con neutro su tutti i conduttori attivi.',
    sections: [
      S('A cosa serve', 'Generale di manovra trifase: separa l\'impianto dall\'alimentazione su L1, L2, L3 e N con una sola manovra.'),
      S('Attenzione', 'Non contiene sganciatori: non protegge da sovracorrenti né da dispersioni.'),
    ],
  },
  'load-tri': {
    title: 'Carico trifase resistivo a stella',
    summary: 'Tre resistenze uguali collegate a stella tra le fasi e un centro comune.',
    sections: [
      S('Come funziona', 'Ogni ramo assorbe un terzo della potenza. Con le tre tensioni di fase uguali e sfasate di 120°, le tre correnti sono uguali e la loro somma è zero: il centro stella si trova allo stesso potenziale del neutro anche senza collegarlo.'),
      S('Con o senza neutro', 'Un carico trifase equilibrato non ha bisogno del neutro. Se il carico non è equilibrato e il centro stella non è collegato al neutro, il centro stella si sposta e le tensioni sui rami diventano diverse.'),
      S('Corrente di linea', 'Per un carico equilibrato: I = P / (√3 × 400 V) = P / (3 × 230 V).'),
      S('Nel simulatore', 'Tre resistenze R = 230² / (P/3) collegate a un nodo di centro stella interno (oppure al neutro, se l\'opzione è attiva) più le resistenze della linea.'),
    ],
  },
  'fuse-1p': {
    title: 'Sezionatore portafusibili 1P',
    summary: 'Una cartuccia gG 10,3×38 sulla fase: protezione contro le sovracorrenti e sezionamento.',
    sections: [
      S('A cosa serve', 'Protegge la conduttura contro sovraccarico e cortocircuito come un magnetotermico, ma con un principio diverso: un elemento metallico calibrato dentro la cartuccia fonde quando la corrente è eccessiva. Il portafusibili serve anche da sezionatore: aprendo il cassetto il circuito è separato e la cartuccia si può sostituire in sicurezza.'),
      S('Come funziona', 'Una cartuccia gG (uso generale) sopporta indefinitamente la corrente di non fusione (1,25·In per In ≥ 16 A, 1,5·In per le più piccole) e fonde entro un\'ora alla corrente convenzionale di fusione (1,6·In o 1,9·In). Con correnti alte fonde in pochi millisecondi. Dopo la fusione la cartuccia va SOSTITUITA con una identica: non si riarma.'),
      S('Coordinamento con il cavo', 'Per il sovraccarico valgono IB ≤ In ≤ Iz e If ≤ 1,45·Iz. Con il fusibile If = 1,6·In, quindi la seconda condizione è più severa: serve In ≤ 0,9·Iz circa. Per il cortocircuito a fondo linea la fusione deve avvenire prima che il cavo superi K²S².'),
      S('Errori tipici', 'Sostituire la cartuccia con una di corrente maggiore "perché salta": il cavo resta senza protezione. Sostituirla senza aver trovato la causa. Aprire il portafusibili sotto carico: è un sezionatore, va manovrato a circuito scarico se il costruttore non indica diversamente.'),
      S('Nel simulatore', 'Curva media sintetica del tempo di prearco costruita dentro le porte convenzionali della CEI EN 60269-2 (non la curva del costruttore). Ogni cartuccia accumula un consumo (somma di dt / t_fusione) e si raffredda sotto la corrente di non fusione. Una cartuccia fusa resta aperta: apri il portafusibili e usa «Sostituisci la cartuccia» nelle proprietà. Il polo di neutro (1P+N, 3P+N) è una barretta senza fusibile.'),
    ],
  },
  'fuse-1pn': {
    title: 'Sezionatore portafusibili 1P+N',
    summary: 'Cartuccia gG sulla fase e neutro sezionato senza fusibile.',
    sections: [
      S('A cosa serve', 'Protegge la conduttura contro sovraccarico e cortocircuito come un magnetotermico, ma con un principio diverso: un elemento metallico calibrato dentro la cartuccia fonde quando la corrente è eccessiva. Il portafusibili serve anche da sezionatore: aprendo il cassetto il circuito è separato e la cartuccia si può sostituire in sicurezza.'),
      S('Come funziona', 'Una cartuccia gG (uso generale) sopporta indefinitamente la corrente di non fusione (1,25·In per In ≥ 16 A, 1,5·In per le più piccole) e fonde entro un\'ora alla corrente convenzionale di fusione (1,6·In o 1,9·In). Con correnti alte fonde in pochi millisecondi. Dopo la fusione la cartuccia va SOSTITUITA con una identica: non si riarma.'),
      S('Coordinamento con il cavo', 'Per il sovraccarico valgono IB ≤ In ≤ Iz e If ≤ 1,45·Iz. Con il fusibile If = 1,6·In, quindi la seconda condizione è più severa: serve In ≤ 0,9·Iz circa. Per il cortocircuito a fondo linea la fusione deve avvenire prima che il cavo superi K²S².'),
      S('Errori tipici', 'Sostituire la cartuccia con una di corrente maggiore "perché salta": il cavo resta senza protezione. Sostituirla senza aver trovato la causa. Aprire il portafusibili sotto carico: è un sezionatore, va manovrato a circuito scarico se il costruttore non indica diversamente.'),
      S('Nel simulatore', 'Curva media sintetica del tempo di prearco costruita dentro le porte convenzionali della CEI EN 60269-2 (non la curva del costruttore). Ogni cartuccia accumula un consumo (somma di dt / t_fusione) e si raffredda sotto la corrente di non fusione. Una cartuccia fusa resta aperta: apri il portafusibili e usa «Sostituisci la cartuccia» nelle proprietà. Il polo di neutro (1P+N, 3P+N) è una barretta senza fusibile.'),
    ],
  },
  'fuse-3p': {
    title: 'Sezionatore portafusibili 3P',
    summary: 'Tre cartucce gG: ogni fase è protetta da un fusibile che fonde da solo.',
    sections: [
      S('A cosa serve', 'Protegge la conduttura contro sovraccarico e cortocircuito come un magnetotermico, ma con un principio diverso: un elemento metallico calibrato dentro la cartuccia fonde quando la corrente è eccessiva. Il portafusibili serve anche da sezionatore: aprendo il cassetto il circuito è separato e la cartuccia si può sostituire in sicurezza.'),
      S('Come funziona', 'Una cartuccia gG (uso generale) sopporta indefinitamente la corrente di non fusione (1,25·In per In ≥ 16 A, 1,5·In per le più piccole) e fonde entro un\'ora alla corrente convenzionale di fusione (1,6·In o 1,9·In). Con correnti alte fonde in pochi millisecondi. Dopo la fusione la cartuccia va SOSTITUITA con una identica: non si riarma.'),
      S('Coordinamento con il cavo', 'Per il sovraccarico valgono IB ≤ In ≤ Iz e If ≤ 1,45·Iz. Con il fusibile If = 1,6·In, quindi la seconda condizione è più severa: serve In ≤ 0,9·Iz circa. Per il cortocircuito a fondo linea la fusione deve avvenire prima che il cavo superi K²S².'),
      S('Errori tipici', 'Sostituire la cartuccia con una di corrente maggiore "perché salta": il cavo resta senza protezione. Sostituirla senza aver trovato la causa. Aprire il portafusibili sotto carico: è un sezionatore, va manovrato a circuito scarico se il costruttore non indica diversamente.'),
      S('Nel simulatore', 'Curva media sintetica del tempo di prearco costruita dentro le porte convenzionali della CEI EN 60269-2 (non la curva del costruttore). Ogni cartuccia accumula un consumo (somma di dt / t_fusione) e si raffredda sotto la corrente di non fusione. Una cartuccia fusa resta aperta: apri il portafusibili e usa «Sostituisci la cartuccia» nelle proprietà. Il polo di neutro (1P+N, 3P+N) è una barretta senza fusibile.'),
    ],
  },
  'fuse-3pn': {
    title: 'Sezionatore portafusibili 3P+N',
    summary: 'Tre cartucce gG sulle fasi e neutro sezionato. Se fonde un solo fusibile, il carico trifase resta alimentato da due fasi: un motore trifase si troverebbe a funzionare in monofase, surriscaldandosi.',
    sections: [
      S('A cosa serve', 'Protegge la conduttura contro sovraccarico e cortocircuito come un magnetotermico, ma con un principio diverso: un elemento metallico calibrato dentro la cartuccia fonde quando la corrente è eccessiva. Il portafusibili serve anche da sezionatore: aprendo il cassetto il circuito è separato e la cartuccia si può sostituire in sicurezza.'),
      S('Come funziona', 'Una cartuccia gG (uso generale) sopporta indefinitamente la corrente di non fusione (1,25·In per In ≥ 16 A, 1,5·In per le più piccole) e fonde entro un\'ora alla corrente convenzionale di fusione (1,6·In o 1,9·In). Con correnti alte fonde in pochi millisecondi. Dopo la fusione la cartuccia va SOSTITUITA con una identica: non si riarma.'),
      S('Coordinamento con il cavo', 'Per il sovraccarico valgono IB ≤ In ≤ Iz e If ≤ 1,45·Iz. Con il fusibile If = 1,6·In, quindi la seconda condizione è più severa: serve In ≤ 0,9·Iz circa. Per il cortocircuito a fondo linea la fusione deve avvenire prima che il cavo superi K²S².'),
      S('Errori tipici', 'Sostituire la cartuccia con una di corrente maggiore "perché salta": il cavo resta senza protezione. Sostituirla senza aver trovato la causa. Aprire il portafusibili sotto carico: è un sezionatore, va manovrato a circuito scarico se il costruttore non indica diversamente.'),
      S('Nel simulatore', 'Curva media sintetica del tempo di prearco costruita dentro le porte convenzionali della CEI EN 60269-2 (non la curva del costruttore). Ogni cartuccia accumula un consumo (somma di dt / t_fusione) e si raffredda sotto la corrente di non fusione. Una cartuccia fusa resta aperta: apri il portafusibili e usa «Sostituisci la cartuccia» nelle proprietà. Il polo di neutro (1P+N, 3P+N) è una barretta senza fusibile.'),
    ],
  },
  'rcd-2p': {
    title: 'Interruttore differenziale puro bipolare',
    summary: 'Interviene quando una parte della corrente si disperde verso terra. Non protegge dalle sovracorrenti.',
    sections: [
      S('A cosa serve', 'Protezione contro i contatti indiretti nel sistema TT e, con IΔn ≤ 30 mA, protezione addizionale contro i contatti diretti. Va sempre coordinato con un magnetotermico che protegga i suoi contatti e il circuito dalle sovracorrenti.'),
      ...RCD_COMMON,
      S('Nel simulatore', 'La corrente differenziale è il modulo della somma vettoriale delle correnti dei poli. Sotto 0,5·IΔn non interviene, tra 0,5 e 1·IΔn la zona è incerta e viene segnalata, da IΔn interviene con i tempi massimi di norma.'),
    ],
  },
  'rcd-4p': {
    title: 'Interruttore differenziale quadripolare',
    summary: 'Protezione differenziale di linee trifase con neutro: misura la somma vettoriale di L1, L2, L3 e N.',
    sections: [
      S('Carichi squilibrati', 'Anche con fasi caricate in modo diverso la somma delle quattro correnti è zero, perché lo squilibrio ritorna dal neutro che passa nel toroide. Interviene solo se una parte della corrente va verso terra.'),
      ...RCD_COMMON,
      S('Nel simulatore', 'Corrente differenziale = modulo della somma vettoriale delle correnti dei quattro poli.'),
    ],
  },
  'rcbo-1pn': {
    title: 'Magnetotermico differenziale 1P+N (RCBO)',
    summary: 'Un solo dispositivo con protezione magnetotermica della fase e protezione differenziale del circuito.',
    sections: [
      S('A cosa serve', 'Ogni circuito ha il proprio differenziale: un guasto a terra disalimenta solo quel circuito. È la soluzione che migliora la continuità di servizio rispetto a un unico differenziale per tutto il quadro.'),
      S('Come funziona', 'Riunisce i due principi: sganciatori termico e magnetico sulla fase, toroide differenziale su fase e neutro. Qualunque delle due funzioni apre entrambi i poli.'),
      ...RCD_COMMON.slice(1, 3),
      S('Nel simulatore', 'Somma dei modelli magnetotermico e differenziale; l\'evento registrato indica quale funzione è intervenuta.'),
    ],
  },
  'bar-n-8': {
    title: 'Morsettiera di neutro',
    summary: 'Distribuisce il neutro a più circuiti: tutti i morsetti sono allo stesso potenziale.',
    sections: [
      S('Regola fondamentale', 'Ogni gruppo differenziale deve avere la propria morsettiera di neutro. Se si uniscono i neutri a valle di differenziali diversi, la corrente di ritorno si divide tra i dispositivi: ognuno misura uno squilibrio fittizio e interviene senza guasto (oppure non vede quello reale).'),
      S('Nel simulatore', 'Tutti i morsetti sono un unico nodo elettrico (resistenza nulla).'),
    ],
  },
  'bar-pe-8': {
    title: 'Morsettiera di protezione (PE)',
    summary: 'Collettore dei conduttori di protezione nel quadro, collegato all\'impianto di terra.',
    sections: [
      S('A cosa serve', 'Raccoglie i PE delle linee in partenza e li collega al conduttore di terra e al dispersore.'),
      S('Attenzione', 'Il PE non deve mai essere interrotto da dispositivi di manovra né collegato al neutro in un sistema TT. Va identificato con il giallo/verde.'),
      S('Nel simulatore', 'Unico nodo elettrico; in esercizio normale non porta corrente.'),
    ],
  },
  'bar-l-4': {
    title: 'Morsettiera di fase',
    summary: 'Ripartisce una fase su più conduttori.',
    sections: [S('Attenzione', 'Va protetta a monte e dimensionata per la corrente totale dei circuiti derivati.'), S('Nel simulatore', 'Unico nodo elettrico.')],
  },
  comb: {
    title: 'Pettine di alimentazione',
    summary: 'Barra isolata che alimenta in parallelo i morsetti di più dispositivi affiancati, al posto dei ponticelli.',
    sections: [S('Stato', 'Funzionalità non implementata in questa versione. Nel frattempo si usano ponticelli in conduttore.')],
  },
  'load-luce': {
    title: 'Utilizzatore: illuminazione',
    summary: 'Circuito luci con apparecchi equivalenti a un carico resistivo.',
    sections: [
      S('Nel simulatore', 'Resistenza R = 230² / P più la resistenza dei conduttori della linea (lunghezza e sezione). La potenza effettiva varia con il quadrato della tensione reale.'),
      S('Dimensionamento', 'Servono i dati di posa (metodo, isolante, temperatura, raggruppamento) per calcolare la portata Iz e verificare IB ≤ In ≤ Iz.'),
    ],
  },
  'load-prese': {
    title: 'Utilizzatore: circuito prese',
    summary: 'Prese a spina con un carico equivalente collegato.',
    sections: [
      S('Protezione addizionale', 'Nei locali ad uso abitativo i circuiti che alimentano prese fino a 20 A richiedono un differenziale con IΔn ≤ 30 mA (CEI 64-8:2007, 412.5.3; verificare il campo di applicazione dell\'edizione vigente).'),
      S('Nel simulatore', 'Carico resistivo equivalente con la linea di alimentazione; la presenza di prese attiva la verifica della protezione addizionale.'),
    ],
  },
  'load-forno': { title: 'Utilizzatore: forno elettrico', summary: 'Carico puramente resistivo di potenza elevata.', sections: [S('Nel simulatore', 'Resistenza costante R = 230² / P più la linea di alimentazione.')] },
  'load-boiler': { title: 'Utilizzatore: scaldabagno', summary: 'Resistenza elettrica per acqua calda, funzionamento prolungato.', sections: [S('Attenzione', 'Funziona per ore a potenza piena: il dimensionamento termico del cavo è determinante.'), S('Nel simulatore', 'Carico resistivo con la linea di alimentazione.')] },
  'load-clima': {
    title: 'Utilizzatore: climatizzatore',
    summary: 'Compressore e ventilatori: carico ohmico-induttivo (cos φ minore di 1).',
    sections: [
      S('Fattore di potenza', 'Un motore assorbe anche potenza reattiva per magnetizzare il proprio circuito magnetico: a parità di potenza attiva la corrente è maggiore, I = P / (U · cos φ). Molti climatizzatori inverter hanno un cos φ vicino a 1 grazie alla correzione interna.'),
      S('Avviamento', 'I compressori senza inverter assorbono all\'avviamento una corrente di spunto molte volte maggiore di quella nominale: per questo spesso si usa la curva C o D. Il simulatore calcola il regime permanente e non simula lo spunto.'),
      S('Nel simulatore', 'Impedenza costante R + jX ricavata da potenza attiva e cos φ alla tensione nominale. Valori del catalogo tipici e indicativi: usa i dati di targa.'),
    ],
  },
  'load-frigo': {
    title: 'Utilizzatore: frigorifero',
    summary: 'Piccolo compressore a funzionamento ciclico, con cos φ basso.',
    sections: [
      S('Caratteristiche', 'La potenza è modesta (100–200 W) ma il cos φ è basso (0,6–0,8): la corrente è sensibilmente maggiore di P/U. Il compressore si accende e spegne in base al termostato.'),
      S('Continuità', 'È un carico da non disalimentare: in molti impianti si mette su un circuito separato o su un differenziale dedicato, così uno scatto per guasto su altri circuiti non lo spegne.'),
      S('Nel simulatore', 'Impedenza costante R + jX con il cos φ impostato; il funzionamento ciclico e lo spunto non sono simulati.'),
    ],
  },
  'load-lavatrice': {
    title: 'Utilizzatore: lavatrice',
    summary: 'Elettrodomestico con resistenza di riscaldamento e motore: assorbe la potenza massima nella fase di riscaldamento dell\'acqua.',
    sections: [
      S('Caratteristiche', 'La resistenza (circa 2 kW) lavora per alcuni minuti all\'inizio del ciclo; il motore del cestello assorbe molto meno ma ha un cos φ più basso. La centrifuga dura poco e ha potenze di qualche centinaio di watt.'),
      S('Collegamento', 'Di solito con presa a spina 16 A adatta alla spina dell\'apparecchio (spesso Schuko) su una linea adeguata, spesso dedicata ai grandi elettrodomestici. L\'involucro metallico è una massa: va collegato al PE e protetto da differenziale. Le lavatrici con elettronica possono richiedere un differenziale di tipo A o F secondo le indicazioni del costruttore.'),
      S('Attenzione', 'Con forno, lavastoviglie e lavatrice accesi insieme si superano facilmente i 3 kW di un contratto domestico: è il caso tipico di intervento del limitatore del contatore.'),
      S('Nel simulatore', 'Impedenza costante R + jX con potenza e cos φ impostati (valori di picco tipici, indicativi). Il ciclo di lavaggio non è simulato: l\'apparecchio assorbe sempre la potenza impostata.'),
    ],
  },
  'load-lavastoviglie': {
    title: 'Utilizzatore: lavastoviglie',
    summary: 'Resistenza per scaldare l\'acqua e pompa di lavaggio: carico quasi resistivo durante il riscaldamento.',
    sections: [
      S('Caratteristiche', 'La potenza massima (circa 1,8–2 kW) si ha durante il riscaldamento dell\'acqua e l\'asciugatura; la pompa assorbe poche decine di watt.'),
      S('Collegamento', 'Presa a spina 16 A su una linea adeguata, spesso in cucina insieme al forno: occhio alla somma delle potenze sulla stessa linea. Massa al PE e protezione differenziale.'),
      S('Nel simulatore', 'Impedenza costante R + jX con potenza e cos φ impostati (valori tipici, indicativi). Il ciclo non è simulato.'),
    ],
  },
  'load-caldaia': {
    title: 'Utilizzatore: caldaia a gas',
    summary: 'La parte elettrica di una caldaia: elettronica di controllo, ventilatore e circolatore.',
    sections: [
      S('Caratteristiche', 'La potenza elettrica è piccola (circa 80–200 W) rispetto a quella termica, che deriva dal gas. È però un carico essenziale: senza alimentazione la caldaia si ferma.'),
      S('Collegamento', 'Di solito si alimenta tramite un interruttore di comando locale e una linea dedicata o derivata dal circuito prese; la massa metallica va collegata al PE.'),
      S('Nel simulatore', 'Impedenza costante R + jX con il cos φ impostato. Valori tipici e indicativi, modificabili.'),
    ],
  },
  'load-generico': { title: 'Utilizzatore generico', summary: 'Carico resistivo con potenza configurabile.', sections: [S('Nel simulatore', 'R = 230² / P più la linea di alimentazione.')] },
  'spd-1pn': {
    title: 'Scaricatore di sovratensione 1P+N (SPD)',
    summary: 'Limita le sovratensioni impulsive scaricandole verso il PE; per impianti monofase.',
    sections: [
      S('A cosa serve', 'Protegge gli apparecchi dalle sovratensioni impulsive di origine atmosferica (fulmini sulla rete o vicino all\'edificio) e di manovra. In servizio ordinario è come un circuito aperto; quando la tensione supera la sua soglia diventa conduttivo in pochi nanosecondi e devia la corrente impulsiva verso il PE, limitando la tensione sugli apparecchi al livello Up.'),
      S('Come funziona', 'Contiene varistori (resistenze che dipendono fortemente dalla tensione) e, nei tipi 1, spinterometri. Un indicatore sul fronte segnala quando l\'elemento è esaurito e va sostituito.'),
      S('Parametri', 'Uc: tensione massima che può sopportare in modo continuativo (per i sistemi a 230 V si usano valori come 255–275 V). Up: tensione residua ai suoi capi durante la scarica: deve essere inferiore alla tenuta a impulso degli apparecchi da proteggere. In / Iimp: corrente di scarica nominale / impulsiva. Tipo 1, 2, 3: classi di prova (all\'origine con parafulmine, nei quadri, vicino agli apparecchi).'),
      S('Collegamento', 'In un sistema TT si usa in genere lo schema "1+1" (o "3+1"): varistori tra fasi e neutro e uno spinterometro tra neutro e PE. I conduttori di collegamento devono essere i più corti possibile, perché la loro induttanza si somma a Up. Il PE dello scaricatore deve arrivare all\'impianto di terra.'),
      S('Quando serve', 'La necessità e la scelta derivano dalla valutazione del rischio di sovratensione (CEI 64-8:2007, Sezione 443; scelta e installazione nella Sezione 534): il simulatore non dispone dei dati sul luogo e sulla rete per deciderlo.'),
      S('Nel simulatore', 'A 50 Hz non conduce (nessun ramo nel circuito). Se la tensione tra fase e neutro o tra fase e PE supera Uc, per esempio per un neutro interrotto, l\'indicatore diventa rosso e viene segnalata una sovratensione temporanea che può danneggiarlo.'),
    ],
  },
  'spd-3pn': {
    title: 'Scaricatore di sovratensione 3P+N (SPD)',
    summary: 'Limita le sovratensioni impulsive scaricandole verso il PE; per impianti trifase con neutro.',
    sections: [
      S('A cosa serve', 'Protegge gli apparecchi dalle sovratensioni impulsive di origine atmosferica (fulmini sulla rete o vicino all\'edificio) e di manovra. In servizio ordinario è come un circuito aperto; quando la tensione supera la sua soglia diventa conduttivo in pochi nanosecondi e devia la corrente impulsiva verso il PE, limitando la tensione sugli apparecchi al livello Up.'),
      S('Come funziona', 'Contiene varistori (resistenze che dipendono fortemente dalla tensione) e, nei tipi 1, spinterometri. Un indicatore sul fronte segnala quando l\'elemento è esaurito e va sostituito.'),
      S('Parametri', 'Uc: tensione massima che può sopportare in modo continuativo (per i sistemi a 230 V si usano valori come 255–275 V). Up: tensione residua ai suoi capi durante la scarica: deve essere inferiore alla tenuta a impulso degli apparecchi da proteggere. In / Iimp: corrente di scarica nominale / impulsiva. Tipo 1, 2, 3: classi di prova (all\'origine con parafulmine, nei quadri, vicino agli apparecchi).'),
      S('Collegamento', 'In un sistema TT si usa in genere lo schema "1+1" (o "3+1"): varistori tra fasi e neutro e uno spinterometro tra neutro e PE. I conduttori di collegamento devono essere i più corti possibile, perché la loro induttanza si somma a Up. Il PE dello scaricatore deve arrivare all\'impianto di terra.'),
      S('Quando serve', 'La necessità e la scelta derivano dalla valutazione del rischio di sovratensione (CEI 64-8:2007, Sezione 443; scelta e installazione nella Sezione 534): il simulatore non dispone dei dati sul luogo e sulla rete per deciderlo.'),
      S('Nel simulatore', 'A 50 Hz non conduce (nessun ramo nel circuito). Se la tensione tra fase e neutro o tra fase e PE supera Uc, per esempio per un neutro interrotto, l\'indicatore diventa rosso e viene segnalata una sovratensione temporanea che può danneggiarlo.'),
    ],
  },
  contactor: { title: 'Contattore modulare', summary: 'Interruttore comandato elettricamente da una bobina, per carichi comandati a distanza o da temporizzatori.', sections: [S('Stato', 'Funzionalità non implementata in questa versione.')] },
  'step-relay': {
    title: 'Relè passo-passo (bistabile)',
    summary: 'Comanda una o più luci da più punti con semplici pulsanti: ogni impulso cambia lo stato del contatto.',
    sections: [
      S('A cosa serve', 'È la soluzione classica per scale, corridoi e ambienti con molti punti di comando: al posto di deviatori e invertitori si mettono pulsanti, tutti in parallelo, e un solo relè nel quadro.'),
      S('Come funziona', 'La bobina (A1-A2) muove un meccanismo a scatto: a ogni impulso di tensione il contatto 1-2 passa da aperto a chiuso o viceversa e resta in quella posizione anche senza alimentazione della bobina (per questo si dice bistabile). La leva sul fronte permette il comando manuale.'),
      S('Collegamento', 'Circuito di comando: fase → pulsanti in parallelo → A1; A2 al neutro. Circuito di potenza: fase protetta → morsetto 1 → morsetto 2 → lampade; il neutro delle lampade torna direttamente. I pulsanti portano la fase: vanno scelti e posati come parti del circuito a 230 V.'),
      S('Errori tipici', 'Tenere premuto il pulsante non accende e spegne di continuo: conta il fronte dell\'impulso. Una bobina alimentata in modo permanente (per errore di cablaggio) si scalda: le bobine sono dimensionate per impulsi brevi.'),
      S('Nel simulatore', 'La bobina è un\'impedenza costante (assorbimento tipico 4 W con cos φ 0,5, valore indicativo). Quando la tensione A1-A2 supera l\'80% della nominale partendo da sotto (fronte di salita), il contatto cambia stato. Il contatto ha 5 mΩ quando è chiuso e viene segnalato se la corrente supera la sua corrente nominale.'),
    ],
  },
  pushbutton: {
    title: 'Pulsante (normalmente aperto)',
    summary: 'Contatto momentaneo: chiude il circuito solo mentre è premuto.',
    sections: [
      S('A cosa serve', 'Invia un impulso: al relè passo-passo (luci), a un temporizzatore (luce scale), a un campanello. Più pulsanti in parallelo comandano lo stesso dispositivo da punti diversi.'),
      S('Differenza dall\'interruttore', 'L\'interruttore resta nella posizione scelta; il pulsante torna da solo nella posizione di riposo (aperto) quando lo rilasci.'),
      S('Nel simulatore', 'Clicca il tasto rotondo sul pulsante con la simulazione avviata: il contatto resta chiuso per circa 0,35 s.'),
    ],
  },
  'voltage-relay': { title: 'Relè di controllo tensione', summary: 'Interviene se la tensione esce dai limiti impostati, proteggendo gli apparecchi.', sections: [S('Stato', 'Funzionalità non implementata in questa versione.')] },
  'energy-meter': { title: 'Misuratore di energia', summary: 'Contatore modulare per misurare i consumi di un circuito.', sections: [S('Stato', 'Funzionalità non implementata in questa versione.')] },
  psu: { title: 'Alimentatore modulare', summary: 'Fornisce bassissima tensione (es. 12/24 V) per circuiti ausiliari.', sections: [S('Stato', 'Funzionalità non implementata in questa versione.')] },
};

export function componentInfo(catalogId: string): ComponentInfo | null {
  return COMPONENT_INFO[catalogId] ?? null;
}
