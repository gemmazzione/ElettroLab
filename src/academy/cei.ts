import { emitPersist, storageKey } from '../persistence/space';

/**
 * Percorso di studio della CEI 64-8, con il metodo «un argomento alla volta»: per ogni prescrizione una scheda
 * (rischio, regola, condizioni, eccezioni, esempio, articolo) e domande di ripasso riproposte dopo 1, 7 e 30 giorni.
 *
 * FONTE: CEI 64-8 6ª edizione (2007), testo fornito dall'utente: ogni articolo citato è stato letto sul testo.
 * È un'edizione storica: dal 1/11/2024 è in vigore la IX edizione, con numerazione armonizzata diversa e alcune
 * prescrizioni cambiate. Le schede servono a capire il ragionamento della norma, non come riferimento vigente.
 */

export const CEI_EDITION = 'CEI 64-8:2007 (6ª ed., storica)';

export interface CeiQuestion {
  q: string;
  options: string[];
  /** Indice della risposta corretta */
  answer: number;
  explain: string;
}

export interface CeiCard {
  id: string;
  title: string;
  /** Rischio che la prescrizione previene */
  risk: string;
  rule: string;
  conditions: string;
  exceptions?: string;
  example: string;
  /** Articoli della CEI 64-8:2007 letti sul testo */
  articles: string;
  questions: CeiQuestion[];
}

export type Practice =
  | { kind: 'exercise'; id: string; label: string }
  | { kind: 'impianto'; step: number; label: string };

export interface CeiTopic {
  id: string;
  title: string;
  intro: string;
  cards: CeiCard[];
  practice: Practice[];
}

