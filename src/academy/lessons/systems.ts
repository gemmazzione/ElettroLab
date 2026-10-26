import type { Lesson } from './types';

/** Percorsi: quadro elettrico, circuiti e comandi, trifase, misure e ricerca guasti. */
export const SYSTEM_LESSONS: Lesson[] = [
  // ------------------------------------------------------------ quadro elettrico
  {
    id: 'qu-0-cose',
    track: 'quadro',
    level: 0,
    title: "Cos'è un quadro elettrico",
    minutes: 6,
    goals: ["Sapere cosa contiene un quadro", "Conoscere moduli e guida DIN"],
    sections: [
      {
        title: "Il centro dell'impianto",
        body: "Il quadro raccoglie in un unico punto i dispositivi che proteggono e comandano i circuiti: interruttore generale, differenziali, magnetotermici, morsettiere.\nDa lì partono le linee verso luci, prese e apparecchi.",
      },
      {
        title: "Moduli e guida DIN",
        body: "I dispositivi modulari si agganciano a una guida metallica normalizzata larga 35 mm (guida DIN). La loro larghezza si misura in moduli da 17,5 mm: un magnetotermico 1P+N compatto occupa 1 modulo, un differenziale 2P di solito 2.\nI quadri si scelgono per numero di moduli (12, 24, 36…), lasciando spazio di riserva per ampliamenti.",
      },
      {
        title: "Sicurezza del quadro",
        body: "Le parti in tensione sono protette dal pannello frontale: si vedono e si manovrano solo le leve.\nIl quadro si apre solo dopo aver tolto tensione con l'interruttore generale o a monte.",
      },
    ],
    keyPoints: ["Il quadro contiene protezioni e comandi di tutti i circuiti.", "Guida DIN da 35 mm, moduli da 17,5 mm.", "Prevedi moduli di riserva."],
    quiz: [
      { q: "Quanto è largo un modulo DIN?", options: ["10 mm", "17,5 mm", "35 mm"], correct: 1, why: "35 mm è la larghezza della guida, 17,5 mm quella di un modulo." },
      { q: "Perché lasciare moduli liberi in un quadro?", options: ["Per estetica", "Per ampliamenti futuri e per dissipare calore", "Non serve"], correct: 1, why: "Spazio di riserva per nuovi circuiti e migliore smaltimento del calore." },
      { q: "Cosa si vede del quadro chiuso?", options: ["I morsetti in tensione", "Solo le leve dei dispositivi", "I conduttori"], correct: 1, why: "Il pannello frontale copre le parti attive." },
    ],
    practice: { demo: 'demo-monolocale', info: ['mcb-1pn', 'rcd-2p'] },
  },
  {
    id: 'qu-1-struttura',
    track: 'quadro',
    level: 1,
    title: "Dall'interruttore generale ai circuiti",
    minutes: 9,
    goals: ["Conoscere l'ordine dei dispositivi", "Suddividere l'impianto in circuiti", "Capire i gruppi differenziali"],
    sections: [
      {
        title: "L'ordine dei dispositivi",
        body: "Dal contatore arriva la linea al quadro. Il primo dispositivo è l'interruttore generale (spesso un magnetotermico 2P), poi uno o più differenziali, poi i magnetotermici dei singoli circuiti.\nIn alternativa si usano magnetotermici differenziali, uno per circuito: ognuno fa entrambe le funzioni.",
      },
      {
        title: "Perché suddividere",
        body: "Più circuiti indipendenti significano che un guasto spegne solo una parte della casa: un guasto sulle prese non lascia al buio le stanze.\nSi separano almeno luci e prese, e si dedicano linee agli apparecchi più potenti (forno, piano cottura, lavatrice, climatizzatore).",
      },
      {
        title: "Gruppi differenziali",
        body: "Con un solo differenziale a monte di tutto, una dispersione su qualsiasi circuito spegne tutta la casa. Due o più gruppi differenziali (o un differenziale per circuito) limitano il disservizio.",
      },
    ],
    keyPoints: ["Generale → differenziali → magnetotermici di circuito.", "Luci e prese su circuiti separati.", "Più gruppi differenziali = meno disservizio."],
    quiz: [
      { q: "Qual è in genere il primo dispositivo del quadro?", options: ["Il magnetotermico delle luci", "L'interruttore generale", "La morsettiera PE"], correct: 1, why: "Il generale seziona e protegge tutto il quadro." },
      { q: "Perché separare luci e prese?", options: ["Per usare cavi diversi", "Perché un guasto sulle prese non lasci al buio", "Perché lo vuole il distributore"], correct: 1, why: "La suddivisione limita gli effetti di un guasto." },
      { q: "Un unico differenziale per tutta la casa interviene per una dispersione sulla lavatrice. Cosa si spegne?", options: ["Solo la lavatrice", "Tutto l'impianto", "Solo le luci"], correct: 1, why: "Il differenziale è a monte di tutti i circuiti." },
    ],
    practice: { exercise: 'l2-primo-quadro' },
  },
  {
    id: 'qu-2-cablaggio',
    track: 'quadro',
    level: 2,
    title: "Cablaggio ordinato: morsettiere, ponticelli e pettini",
    minutes: 10,
    goals: ["Cablare ingressi e uscite correttamente", "Gestire i neutri dei gruppi differenziali", "Usare morsettiere e pettini"],
    sections: [
      {
        title: "Ingressi in alto, uscite in basso",
        body: "Per convenzione l'alimentazione entra dai morsetti superiori e i circuiti escono da quelli inferiori. Alimentare un dispositivo dal basso (alimentazione inversa) è possibile solo se il costruttore lo ammette e rende il quadro meno leggibile.",
      },
      {
        title: "Neutri e differenziali",
        body: "Il neutro di un circuito deve tornare attraverso lo stesso differenziale da cui passa la fase. Se si mescolano i neutri di gruppi differenziali diversi su una stessa morsettiera, i differenziali vedono correnti sbilanciate e intervengono senza guasti.\nUna morsettiera di neutro comune va bene solo a monte dei differenziali, o una per ogni gruppo.",
      },
      {
        title: "Ponticelli e pettini",
        body: "Per alimentare più dispositivi affiancati si usano ponticelli in cavo o, meglio, un pettine: una barra in rame isolata che entra nei morsetti d'ingresso. È più ordinato e riduce i morsetti affollati.\nVa scelto per la corrente totale e per il passo dei dispositivi (1P+N, 3P+N…).",
      },
      {
        title: "Il PE nel quadro",
        body: "Tutti i conduttori di protezione arrivano a una morsettiera PE collegata al conduttore che va al dispersore. Il PE non passa mai attraverso interruttori o differenziali.",
      },
    ],
    keyPoints: ["Ingresso dall'alto, uscita dal basso.", "Neutro e fase di un circuito attraverso lo stesso differenziale.", "Il PE non si interrompe mai."],
    quiz: [
      { q: "Due gruppi differenziali con i neutri sulla stessa morsettiera. Cosa succede?", options: ["Nulla", "Interventi intempestivi dei differenziali", "Maggiore selettività"], correct: 1, why: "Ogni differenziale vede una corrente di ritorno che non è la sua." },
      { q: "Il conduttore PE può passare attraverso il differenziale?", options: ["Sì, sempre", "No, il PE non si interrompe e non passa nel toroide", "Solo in trifase"], correct: 1, why: "Il PE deve restare continuo; nel toroide passano solo i conduttori attivi." },
      { q: "Un vantaggio del pettine rispetto ai ponticelli è…", options: ["non serve più il generale", "cablaggio più ordinato e morsetti meno affollati", "protegge dal sovraccarico"], correct: 1, why: "Una sola barra sostituisce molti ponticelli." },
    ],
    practice: { exercise: 'l2-neutri', info: ['comb-1pn', 'bar-n-8'] },
  },
  {
    id: 'qu-3-unifilare',
    track: 'quadro',
    level: 3,
    title: "Schema unifilare e sottoquadri",
    minutes: 10,
    goals: ["Leggere uno schema unifilare", "Alimentare un sottoquadro", "Documentare il quadro"],
    sections: [
      {
        title: "Lo schema unifilare",
        body: "Rappresenta ogni circuito con una sola linea, qualunque sia il numero di conduttori: dall'alto la fornitura, poi i dispositivi in cascata, in basso gli utilizzatori.\nAccanto ai simboli si riportano le caratteristiche: poli, curva e In, IΔn, potere di interruzione, sezione e lunghezza delle linee.",
      },
      {
        title: "Sottoquadri",
        body: "In una casa grande conviene un quadro generale vicino al contatore e uno o più sottoquadri. La linea che li collega è una conduttura vera e propria: va protetta a monte e dimensionata per la corrente di tutto il sottoquadro e per la caduta di tensione.\nIl sottoquadro ha in genere un proprio interruttore generale (sezionatore o magnetotermico).",
      },
      {
        title: "La documentazione",
        body: "Schema, targhette sui dispositivi e una relazione con i dati di progetto permettono a chiunque di capire e manutenere l'impianto.",
      },
    ],
    keyPoints: ["Unifilare = una linea per circuito, dall'alto verso il basso.", "La linea al sottoquadro va protetta e dimensionata.", "Etichette e schema fanno parte dell'impianto."],
    quiz: [
      { q: "In uno schema unifilare, un circuito con fase, neutro e PE è disegnato con…", options: ["tre linee", "una linea", "due linee"], correct: 1, why: "Unifilare: una sola linea per circuito." },
      { q: "La linea verso il sottoquadro va dimensionata per…", options: ["il circuito più piccolo", "la corrente complessiva del sottoquadro", "nessuna corrente in particolare"], correct: 1, why: "Porta la corrente di tutti i circuiti a valle." },
      { q: "Dove si trova la fornitura in un unifilare?", options: ["In basso", "In alto", "A destra"], correct: 1, why: "Lo schema si legge dall'alto (fornitura) verso il basso (utilizzatori)." },
    ],
    practice: { demo: 'demo-villetta', hint: "Apri la vista «Schema unifilare» per vedere il quadro generale e il sottoquadro." },
  },

  // ------------------------------------------------------------ circuiti e comandi
  {
    id: 'co-0-utilizzatori',
    track: 'comandi',
    level: 0,
    title: "Utilizzatori e prese",
    minutes: 6,
    goals: ["Riconoscere i tipi di utilizzatori", "Conoscere prese da 10 A e 16 A"],
    sections: [
      {
        title: "Cosa consuma corrente",
        body: "Resistenze (forno, scaldabagno, stufa): trasformano l'energia in calore, corrente in fase con la tensione.\nMotori e compressori (frigorifero, lavatrice, climatizzatore): hanno un cos φ minore di 1 e, all'avvio, uno spunto di corrente.\nApparecchi elettronici (TV, computer, lampade LED): piccole potenze, correnti non perfettamente sinusoidali.",
      },
      {
        title: "Le prese",
        body: "Le prese domestiche più comuni sono da 10 A e da 16 A, in varie forme (italiana, bipasso, Schuko). Gli apparecchi potenti (lavatrice, forno) richiedono prese da 16 A.\nUna presa multipla non aumenta la corrente disponibile: tutto passa dalla stessa presa e dalla stessa linea.",
      },
    ],
    keyPoints: ["Resistenze, motori, elettronica: comportamenti diversi.", "Prese da 10 A e da 16 A.", "Le prese multiple non moltiplicano la corrente."],
    quiz: [
      { q: "Quale apparecchio ha uno spunto di corrente all'avvio?", options: ["Forno a resistenza", "Frigorifero (compressore)", "Lampada a incandescenza spenta"], correct: 1, why: "I motori assorbono una corrente maggiore all'avvio." },
      { q: "Una lavatrice da 2 kW si collega di norma a una presa…", options: ["da 10 A", "da 16 A", "qualsiasi"], correct: 1, why: "Circa 9 A in funzionamento, con margine serve una presa da 16 A." },
      { q: "Una ciabatta con 6 prese collegata a una presa da 16 A può alimentare in totale…", options: ["6 × 16 A", "al massimo quanto la presa e la linea a monte", "senza limiti"], correct: 1, why: "Tutta la corrente passa dalla presa e dalla linea." },
    ],
    practice: { info: ['load-lavatrice', 'load-prese'] },
  },
  {
    id: 'co-1-comandi-luce',
    track: 'comandi',
    level: 1,
    title: "Comandare una luce: interruttore, deviatore, invertitore",
    minutes: 8,
    goals: ["Sapere quale conduttore interrompere", "Comandare una luce da due o più punti"],
    sections: [
      {
        title: "Si interrompe la fase",
        body: "L'interruttore di comando deve interrompere il conduttore di fase: a luce spenta il portalampada resta senza tensione. Se si interrompesse il neutro, il portalampada resterebbe in tensione anche a luce spenta.",
      },
      {
        title: "Due punti: i deviatori",
        body: "Per comandare una luce da due punti (inizio e fine di un corridoio) si usano due deviatori collegati tra loro da due conduttori «navetta».",
      },
      {
        title: "Tre o più punti: gli invertitori",
        body: "Tra i due deviatori si inseriscono uno o più invertitori, uno per ogni punto di comando aggiuntivo.\nCon molti punti diventa più semplice usare pulsanti e un relè passo-passo (lezione successiva).",
      },
      {
        title: "Nel simulatore",
        body: "Interruttore, deviatore e invertitore sono nel catalogo (categoria Comando): si cablano come nella realtà e si azionano cliccando il bilanciere. Il progetto «Comandi luce» ha una luce comandata da tre punti.",
      },
    ],
    keyPoints: ["Il comando interrompe la fase, mai solo il neutro.", "2 punti = 2 deviatori.", "Ogni punto in più = un invertitore."],
    practice: { demo: 'demo-comandi-luce', exercise: 'l6-deviatori', info: ['wall-deviatore', 'wall-invertitore'] },
    quiz: [
      { q: "Perché l'interruttore deve aprire la fase?", options: ["Per risparmiare energia", "Perché a luce spenta il portalampada sia senza tensione", "Perché il neutro è più sottile"], correct: 1, why: "Aprendo il neutro la fase resterebbe presente sul portalampada." },
      { q: "Per comandare una luce da 4 punti servono…", options: ["4 deviatori", "2 deviatori e 2 invertitori", "4 invertitori"], correct: 1, why: "Due deviatori agli estremi più un invertitore per ogni punto aggiuntivo." },
      { q: "Con molti punti di comando conviene…", options: ["usare pulsanti e un relè passo-passo", "non mettere luci", "usare solo deviatori"], correct: 0, why: "I pulsanti si collegano tutti in parallelo: cablaggio molto più semplice." },
    ],
  },
  {
    id: 'co-2-passo-passo',
    track: 'comandi',
    level: 2,
    title: "Pulsanti e relè passo-passo",
    minutes: 9,
    goals: ["Capire il funzionamento bistabile", "Cablare comando e potenza", "Riconoscere gli errori tipici"],
    sections: [
      {
        title: "Come funziona",
        body: "Il relè passo-passo ha una bobina (A1-A2) e un contatto (1-2). Ogni impulso di tensione sulla bobina fa cambiare stato al contatto, che resta nella nuova posizione anche quando l'impulso finisce: per questo si dice bistabile.",
      },
      {
        title: "Due circuiti",
        body: "Circuito di comando: fase → pulsanti in parallelo → A1; A2 al neutro.\nCircuito di potenza: fase protetta → contatto 1-2 → lampade; il neutro delle lampade torna direttamente.\nI pulsanti portano la fase a 230 V: vanno scelti e posati come parti di un circuito a 230 V.",
      },
      {
        title: "Errori tipici",
        body: "Tenere premuto il pulsante non fa lampeggiare la luce: conta il fronte dell'impulso.\nUna bobina alimentata in permanenza per un errore di cablaggio si surriscalda: le bobine sono fatte per impulsi brevi.",
      },
    ],
    keyPoints: ["Ogni impulso = cambio di stato.", "Pulsanti tutti in parallelo sulla bobina.", "Comando e potenza sono due circuiti distinti."],
    quiz: [
      { q: "Come si collegano tre pulsanti che comandano lo stesso relè passo-passo?", options: ["In serie", "In parallelo", "Uno solo alla volta"], correct: 1, why: "Ognuno, chiudendosi, deve poter portare la fase alla bobina." },
      { q: "Tenendo premuto il pulsante per 5 secondi la luce…", options: ["lampeggia", "cambia stato una sola volta", "resta accesa solo finché si preme"], correct: 1, why: "Il relè reagisce al fronte dell'impulso, non alla durata." },
      { q: "Il contatto del relè si trova nel circuito…", options: ["di comando", "di potenza, in serie alla lampada", "di terra"], correct: 1, why: "Il contatto 1-2 porta la fase alla lampada." },
    ],
    practice: { demo: 'demo-luce-scale', info: ['step-relay', 'pushbutton'], hint: "Avvia la simulazione, chiudi Q1 e premi i pulsanti." },
  },

  // ------------------------------------------------------------ trifase
  {
    id: 'tr-0-mono-tri',
    track: 'trifase',
    level: 0,
    title: "Monofase e trifase: che differenza c'è",
    minutes: 6,
    goals: ["Sapere cosa arriva con una fornitura trifase", "Conoscere 230 V e 400 V"],
    sections: [
      {
        title: "Monofase",
        body: "La fornitura monofase porta una fase e il neutro: tra i due ci sono 230 V. È la fornitura della maggior parte delle case.",
      },
      {
        title: "Trifase",
        body: "La fornitura trifase porta tre fasi (L1, L2, L3) e il neutro. Tra ogni fase e il neutro ci sono 230 V; tra due fasi ci sono 400 V.\nPermette potenze maggiori e alimenta direttamente motori e apparecchi trifase; i circuiti monofase della casa si distribuiscono sulle tre fasi.",
      },
    ],
    keyPoints: ["Monofase: L + N, 230 V.", "Trifase: L1, L2, L3 + N; 230 V fase-neutro, 400 V fase-fase."],
    quiz: [
      { q: "Tra due fasi di una fornitura trifase ci sono…", options: ["230 V", "400 V", "460 V"], correct: 1, why: "La tensione concatenata è circa 230 × √3 ≈ 400 V." },
      { q: "Una casa con fornitura trifase può alimentare prese a 230 V?", options: ["No", "Sì, tra una fase e il neutro", "Solo con un trasformatore"], correct: 1, why: "Ogni fase con il neutro dà 230 V." },
      { q: "Quanti conduttori attivi ha una fornitura trifase con neutro?", options: ["2", "3", "4"], correct: 2, why: "Tre fasi più il neutro." },
    ],
    practice: { info: ['supply-tri'] },
  },
  {
    id: 'tr-1-concatenate',
    track: 'trifase',
    level: 1,
    title: "Tensioni concatenate e potenza trifase",
    minutes: 9,
    goals: ["Capire lo sfasamento di 120°", "Calcolare la tensione concatenata", "Calcolare la corrente di un carico trifase"],
    sections: [
      {
        title: "Tre sinusoidi sfasate",
        body: "Le tre tensioni di fase hanno lo stesso valore (230 V) ma sono sfasate di 120° l'una dall'altra. La differenza tra due di esse è una tensione più grande: la concatenata.",
        formula: "U_concatenata = √3 × U_fase ≈ 1,73 × 230 ≈ 400 V",
      },
      {
        title: "Potenza di un carico trifase",
        body: "Per un carico trifase equilibrato la potenza si calcola con la tensione concatenata e la corrente di linea.",
        formula: "P = √3 × U × I × cos φ",
        example: "Carico trifase resistivo da 9 kW a 400 V: I = 9000 / (1,73 × 400) ≈ 13 A per fase. In monofase la stessa potenza richiederebbe circa 39 A.",
      },
    ],
    keyPoints: ["Fasi sfasate di 120°.", "400 V = √3 × 230 V.", "P = √3 × U × I × cos φ."],
    quiz: [
      { q: "Un carico trifase equilibrato da 6 kW (cos φ = 1) assorbe per fase circa…", options: ["8,7 A", "15 A", "26 A"], correct: 0, why: "I = 6000 / (1,73 × 400) ≈ 8,7 A." },
      { q: "Lo sfasamento tra le fasi è…", options: ["90°", "120°", "180°"], correct: 1, why: "Tre fasi equidistanti su 360°." },
      { q: "Perché il trifase conviene per potenze elevate?", options: ["Usa meno fasi", "Distribuisce la potenza su tre conduttori, con correnti minori", "Non ha neutro"], correct: 1, why: "A parità di potenza ogni conduttore porta meno corrente." },
    ],
    practice: { exercise: 'l5-tensioni' },
  },
  {
    id: 'tr-2-neutro',
    track: 'trifase',
    level: 2,
    title: "Squilibri e conduttore di neutro",
    minutes: 10,
    goals: ["Sapere quanta corrente porta il neutro", "Capire il pericolo del neutro interrotto", "Distribuire i carichi sulle fasi"],
    sections: [
      {
        title: "Il neutro in un sistema equilibrato",
        body: "Se le tre fasi assorbono la stessa corrente (carico equilibrato) le tre correnti sfasate si annullano: nel neutro non scorre corrente.\nCon carichi diversi sulle fasi il neutro porta la somma vettoriale delle correnti, che è minore della somma aritmetica.",
      },
      {
        title: "Neutro comune interrotto",
        body: "Se il neutro comune si interrompe, i carichi monofase di fasi diverse si trovano in serie tra loro sotto 400 V. Il centro stella si sposta: la fase meno caricata riceve una tensione molto superiore a 230 V e i suoi apparecchi possono guastarsi, mentre quella più caricata resta sotto tensione.\nPer questo il neutro comune non si interrompe da solo e va serrato con cura.",
      },
      {
        title: "Distribuire le fasi",
        body: "Nei quadri trifase si distribuiscono i circuiti monofase sulle tre fasi cercando di bilanciare le potenze, e si identifica ogni conduttore con la fase effettiva (marrone, nero, grigio).",
      },
    ],
    keyPoints: ["Carico equilibrato = neutro quasi senza corrente.", "Neutro comune interrotto = sovratensioni sulla fase meno caricata.", "Bilancia i carichi sulle fasi."],
    quiz: [
      { q: "Tre carichi uguali su L1, L2, L3. La corrente nel neutro è circa…", options: ["la somma delle tre", "zero", "uguale a una fase"], correct: 1, why: "Le tre correnti sfasate di 120° si annullano." },
      { q: "Con neutro comune interrotto, la fase con carico minore…", options: ["resta a 230 V", "riceve una tensione maggiore di 230 V", "va a 0 V"], correct: 1, why: "Il centro stella si sposta verso le fasi più cariche." },
      { q: "Come si riduce la corrente nel neutro?", options: ["Bilanciando i carichi sulle fasi", "Usando un neutro più sottile", "Togliendo il PE"], correct: 0, why: "Più il carico è equilibrato, minore è la somma vettoriale." },
    ],
    practice: { exercise: 'l5-neutro-comune', demo: 'demo-trifase', hint: "Nel progetto trifase prova il guasto «neutro interrotto» e guarda il diagramma fasoriale." },
  },
  {
    id: 'tr-3-multipolari',
    track: 'trifase',
    level: 3,
    title: "Protezioni multipolari e identificazione delle fasi",
    minutes: 10,
    goals: ["Scegliere tra 3P, 3P+N e 4P", "Proteggere carichi trifase", "Identificare correttamente le fasi"],
    sections: [
      {
        title: "Quanti poli",
        body: "3P: tre fasi protette, senza neutro (carichi trifase senza neutro, come molti motori).\n3P+N: tre fasi protette e neutro sezionato ma non protetto.\n4P: tutti e quattro i poli protetti.\nUn guasto su una sola fase apre tutti i poli dell'interruttore: il carico trifase non resta alimentato su due fasi.",
      },
      {
        title: "Differenziali trifase",
        body: "Il differenziale 4P deve avere dentro il toroide le tre fasi e il neutro (se il neutro è distribuito): altrimenti vede come dispersione la corrente che torna sul neutro.",
      },
      {
        title: "Identificazione",
        body: "Ogni conduttore di fase deve essere identificato con la fase a cui è davvero collegato, lungo tutto il percorso. Un errore porta a squilibri non voluti e a errori pericolosi durante la manutenzione.",
      },
    ],
    keyPoints: ["3P per carichi senza neutro; 3P+N o 4P con neutro distribuito.", "Il differenziale trifase deve includere il neutro se distribuito.", "L1, L2, L3 identificati in modo coerente."],
    quiz: [
      { q: "Un motore trifase senza neutro si protegge con…", options: ["un 1P+N", "un 3P", "un 2P"], correct: 1, why: "Servono tre poli protetti, il neutro non c'è." },
      { q: "Cosa succede se il neutro non passa nel toroide di un differenziale 4P con carichi monofase?", options: ["Niente", "Il differenziale vede la corrente di neutro come dispersione e interviene", "Migliora la selettività"], correct: 1, why: "La somma delle correnti nel toroide non è più zero." },
      { q: "Un conduttore marrone collegato alla fase L2 è…", options: ["corretto per definizione", "un errore di identificazione da correggere", "irrilevante"], correct: 1, why: "L'identificazione deve corrispondere alla fase reale." },
    ],
    practice: { exercise: 'l5-protezioni-multipolari' },
  },

  // ------------------------------------------------------------ misure e ricerca guasti
  {
    id: 'mi-0-strumenti',
    track: 'misure',
    level: 0,
    title: "Gli strumenti dell'elettricista",
    minutes: 6,
    goals: ["Conoscere multimetro e pinza amperometrica", "Scegliere uno strumento adatto"],
    sections: [
      {
        title: "Multimetro",
        body: "Misura tensione (V), resistenza (Ω), continuità e, in alcuni modelli, corrente. I puntali si appoggiano su due punti del circuito.",
      },
      {
        title: "Pinza amperometrica",
        body: "Misura la corrente senza interrompere il circuito: le ganasce si chiudono attorno a un conduttore e rilevano il campo magnetico che la corrente produce.",
      },
      {
        title: "Strumenti adatti",
        body: "Gli strumenti hanno una categoria di misura (CAT II, III, IV) che indica dove possono essere usati in sicurezza: più ci si avvicina all'origine dell'impianto, più alta deve essere la categoria.\nPrima di ogni verifica di assenza di tensione si controlla che lo strumento funzioni su una sorgente nota.",
      },
    ],
    keyPoints: ["Multimetro: V, Ω, continuità.", "Pinza: corrente senza aprire il circuito.", "Usa strumenti con la categoria adatta e verificati."],
    quiz: [
      { q: "Per misurare la corrente senza scollegare cavi si usa…", options: ["il multimetro in Ω", "la pinza amperometrica", "un cacciavite cercafase"], correct: 1, why: "La pinza misura il campo magnetico attorno al conduttore." },
      { q: "Prima di verificare l'assenza di tensione bisogna…", options: ["provare lo strumento su una sorgente nota", "toccare i morsetti", "niente"], correct: 0, why: "Uno strumento guasto indicherebbe 0 V anche in presenza di tensione." },
      { q: "La categoria di misura (CAT) indica…", options: ["il prezzo", "dove lo strumento può essere usato in sicurezza", "la precisione"], correct: 1, why: "Riguarda la tenuta alle sovratensioni nel punto di misura." },
    ],
  },
  {
    id: 'mi-1-multimetro',
    track: 'misure',
    level: 1,
    title: "Misurare tensione, continuità e resistenza",
    minutes: 9,
    goals: ["Misurare la tensione in parallelo", "Misurare resistenza e continuità solo fuori tensione", "Interpretare le letture"],
    sections: [
      {
        title: "Tensione",
        body: "La tensione si misura tra due punti, con lo strumento «in parallelo»: per esempio tra fase e neutro (230 V), tra fase e PE (circa 230 V), tra neutro e PE (pochi volt o meno, in condizioni normali).",
      },
      {
        title: "Resistenza e continuità",
        body: "Si misurano solo a circuito disalimentato: lo strumento inietta una piccola corrente propria. Con tensione presente la lettura è sbagliata e lo strumento può danneggiarsi.\nContinuità: verifica che un conduttore non sia interrotto (es. il PE da una massa alla morsettiera).",
      },
      {
        title: "Nel simulatore",
        body: "Scegli lo strumento «Multimetro», poi clicca due morsetti: puntale rosso e nero. In Ω il simulatore richiede l'impianto disalimentato, come nella realtà.",
      },
    ],
    keyPoints: ["Tensione: in parallelo, con impianto alimentato.", "Ω e continuità: solo con impianto disalimentato.", "N-PE vicino a 0 V in condizioni normali."],
    quiz: [
      { q: "Tra neutro e PE, in condizioni normali, si misura…", options: ["230 V", "pochi volt o meno", "400 V"], correct: 1, why: "Neutro e PE sono a potenziali vicini; una tensione alta indica un problema." },
      { q: "Si può misurare la resistenza di un circuito alimentato?", options: ["Sì", "No: si misura solo a circuito disalimentato", "Solo in trifase"], correct: 1, why: "La tensione presente falsa la misura e può danneggiare lo strumento." },
      { q: "Come si misura la continuità del PE di una lavatrice?", options: ["Con la pinza", "In Ω tra la massa e la morsettiera PE, a impianto disalimentato", "Con il pulsante di prova del differenziale"], correct: 1, why: "La resistenza bassa conferma che il conduttore è integro." },
    ],
    practice: { exercise: 'l1-fase-neutro-terra', hint: "Nel laboratorio usa lo strumento «Multimetro» e clicca due morsetti." },
  },
  {
    id: 'mi-2-pinza',
    track: 'misure',
    level: 2,
    title: "Pinza amperometrica e correnti di dispersione",
    minutes: 8,
    goals: ["Misurare la corrente di un circuito", "Misurare una dispersione abbracciando fase e neutro"],
    sections: [
      {
        title: "Un conduttore alla volta",
        body: "Per leggere la corrente di un circuito la pinza deve abbracciare un solo conduttore (la fase o il neutro). Abbracciando un cavo intero con fase e neutro, le due correnti opposte si annullano e la lettura è circa zero.",
      },
      {
        title: "Il trucco della dispersione",
        body: "Proprio per questo, abbracciando fase e neutro insieme si misura la differenza tra le due correnti, cioè la corrente che si disperde verso terra: la stessa grandezza che vede il differenziale.\nServe una pinza sensibile ai milliampere (pinza per correnti di dispersione).",
      },
    ],
    keyPoints: ["Un solo conduttore = corrente del circuito.", "Fase + neutro insieme = corrente di dispersione.", "Per le dispersioni serve una pinza sensibile ai mA."],
    quiz: [
      { q: "Abbracciando fase e neutro di un circuito sano si legge…", options: ["il doppio della corrente", "circa zero", "la tensione"], correct: 1, why: "Le correnti di andata e ritorno si compensano." },
      { q: "Una lettura di 12 mA abbracciando fase e neutro indica…", options: ["una dispersione verso terra di circa 12 mA", "un sovraccarico", "un cortocircuito"], correct: 0, why: "È la parte di corrente che non torna sul neutro." },
      { q: "Con un differenziale da 30 mA e 12 mA di dispersione…", options: ["interviene sicuramente", "non deve intervenire (sotto 15 mA)", "si rompe"], correct: 1, why: "Sotto 0,5 × IΔn è la zona di non intervento." },
    ],
    practice: { exercise: 'l4-dispersione', hint: "Usa lo strumento «Pinza» su un utilizzatore: puoi scegliere un conduttore o fase e neutro insieme." },
  },
  {
    id: 'mi-3-ricerca-guasti',
    track: 'misure',
    level: 3,
    title: "Metodo per la ricerca guasti",
    minutes: 11,
    goals: ["Ragionare dai sintomi", "Isolare il circuito guasto", "Confermare con le misure"],
    sections: [
      {
        title: "1. Osserva",
        body: "Quale protezione è intervenuta? Magnetotermico per cortocircuito (istantaneo) o per sovraccarico (dopo un po')? Differenziale? Fusibile fuso?\nQuando succede: all'accensione di un apparecchio, sempre, solo quando piove?",
      },
      {
        title: "2. Isola",
        body: "Se interviene un differenziale comune, apri tutti i magnetotermici a valle e richiudili uno alla volta: quello che lo fa intervenire indica il circuito.\nNel circuito, scollega gli apparecchi uno per volta per capire se il guasto è nell'apparecchio o nella linea.",
      },
      {
        title: "3. Misura",
        body: "A impianto disalimentato: continuità dei conduttori, resistenza tra fase e neutro (un cortocircuito dà valori vicini a zero), isolamento verso terra con lo strumento apposito.\nAlimentato e con cautela: tensioni tra L, N e PE, correnti con la pinza.",
      },
      {
        title: "4. Ripara e verifica",
        body: "Elimina la causa, ripristina e verifica che le protezioni restino chiuse e che le tensioni siano corrette. Annota cosa è successo.",
      },
    ],
    keyPoints: ["Osserva quale protezione e quando.", "Isola un circuito alla volta.", "Conferma con le misure, poi ripristina."],
    quiz: [
      { q: "Il magnetotermico delle prese scatta istantaneamente appena lo richiudi. È probabile…", options: ["un sovraccarico", "un cortocircuito", "una dispersione"], correct: 1, why: "L'intervento istantaneo è tipico dello sganciatore magnetico." },
      { q: "Il differenziale generale interviene. Come trovi il circuito guasto?", options: ["Cambi il differenziale", "Apri tutti i magnetotermici e li richiudi uno alla volta", "Aspetti"], correct: 1, why: "Il circuito che fa intervenire il differenziale alla richiusura è quello guasto." },
      { q: "Tra fase e neutro a monte di un apparecchio, a impianto disalimentato e apparecchio scollegato, misuri 0,3 Ω. Indica…", options: ["linea sana", "un cortocircuito nella linea", "neutro interrotto"], correct: 1, why: "Senza carico collegato la linea dovrebbe essere aperta (resistenza molto alta)." },
    ],
    practice: { exercise: 'l6-verifiche', hint: "Usa il Verificatore (barra in alto): isolamento, anello di guasto e prova del differenziale. Gli esercizi del livello «Ricerca guasti» hanno guasti nascosti da trovare con questo metodo." },
  },
];