export const CEI_TOPICS: CeiTopic[] = [
  {
    id: 'orientarsi',
    title: '1. Orientarsi nella norma',
    intro: 'Prima di studiare le prescrizioni conviene sapere dove cercarle: la norma è divisa in parti (principi, protezioni, scelta dei componenti, verifiche, ambienti particolari) e la numerazione degli articoli segue le parti.',
    practice: [{ kind: 'impianto', step: 1, label: 'Dividi un impianto in linee in «Progetta impianto»' }],
    cards: [
      {
        id: 'struttura',
        title: 'Com\'è organizzata la CEI 64-8',
        risk: 'Cercare una prescrizione nel posto sbagliato, o applicarne una pensata per un altro caso.',
        rule: 'Le parti seguono il percorso del progetto: Parte 3 caratteristiche generali (per esempio la suddivisione in circuiti), Parte 4 protezioni per la sicurezza (contatti, sovracorrenti, sovratensioni), Parte 5 scelta e installazione dei componenti (cavi, dispositivi, terra), Parte 6 verifiche, Parte 7 ambienti e applicazioni particolari.',
        conditions: 'Il primo numero dell\'articolo indica la parte: 413 è nella Parte 4, 543 nella Parte 5, 61.3 nella Parte 6, 701 nella Parte 7.',
        example: 'Il differenziale per il sistema TT si cerca in 413 (protezione, Parte 4); la sezione del conduttore di protezione in 543 (componenti, Parte 5).',
        articles: 'Struttura della CEI 64-8:2007 (Parti 1–7)',
        questions: [
          {
            q: 'In quale parte della CEI 64-8 (2007) si trovano le prove da eseguire sull\'impianto finito?',
            options: ['Parte 4', 'Parte 5', 'Parte 6', 'Parte 7'],
            answer: 2,
            explain: 'La Parte 6 riguarda le verifiche: esame a vista (61.2) e prove (61.3).',
          },
          {
            q: 'Un articolo numerato 701.x riguarda…',
            options: ['le verifiche iniziali', 'un ambiente particolare (bagni e docce)', 'la scelta dei cavi', 'la protezione dai sovraccarichi'],
            answer: 1,
            explain: 'La Parte 7 tratta ambienti e applicazioni particolari; la Sezione 701 è dedicata ai locali da bagno e doccia.',
          },
        ],
      },
      {
        id: 'circuiti',
        title: 'Suddivisione in circuiti',
        risk: 'Un solo guasto che spegne tutto l\'impianto, anche l\'illuminazione; manutenzione impossibile senza togliere tensione ovunque.',
        rule: 'Ogni impianto deve essere in genere suddiviso in più circuiti, per evitare pericoli e ridurre gli inconvenienti in caso di guasto, facilitare ispezioni, prove e manutenzione, e tenere conto dei pericoli del guasto di un singolo circuito (per esempio l\'illuminazione).',
        conditions: 'Le parti da comandare separatamente devono avere circuiti separati, non influenzati dai guasti degli altri.',
        example: 'In un appartamento luci e prese su linee diverse, sotto due differenziali: un guasto nelle prese non lascia al buio.',
        articles: '314.1, 314.2',
        questions: [
          {
            q: 'Perché la norma chiede di suddividere l\'impianto in più circuiti?',
            options: ['Per risparmiare cavo', 'Per ridurre gli inconvenienti in caso di guasto e facilitare prove e manutenzione', 'Per avere più potenza disponibile', 'Solo per gli impianti industriali'],
            answer: 1,
            explain: '314.1: evitare pericoli e ridurre inconvenienti in caso di guasto, facilitare ispezioni e manutenzione, tenere conto del guasto di un singolo circuito.',
          },
        ],
      },
    ],
  },
  {
    id: 'contatti',
    title: '2. Protezione contro i contatti elettrici',
    intro: 'Contatto diretto: si tocca una parte attiva (normalmente in tensione). Contatto indiretto: si tocca una massa andata in tensione per un guasto d\'isolamento. Le misure sono diverse.',
    practice: [
      { kind: 'exercise', id: 'l1-differenziale', label: 'Esercizio: funzione del differenziale' },
      { kind: 'exercise', id: 'l4-dispersione', label: 'Esercizio: ricerca guasti, dispersione' },
    ],
    cards: [
      {
        id: 'diretti',
        title: 'Contatti diretti: isolamento e involucri',
        risk: 'Toccare una parte attiva e attraversare il corpo con la corrente.',
        rule: 'Le parti attive vanno ricoperte da un isolamento rimovibile solo per distruzione, oppure poste entro involucri o dietro barriere con grado di protezione almeno IPXXB (IPXXD per le superfici superiori orizzontali a portata di mano).',
        conditions: 'Vale per ogni componente dell\'impianto; l\'isolamento dei componenti costruiti in fabbrica deve rispettare le loro norme.',
        exceptions: 'Aperture più grandi sono ammesse durante la sostituzione di parti (alcuni portalampade, fusibili) o quando servono al funzionamento.',
        example: 'Un quadro con il pannello frontale montato: le parti attive non si raggiungono con un dito di prova (IPXXB).',
        articles: '412.1, 412.2.1, 412.2.2',
        questions: [
          {
            q: 'Quale grado di protezione minimo devono assicurare involucri e barriere contro i contatti diretti?',
            options: ['IPXXA', 'IPXXB', 'IP44', 'IP65'],
            answer: 1,
            explain: '412.2.1: almeno IPXXB; IPXXD per le superfici superiori orizzontali a portata di mano (412.2.2).',
          },
        ],
      },
      {
        id: 'addizionale',
        title: 'Differenziale 30 mA come protezione addizionale',
        risk: 'Contatto diretto quando le altre misure falliscono o per incuria (cavo spellato, apparecchio danneggiato).',
        rule: 'Il differenziale con IΔn non superiore a 30 mA è riconosciuto come protezione addizionale contro i contatti diretti, ma non come unico mezzo: non dispensa da isolamento, involucri e barriere.',
        conditions: 'È richiesto nei locali ad uso abitativo per i circuiti delle prese fino a 20 A e per le prese fino a 32 A che alimentano apparecchi mobili usati all\'esterno.',
        exceptions: 'Può essere esentata una presa specifica destinata a un particolare componente elettrico.',
        example: 'Le prese di un appartamento sotto un differenziale da 30 mA; la presa in giardino per il tosaerba anche.',
        articles: '412.5.1, 412.5.2, 412.5.3',
        questions: [
          {
            q: 'Il differenziale da 30 mA può essere l\'unica protezione contro i contatti diretti?',
            options: ['Sì, se è di tipo A', 'Sì, nelle abitazioni', 'No: è una protezione addizionale e non dispensa dalle altre misure', 'Sì, se l\'impianto è TT'],
            answer: 2,
            explain: '412.5.2: non è riconosciuto quale unico mezzo di protezione contro i contatti diretti.',
          },
          {
            q: 'Nei locali ad uso abitativo, per quali circuiti la norma 2007 richiede il differenziale ≤ 30 mA?',
            options: ['Solo per il bagno', 'Per i circuiti delle prese fino a 20 A', 'Per tutti i circuiti luce', 'Solo per le prese oltre 32 A'],
            answer: 1,
            explain: '412.5.3 a): circuiti che alimentano prese a spina con corrente nominale non superiore a 20 A.',
          },
        ],
      },
      {
        id: 'indiretti-principio',
        title: 'Contatti indiretti: interruzione automatica',
        risk: 'Una massa in tensione per un guasto resta pericolosa finché qualcuno la tocca.',
        rule: 'Un dispositivo di protezione deve interrompere automaticamente l\'alimentazione perché non persista, per un tempo pericoloso, una tensione di contatto superiore alla tensione limite convenzionale UL.',
        conditions: 'UL vale 50 V in corrente alternata e 120 V in continua non ondulata (luoghi ordinari).',
        exceptions: 'In alcuni casi sono ammessi tempi fino a 5 s (TN, 413.1.3.5) o 1 s (TT, circuiti di distribuzione).',
        example: 'Lavatrice con l\'isolamento difettoso: il differenziale apre prima che toccare il mobile diventi pericoloso.',
        articles: '413.1.1.1 (con le Note 1 e 3)',
        questions: [
          {
            q: 'Qual è la tensione di contatto limite convenzionale UL in c.a. nei luoghi ordinari?',
            options: ['25 V', '50 V', '120 V', '230 V'],
            answer: 1,
            explain: '413.1.1.1, Nota 1: 50 V in c.a. e 120 V in c.c. non ondulata.',
          },
        ],
      },
      {
        id: 'tt',
        title: 'Sistema TT: RE · IΔn ≤ UL',
        risk: 'Nel TT la corrente di guasto passa per il terreno ed è piccola: un magnetotermico non la vede.',
        rule: 'Nei sistemi TT si devono usare differenziali e deve valere RE · IΔn ≤ UL, con RE resistenza del dispersore e IΔn la corrente differenziale nominale.',
        conditions: 'Con più differenziali in serie la resistenza di terra va coordinata con quello di IΔn più alta (commento a 536.3).',
        exceptions: 'Per la selettività nei circuiti di distribuzione è ammesso un tempo di interruzione fino a 1 s (differenziale tipo S).',
        example: 'Con un differenziale da 30 mA basta RE ≤ 50 / 0,03 ≈ 1667 Ω; con un generale da 300 mA serve RE ≤ 167 Ω.',
        articles: '413.1.4.2',
        questions: [
          {
            q: 'Impianto TT con un differenziale generale da 300 mA: qual è la RE massima (UL = 50 V)?',
            options: ['1667 Ω', '500 Ω', '167 Ω', '50 Ω'],
            answer: 2,
            explain: 'RE ≤ UL / IΔn = 50 / 0,3 ≈ 167 Ω (413.1.4.2).',
          },
          {
            q: 'Nel sistema TT la protezione contro i contatti indiretti si fa…',
            options: ['con i soli magnetotermici', 'con dispositivi differenziali', 'con i fusibili', 'non serve'],
            answer: 1,
            explain: '413.1.4.2: nei sistemi TT si devono utilizzare dispositivi di protezione a corrente differenziale.',
          },
        ],
      },
      {
        id: 'tn',
        title: 'Sistema TN: Zs · Ia ≤ U0',
        risk: 'Nel TN il guasto a massa è quasi un cortocircuito verso il PE: se l\'anello di guasto è troppo lungo la corrente non basta a far intervenire la protezione in tempo.',
        rule: 'Le caratteristiche dei dispositivi e le impedenze dei circuiti devono essere tali che, per un guasto franco tra fase e PE o massa, la protezione intervenga entro il tempo richiesto: Zs · Ia ≤ U0.',
        conditions: 'Zs è l\'impedenza dell\'anello di guasto, Ia la corrente che fa intervenire la protezione entro il tempo della Tab. 41A (0,4 s a 230 V per i circuiti terminali) o 5 s per i circuiti di distribuzione; U0 è la tensione fase-neutro.',
        exceptions: 'Con un differenziale Ia è la sua IΔn: la condizione si soddisfa facilmente.',
        example: 'Linea lunga 300 m in un capannone TN-S senza differenziale: per far scattare il magnetico serve una sezione maggiore di quella della portata.',
        articles: '413.1.3.3, Tab. 41A, 413.1.3.5',
        questions: [
          {
            q: 'Nel sistema TN, perché una linea molto lunga può non essere protetta dai contatti indiretti?',
            options: ['Perché aumenta Zs e la corrente di guasto non raggiunge Ia', 'Perché aumenta la tensione', 'Perché il PE non serve', 'Perché il differenziale non funziona nel TN'],
            answer: 0,
            explain: 'Zs cresce con la lunghezza: la corrente U0/Zs può scendere sotto Ia e la protezione non interviene in tempo (413.1.3.3).',
          },
        ],
      },
    ],
  },
  {
    id: 'sovracorrenti',
    title: '3. Sovraccarichi e cortocircuiti',
    intro: 'Sovraccarico: corrente poco più alta della portata per un tempo lungo, scalda il cavo. Cortocircuito: corrente altissima per poco tempo, va interrotta prima che il cavo superi la temperatura limite.',
    practice: [
      { kind: 'exercise', id: 'l3-dimensionamento', label: 'Esercizio: dimensionamento di protezioni e linee' },
      { kind: 'exercise', id: 'l4-sovraccarico', label: 'Esercizio: ricerca guasti, sovraccarico' },
      { kind: 'impianto', step: 3, label: 'Controlla le verifiche delle linee in «Progetta impianto»' },
    ],
    cards: [
      {
        id: 'ib-in-iz',
        title: 'Ib ≤ In ≤ Iz e If ≤ 1,45 · Iz',
        risk: 'Un cavo percorso a lungo da una corrente oltre la sua portata invecchia e può incendiarsi.',
        rule: 'Il dispositivo che protegge dai sovraccarichi deve soddisfare Ib ≤ In ≤ Iz e If ≤ 1,45 · Iz.',
        conditions: 'Ib corrente d\'impiego, In corrente nominale (o di regolazione), Iz portata della conduttura (Sezione 523), If corrente di sicuro funzionamento entro il tempo convenzionale.',
        exceptions: 'La protezione non copre i piccoli sovraccarichi prolungati sotto If: il circuito va progettato perché non siano frequenti.',
        example: 'Linea da 2,5 mm² con Iz = 21 A e carico da 12 A: un magnetotermico da 16 A va bene, uno da 25 A no.',
        articles: '433.2',
        questions: [
          {
            q: 'Ib = 12 A, Iz = 21 A. Quale magnetotermico soddisfa Ib ≤ In ≤ Iz?',
            options: ['10 A', '16 A', '25 A', '32 A'],
            answer: 1,
            explain: '10 A è sotto Ib, 25 e 32 A superano Iz: resta 16 A (433.2).',
          },
          {
            q: 'Nei magnetotermici per uso domestico If = 1,45 · In. Cosa diventa allora la seconda condizione?',
            options: ['È sempre soddisfatta se In ≤ Iz', 'Richiede In ≤ Iz / 2', 'Non si applica', 'Richiede un fusibile in più'],
            answer: 0,
            explain: 'If ≤ 1,45 · Iz diventa 1,45 · In ≤ 1,45 · Iz, cioè In ≤ Iz: già garantita dalla prima condizione.',
          },
        ],
      },
      {
        id: 'potere',
        title: 'Potere di interruzione',
        risk: 'Un interruttore che deve aprire una corrente più grande di quella che sa interrompere può esplodere o non aprire.',
        rule: 'Il potere di interruzione non deve essere inferiore alla corrente di cortocircuito presunta nel punto di installazione.',
        conditions: 'L\'Icc presunta si ricava dal punto di consegna (dato del distributore o della cabina) e dalle impedenze a monte.',
        exceptions: 'È ammesso un potere inferiore se a monte c\'è un dispositivo con il potere necessario e i due sono coordinati (protezione di sostegno, «back-up»).',
        example: 'Icc al quadro 6 kA: magnetotermici da 6 kA o più; con 4,5 kA solo se coordinati con il generale secondo le tabelle del costruttore.',
        articles: '434.3.1',
        questions: [
          {
            q: 'Icc presunta al quadro 9 kA. Quale potere di interruzione scegli senza coordinamento?',
            options: ['4,5 kA', '6 kA', '10 kA', 'Non conta'],
            answer: 2,
            explain: '434.3.1: il potere di interruzione non deve essere inferiore all\'Icc presunta; 10 kA ≥ 9 kA.',
          },
        ],
      },
      {
        id: 'i2t',
        title: 'Energia passante: I²t ≤ K²S²',
        risk: 'Durante il cortocircuito il cavo si scalda in pochi millisecondi: se la protezione è lenta l\'isolante si danneggia.',
        rule: 'La corrente di cortocircuito va interrotta prima che i conduttori raggiungano la temperatura limite: per durate fino a 5 s vale I²t ≤ K²S².',
        conditions: 'K = 115 per rame isolato in PVC, 143 per rame isolato in gomma etilenpropilenica (EPR) o materiali reticolati; S sezione in mm².',
        exceptions: 'Per durate sotto 0,1 s e dispositivi limitatori si confronta K²S² con l\'I²t dichiarato dal costruttore.',
        example: 'Cavo 2,5 mm² in PVC: K²S² = 115² · 2,5² ≈ 82.600 A²s.',
        articles: '434.3.2',
        questions: [
          {
            q: 'Quanto vale K per un conduttore in rame isolato in PVC?',
            options: ['74', '115', '143', '226'],
            answer: 1,
            explain: '434.3.2: K = 115 per rame/PVC, 143 per rame/EPR.',
          },
        ],
      },
      {
        id: 'unico',
        title: 'Un solo dispositivo per sovraccarico e cortocircuito',
        risk: 'Dimenticare la verifica al cortocircuito quando si sceglie l\'interruttore solo per il sovraccarico.',
        rule: 'Se un dispositivo protegge dai sovraccarichi (433) e ha un potere di interruzione non inferiore all\'Icc presunta, protegge anche dai cortocircuiti la conduttura a valle.',
        conditions: 'Vale per i dispositivi limitatori, come i magnetotermici modulari.',
        exceptions: 'Può non valere per interruttori che non limitano la corrente su tutta la gamma: in quel caso si verifica 434.3.',
        example: 'Magnetotermico C16, 6 kA, su una linea da 2,5 mm² con Icc al quadro di 4 kA: protetta da entrambi.',
        articles: '435.1',
        questions: [
          {
            q: 'Quando un dispositivo che protegge dal sovraccarico protegge anche dal cortocircuito?',
            options: ['Sempre', 'Se ha potere di interruzione ≥ Icc presunta (e limita la corrente)', 'Solo se è un fusibile', 'Mai'],
            answer: 1,
            explain: '435.1, con la nota sugli interruttori che non limitano la corrente.',
          },
        ],
      },
    ],
  },
  {
    id: 'componenti',
    title: '4. Scelta di cavi e dispositivi',
    intro: 'Dopo le protezioni, la Parte 5 dice come scegliere e posare i componenti: sezioni minime, caduta di tensione, conduttore di protezione, differenziali e loro coordinamento.',
    practice: [
      { kind: 'exercise', id: 'l3-carichi', label: 'Esercizio: carichi e potenza disponibile' },
      { kind: 'impianto', step: 1, label: 'Dimensiona le linee in «Progetta impianto»' },
    ],
    cards: [
      {
        id: 'sez-min',
        title: 'Sezioni minime',
        risk: 'Conduttori troppo sottili fragili e con caduta di tensione eccessiva.',
        rule: 'Sezione minima dei conduttori di fase: 1,5 mm² di rame per i circuiti di potenza in cavo, 0,5 mm² per segnalazione e comando (Tab. 52E).',
        conditions: 'Condutture mobili con cavi flessibili: 0,75 mm² per uso generale; conduttori nudi 10 mm² di rame.',
        example: 'Linea luci in 1,5 mm², prese in 2,5 mm² (scelta di buona pratica, non un minimo della norma).',
        articles: '524.1, Tab. 52E',
        questions: [
          {
            q: 'Sezione minima di un circuito di potenza in cavo di rame (Tab. 52E)?',
            options: ['0,75 mm²', '1 mm²', '1,5 mm²', '2,5 mm²'],
            answer: 2,
            explain: 'Tab. 52E: 1,5 mm² per i circuiti di potenza in rame. I 2,5 mm² per le prese sono buona pratica.',
          },
        ],
      },
      {
        id: 'caduta',
        title: 'Caduta di tensione',
        risk: 'Apparecchi alimentati a tensione troppo bassa funzionano male (motori che non partono, lampade che calano).',
        rule: 'Si raccomanda che la caduta tra l\'origine e qualunque punto dell\'impianto, col carico di progetto, non superi il 4% della tensione nominale.',
        conditions: 'È una raccomandazione che vale in mancanza di indicazioni diverse del committente.',
        example: 'Con un 2% già perso sulla linea dal contatore al quadro, alle linee terminali resta il 2%.',
        articles: '525',
        questions: [
          {
            q: 'Qual è la caduta di tensione raccomandata dalla CEI 64-8:2007 dall\'origine all\'utilizzatore?',
            options: ['2%', '4%', '5%', '10%'],
            answer: 1,
            explain: '525: 4%, in mancanza di specifiche indicazioni del committente.',
          },
        ],
      },
      {
        id: 'pe',
        title: 'Sezione del conduttore di protezione',
        risk: 'Un PE troppo sottile si scalda durante il guasto o fa crescere l\'impedenza dell\'anello.',
        rule: 'Tab. 54F: PE uguale alla fase fino a 16 mm², 16 mm² per fasi da 16 a 35 mm², metà della fase oltre 35 mm². Con questa tabella non serve la verifica adiabatica (543.1.1).',
        conditions: 'Vale se PE e fasi sono dello stesso materiale; altrimenti si usa una sezione di conduttanza equivalente. Una sezione non unificata si arrotonda alla più vicina.',
        example: 'Linea in 95 mm²: PE di almeno 50 mm² (95 / 2 = 47,5, arrotondato alla sezione unificata più vicina).',
        articles: '543.1.2, Tab. 54F',
        questions: [
          {
            q: 'Fase da 25 mm²: sezione minima del PE secondo la Tab. 54F?',
            options: ['10 mm²', '16 mm²', '25 mm²', '12,5 mm²'],
            answer: 1,
            explain: 'Per 16 < S ≤ 35 mm² il PE è di 16 mm².',
          },
        ],
      },
      {
        id: 'rcd-puro',
        title: 'Differenziale puro e sovracorrenti',
        risk: 'Un differenziale senza sganciatori magnetotermici danneggiato da un sovraccarico o da un cortocircuito a valle.',
        rule: 'Se il differenziale non è combinato con una protezione contro le sovracorrenti, questa va assicurata da altri dispositivi e il differenziale deve sopportare le sollecitazioni del cortocircuito a valle.',
        conditions: 'In pratica: corrente nominale del differenziale coordinata con l\'interruttore a monte o con la somma di quelli a valle, secondo il costruttore.',
        example: 'Un differenziale puro da 40 A sotto un generale da 32 A: il generale lo protegge dal sovraccarico.',
        articles: '536.2.2',
        questions: [
          {
            q: 'Un differenziale puro (senza magnetotermico) protegge da sé il circuito dai sovraccarichi?',
            options: ['Sì', 'No: servono dispositivi contro le sovracorrenti', 'Solo se è di tipo S', 'Solo nel TN'],
            answer: 1,
            explain: '536.2.2: la protezione contro le sovracorrenti va assicurata da altri dispositivi.',
          },
        ],
      },
      {
        id: 'sel-rcd',
        title: 'Selettività tra differenziali',
        risk: 'Un guasto in una stanza fa intervenire il differenziale generale e spegne tutto.',
        rule: 'Due differenziali in serie sono selettivi se la caratteristica di non funzionamento di quello a monte sta sopra quella d\'intervento di quello a valle e la sua IΔn è adeguatamente superiore.',
        conditions: 'Il commento considera ottenuta la selettività tra un tipo S a monte e un tipo generale a valle quando il rapporto tra le IΔn è almeno 3.',
        example: 'Generale 300 mA tipo S, linee con 30 mA: selettivi (rapporto 10).',
        articles: '536.3 (con il commento)',
        questions: [
          {
            q: 'A monte di differenziali da 30 mA metti un generale. Quale è selettivo secondo il commento a 536.3?',
            options: ['30 mA tipo generale', '100 mA tipo S', '30 mA tipo S', '100 mA tipo generale'],
            answer: 1,
            explain: 'Tipo S a monte e rapporto tra le IΔn di almeno 3: 100 mA S su 30 mA va bene.',
          },
        ],
      },
    ],
  },
  {
    id: 'terra',
    title: '5. Impianto di terra ed equipotenziali',
    intro: 'Il dispersore, il conduttore di terra, il collettore principale e i conduttori equipotenziali portano a terra le masse e le masse estranee (tubazioni, strutture metalliche).',
    practice: [
      { kind: 'exercise', id: 'l1-fase-neutro-terra', label: 'Esercizio: fase, neutro e terra' },
      { kind: 'impianto', step: 4, label: 'Dimensiona la terra in «Progetta impianto»' },
    ],
    cards: [
      {
        id: 'cond-terra',
        title: 'Conduttore di terra',
        risk: 'Un conduttore di terra danneggiato o corroso interrompe il collegamento di tutte le masse.',
        rule: 'Sezioni convenzionali minime (Tab. 54A): se non protetto meccanicamente 16 mm² di rame o ferro zincato se protetto contro la corrosione, 25 mm² di rame o 50 mm² di ferro zincato se non protetto contro la corrosione.',
        conditions: 'Se protetto meccanicamente e contro la corrosione vale la sezione di 543.1.',
        example: 'Corda di rame nuda interrata dal pozzetto al collettore: almeno 25 mm².',
        articles: '542.3.1, Tab. 54A',
        questions: [
          {
            q: 'Conduttore di terra in rame, non protetto meccanicamente né contro la corrosione: sezione minima?',
            options: ['6 mm²', '16 mm²', '25 mm²', '50 mm²'],
            answer: 2,
            explain: 'Tab. 54A: 25 mm² di rame (50 mm² se di ferro zincato).',
          },
        ],
      },
      {
        id: 'eq-princ',
        title: 'Equipotenziali principali e supplementari',
        risk: 'Differenze di potenziale tra masse e tubazioni durante un guasto.',
        rule: 'Equipotenziale principale: almeno metà del PE di sezione più elevata, minimo 6 mm², non oltre 25 mm² se di rame. Supplementare: tra due masse almeno pari al PE più piccolo; tra massa e massa estranea almeno metà del PE.',
        conditions: 'Le masse estranee entranti nell\'edificio (acqua, gas, strutture) vanno collegate al collettore principale.',
        example: 'PE più grande da 16 mm²: equipotenziale principale da 10 mm² (8 arrotondato alla sezione unificata).',
        articles: '547.1.1, 547.1.2',
        questions: [
          {
            q: 'PE più grande dell\'impianto da 6 mm²: sezione minima dell\'equipotenziale principale?',
            options: ['2,5 mm²', '3 mm²', '6 mm²', '10 mm²'],
            answer: 2,
            explain: 'Metà di 6 = 3 mm², ma il minimo è 6 mm² (547.1.1).',
          },
        ],
      },
    ],
  },
  {
    id: 'sovratensioni',
    title: '6. Sovratensioni',
    intro: 'Le sovratensioni transitorie (fulmini, manovre) vanno confrontate con la tenuta all\'impulso dei componenti. La necessità degli SPD si valuta con un\'analisi del rischio.',
    practice: [{ kind: 'impianto', step: 0, label: 'Scegli gli SPD in «Progetta impianto»' }],
    cards: [
      {
        id: 'tab44a',
        title: 'Tenuta all\'impulso e SPD',
        risk: 'Una sovratensione oltre la tenuta degli apparecchi li danneggia.',
        rule: 'I componenti devono avere una tenuta all\'impulso non inferiore a quella richiesta dalla Tab. 44A; la necessità degli SPD dipende dalla valutazione del rischio della CEI EN 62305-2 e, se installati, non si devono superare i livelli della Tab. 44A.',
        conditions: 'A 230/400 V la Tab. 44A richiede 6 kV (categoria IV, origine dell\'impianto), 4 kV (III, quadri, cavi, prese), 2,5 kV (II, elettrodomestici), 1,5 kV (I, apparecchi sensibili).',
        exceptions: 'Si possono usare componenti con tenuta inferiore se si accetta un rischio di danno più elevato (443.4.2).',
        example: 'Un elettrodomestico (categoria II, 2,5 kV): l\'SPD deve limitare la sovratensione sotto questo valore, considerando anche i collegamenti.',
        articles: '443.3, 443.4.1, 443.4.2, Tab. 44A',
        questions: [
          {
            q: 'A 230/400 V, quale tenuta all\'impulso richiede la Tab. 44A per gli elettrodomestici (categoria II)?',
            options: ['1,5 kV', '2,5 kV', '4 kV', '6 kV'],
            answer: 1,
            explain: 'Categoria II: 2,5 kV a 230/400 V.',
          },
          {
            q: 'Come si stabilisce se servono gli SPD secondo la CEI 64-8:2007?',
            options: ['Sempre obbligatori', 'Con la valutazione del rischio della CEI EN 62305-2', 'Solo con la linea aerea', 'Mai nelle abitazioni'],
            answer: 1,
            explain: '443.3: la necessità dipende dalla valutazione del rischio basata sulla CEI EN 62305-2.',
          },
        ],
      },
    ],
  },
  {
    id: 'verifiche',
    title: '7. Verifiche iniziali',
    intro: 'Prima della messa in servizio l\'impianto si esamina a vista e si prova con strumenti conformi alla serie CEI EN 61557, nell\'ordine indicato dalla norma.',
    practice: [{ kind: 'exercise', id: 'l6-verifiche', label: 'Esercizio: verifiche iniziali con lo strumento' }],
    cards: [
      {
        id: 'vista',
        title: 'Esame a vista',
        risk: 'Componenti non conformi, scelti male o danneggiati che le misure non rivelano.',
        rule: 'L\'esame a vista precede le prove e si fa di regola con l\'impianto fuori tensione: componenti conformi alle loro norme, scelti e installati secondo la norma e le istruzioni del costruttore, non danneggiati.',
        conditions: 'La conformità si accerta con marcature, certificazioni e informazioni del costruttore.',
        example: 'Controllare targhe dei dispositivi, colori dei conduttori, serraggio dei morsetti, presenza delle protezioni.',
        articles: '61.2.1, 61.2.2',
        questions: [
          {
            q: 'L\'esame a vista si fa…',
            options: ['dopo le prove, con l\'impianto in tensione', 'prima delle prove, di regola fuori tensione', 'solo negli impianti industriali', 'solo se le prove falliscono'],
            answer: 1,
            explain: '61.2.1: precede la prova ed è effettuato, di regola, con l\'impianto fuori tensione.',
          },
        ],
      },
      {
        id: 'prove',
        title: 'Ordine delle prove e isolamento',
        risk: 'Mettere in tensione un impianto con un PE interrotto o un isolamento difettoso.',
        rule: 'Prove, preferibilmente in quest\'ordine: continuità dei conduttori, resistenza d\'isolamento, SELV/PELV e separazione elettrica, resistenza di pavimenti e pareti, interruzione automatica, protezione addizionale, polarità, ordine delle fasi, prove di funzionamento, caduta di tensione.',
        conditions: 'Isolamento (Tab. 6A): circuiti fino a 500 V provati a 500 V c.c., almeno 1 MΩ; SELV e PELV a 250 V, almeno 0,5 MΩ; con gli apparecchi utilizzatori disinseriti.',
        example: 'Prima la continuità del PE fino a ogni presa, poi l\'isolamento tra fasi/neutro e PE a 500 V.',
        articles: '61.3.1, 61.3.3, Tab. 6A',
        questions: [
          {
            q: 'Quale prova si esegue per prima secondo l\'ordine di 61.3.1?',
            options: ['Resistenza d\'isolamento', 'Continuità dei conduttori', 'Prova del differenziale', 'Ordine delle fasi'],
            answer: 1,
            explain: '61.3.1 a): continuità dei conduttori; poi isolamento, SELV/PELV, pavimenti, interruzione automatica…',
          },
          {
            q: 'Circuito a 230 V: tensione di prova e resistenza d\'isolamento minima (Tab. 6A)?',
            options: ['250 V, 0,5 MΩ', '500 V, 1 MΩ', '1000 V, 1 MΩ', '500 V, 0,25 MΩ'],
            answer: 1,
            explain: 'Fino a 500 V: prova a 500 V c.c., almeno 1,0 MΩ.',
          },
        ],
      },
    ],
  },
  {
    id: 'ambienti',
    title: '8. Ambienti e servizi particolari',
    intro: 'La Parte 7 aggiunge prescrizioni per i luoghi a rischio maggiore; il Capitolo 56 tratta i circuiti dei servizi di sicurezza.',
    practice: [{ kind: 'impianto', step: 2, label: 'Disegna un bagno nella planimetria di «Progetta impianto»' }],
    cards: [
      {
        id: 'bagno',
        title: 'Bagni e docce',
        risk: 'Corpo bagnato e superfici conduttrici: la resistenza del corpo crolla e anche piccole tensioni sono pericolose.',
        rule: 'Equipotenziale supplementare tra masse estranee e PE delle zone 0–3; gradi IPX7 in zona 0, IPX4 in zona 1 e 2; nessuna cassetta di derivazione nelle zone 0, 1, 2; niente dispositivi di protezione, sezionamento e comando nelle zone 0, 1, 2 salvo SELV fino a 12 V c.a.',
        conditions: 'Nei bagni pubblici lavati con getti d\'acqua serve almeno IPX5.',
        exceptions: 'Alimentatori per rasoi conformi alla loro norma in zona 2, se gli spruzzi sono improbabili.',
        example: 'Interruttore della luce fuori dalla zona 2; aspiratore di classe II IPX4 ammesso in zona 2.',
        articles: '701.413.1.2, 701.512.2, 701.520.04, 701.53',
        questions: [
          {
            q: 'Grado di protezione minimo in zona 1 di un bagno privato?',
            options: ['IPX2', 'IPX4', 'IPX5', 'IPX7'],
            answer: 1,
            explain: '701.512.2: IPX7 in zona 0, IPX4 in zone 1 e 2.',
          },
          {
            q: 'Si può mettere una cassetta di derivazione in zona 2?',
            options: ['Sì', 'Sì, se IPX4', 'No', 'Solo con un differenziale'],
            answer: 2,
            explain: '701.520.04: non sono ammesse cassette di derivazione nelle zone 0, 1 e 2.',
          },
        ],
      },
      {
        id: 'sicurezza',
        title: 'Circuiti dei servizi di sicurezza',
        risk: 'L\'illuminazione di sicurezza che si spegne per un guasto su un altro circuito proprio quando serve.',
        rule: 'Sorgente che mantenga l\'alimentazione per una durata adeguata; circuiti indipendenti dagli altri; protezione dal sovraccarico che si può omettere; dispositivi identificati e raggruppati in luoghi accessibili solo a persone addestrate.',
        conditions: 'I circuiti non devono attraversare luoghi con pericolo di esplosione, né luoghi con pericolo d\'incendio se non resistenti al fuoco.',
        example: 'Lampade di emergenza su una linea propria, non derivata dalle prese.',
        articles: '561.1, 563.1, 563.2, 563.3, 563.5',
        questions: [
          {
            q: 'Per i circuiti dei servizi di sicurezza la protezione contro i sovraccarichi…',
            options: ['è obbligatoria', 'si può omettere', 'va fatta con fusibili', 'va fatta con differenziali'],
            answer: 1,
            explain: '563.3: la protezione contro i sovraccarichi prescritta in 473.1 può essere omessa.',
          },
        ],
      },
    ],
  },
];

export const ALL_CARDS = CEI_TOPICS.flatMap((t) => t.cards.map((c) => ({ ...c, topic: t.id })));

// ------------------------------------------------------------------ ripasso a intervalli (1, 7, 30 giorni)

/** Intervalli del ripasso [giorni] dopo una risposta giusta, per livello raggiunto. */
export const INTERVALS = [1, 7, 30] as const;

export interface CardState {
  /** Livello: 0 = da studiare, 1/2/3 = superato a 1, 7, 30 giorni */
  box: number;
  /** Data del prossimo ripasso (AAAA-MM-GG) */
  due: string;
  seen: number;
  correct: number;
}

export type CeiProgress = Record<string, CardState>;

const KEY = 'electrolab.cei.v1';

const pad = (n: number) => String(n).padStart(2, '0');
/** Data di oggi nel fuso dell'utente (AAAA-MM-GG). */
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (iso: string, n: number) => {
  const [y, m, g] = iso.split('-').map(Number) as [number, number, number];
  const d = new Date(Date.UTC(y, m - 1, g + n));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

export function loadCeiProgress(): CeiProgress {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey(KEY)) ?? '{}') as CeiProgress;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function saveCeiProgress(all: CeiProgress, sync = true): void {
  try {
    localStorage.setItem(storageKey(KEY), JSON.stringify(all));
  } catch {
    /* memoria locale non disponibile */
  }
  if (sync) emitPersist({ type: 'cei', data: all });
}

/** Sostituisce i progressi (dati dell'account). */
export function replaceCeiProgress(all: CeiProgress): void {
  saveCeiProgress(all, false);
}

/** Unisce due copie dei progressi tenendo, per ogni scheda, quella vista più volte. */
export function mergeCeiProgress(a: CeiProgress | null, b: CeiProgress | null): CeiProgress {
  const out: CeiProgress = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) if (!out[k] || v.seen > out[k]!.seen) out[k] = v;
  return out;
}

/** Esito di un ripasso: giusto → livello successivo e prossimo intervallo; sbagliato → di nuovo da domani. */
export function nextState(prev: CardState | undefined, ok: boolean, now = today()): CardState {
  const box = ok ? Math.min(INTERVALS.length, (prev?.box ?? 0) + 1) : 0;
  const days = ok ? INTERVALS[box - 1]! : 1;
  return { box, due: addDays(now, days), seen: (prev?.seen ?? 0) + 1, correct: (prev?.correct ?? 0) + (ok ? 1 : 0) };
}

export function recordAnswer(cardId: string, ok: boolean, now = today()): CeiProgress {
  const all = loadCeiProgress();
  all[cardId] = nextState(all[cardId], ok, now);
  saveCeiProgress(all);
  return all;
}

/** Schede da ripassare oggi: quelle studiate con la data di ripasso raggiunta. */
export function dueCards(progress: CeiProgress, now = today()): string[] {
  return ALL_CARDS.filter((c) => progress[c.id] && progress[c.id]!.due <= now).map((c) => c.id);
}

export const mastered = (progress: CeiProgress) => ALL_CARDS.filter((c) => (progress[c.id]?.box ?? 0) >= INTERVALS.length).length;
