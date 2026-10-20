import type { Lesson } from './types';

/** Percorsi: protezioni e cavi. */
export const PROTECTION_LESSONS: Lesson[] = [
  // ------------------------------------------------------------ protezioni
  {
    id: 'pr-0-perche',
    track: 'protezioni',
    level: 0,
    title: "A cosa serve una protezione",
    minutes: 6,
    goals: ["Capire che la corrente eccessiva scalda i cavi", "Distinguere sovraccarico e cortocircuito", "Sapere chi protegge cosa"],
    sections: [
      {
        title: "Troppa corrente = troppo calore",
        body: "Ogni cavo sopporta una certa corrente senza scaldarsi troppo. Se la corrente supera quel valore l'isolante si degrada e, nei casi peggiori, può prendere fuoco.\nLe protezioni contro le sovracorrenti servono innanzitutto a proteggere le condutture.",
      },
      {
        title: "Sovraccarico",
        body: "Un circuito sano assorbe più corrente del previsto perché ci sono troppi apparecchi accesi: per esempio stufa e phon sulla stessa linea delle prese.\nLa corrente è di poco superiore al normale (1,5–3 volte): il cavo si scalda lentamente, quindi la protezione può intervenire con calma, in secondi o minuti.",
      },
      {
        title: "Cortocircuito",
        body: "Fase e neutro (o due fasi) si toccano senza nulla in mezzo: la corrente è limitata solo dalla resistenza dei cavi e della rete e diventa enorme, centinaia o migliaia di ampere.\nIn questo caso bisogna interrompere in pochi millisecondi.",
      },
      {
        title: "Chi protegge cosa",
        body: "Magnetotermici e fusibili proteggono dalle sovracorrenti (sovraccarico e cortocircuito).\nIl differenziale protegge dalle dispersioni verso terra, cioè le persone: sono due funzioni diverse e servono entrambe.",
      },
    ],
    keyPoints: ["Sovraccarico = poco di più, per tanto tempo.", "Cortocircuito = moltissimo, subito.", "Le protezioni da sovracorrente proteggono soprattutto i cavi."],
    quiz: [
      { q: "Phon, stufetta e ferro da stiro sulla stessa presa multipla. È…", options: ["un cortocircuito", "un sovraccarico", "una dispersione"], correct: 1, why: "Il circuito è sano ma assorbe più del previsto." },
      { q: "In un cortocircuito la corrente è limitata…", options: ["dalla potenza degli apparecchi", "solo dalle resistenze di cavi e rete", "dal differenziale"], correct: 1, why: "Non c'è un carico in mezzo: restano solo le impedenze del percorso." },
      { q: "Quale dispositivo protegge le persone dalle dispersioni verso terra?", options: ["Il magnetotermico", "Il differenziale", "Il fusibile"], correct: 1, why: "Il differenziale misura la corrente che non torna sul neutro." },
    ],
  },
  {
    id: 'pr-1-magnetotermico',
    track: 'protezioni',
    level: 1,
    title: "Il magnetotermico",
    minutes: 10,
    goals: ["Conoscere i due sganciatori", "Leggere targa e curva (B, C, D)", "Sapere quando interviene"],
    sections: [
      {
        title: "Due sganciatori in un solo dispositivo",
        body: "Lo sganciatore termico è una lamina bimetallica che si piega quando si scalda: interviene sui sovraccarichi, tanto più velocemente quanto maggiore è la corrente.\nLo sganciatore magnetico è una bobina che attira un'ancoretta quando la corrente supera una soglia: interviene in pochi millisecondi sui cortocircuiti.",
      },
      {
        title: "La targa",
        body: "C16 significa curva C e corrente nominale In = 16 A. Il valore in kA (es. 4,5 kA o 6 kA) è il potere di interruzione Icn: la massima corrente di cortocircuito che il dispositivo sa interrompere.",
      },
      {
        title: "I punti convenzionali (CEI EN 60898-1)",
        body: "A 1,13 × In il dispositivo non deve intervenire entro un'ora; a 1,45 × In deve intervenire entro un'ora (partendo dalla condizione indicata dalla norma).\nPer questo un leggero sovraccarico (es. 18 A su un C16) può non far scattare nulla per molti minuti: è normale.",
        formula: "Non intervento: 1,13 × In      Intervento entro 1 h: 1,45 × In",
      },
      {
        title: "Le curve B, C, D",
        body: "Indicano dove interviene il magnetico: B tra 3 e 5 × In, C tra 5 e 10 × In, D tra 10 e 20 × In. Sotto la soglia inferiore il magnetico non interviene; sopra quella superiore interviene sicuramente; in mezzo dipende dall'esemplare.\nC è la curva tipica degli impianti domestici; D si usa per carichi con forti correnti di spunto.",
      },
    ],
    keyPoints: ["Termico = sovraccarico (lento), magnetico = cortocircuito (rapido).", "C16: curva C, In 16 A.", "Magnetico certo oltre 5 (B), 10 (C), 20 (D) volte In."],
    quiz: [
      { q: "Su un C10 il magnetico interviene sicuramente sopra…", options: ["50 A", "100 A", "200 A"], correct: 1, why: "Curva C: soglia superiore 10 × In = 100 A." },
      { q: "Un C16 attraversato da 18 A…", options: ["interviene subito", "potrebbe non intervenire per molto tempo", "non interverrà mai"], correct: 1, why: "18 A sono 1,125 × In: siamo vicini alla soglia di non intervento." },
      { q: "Cosa indica «6 kA» sulla targa?", options: ["La corrente nominale", "Il potere di interruzione Icn", "La sensibilità differenziale"], correct: 1, why: "È la corrente di cortocircuito massima che il dispositivo è in grado di interrompere." },
    ],
    practice: { exercise: 'l1-magnetotermico', info: ['mcb-1pn'], hint: "Seleziona un magnetotermico: la curva di intervento mostra il punto di lavoro in tempo reale." },
  },
  {
    id: 'pr-2-fusibili-icn',
    track: 'protezioni',
    level: 2,
    title: "Fusibili, Icc e potere di interruzione",
    minutes: 11,
    goals: ["Confrontare fusibile e magnetotermico", "Capire la corrente di cortocircuito presunta", "Scegliere il potere di interruzione"],
    sections: [
      {
        title: "Il fusibile",
        body: "Un filo calibrato dentro una cartuccia fonde quando la corrente è eccessiva. Le cartucce gG (uso generale) proteggono da sovraccarico e cortocircuito.\nNon si riarma: va sostituito con una cartuccia identica, a portafusibili aperto, dopo aver eliminato la causa.\nPer le gG da 16 A in su la corrente convenzionale di fusione è 1,6 × In (contro 1,45 × In del magnetotermico).",
      },
      {
        title: "La corrente di cortocircuito presunta Icc",
        body: "È la corrente che scorrerebbe con un cortocircuito franco in un certo punto. È massima vicino al contatore e diminuisce allontanandosi, perché si aggiunge la resistenza dei cavi.",
        formula: "Icc ≈ U0 / Z_anello (rete + conduttori fino al punto di guasto)",
        example: "Con 0,25 Ω di rete (fase + neutro) Icc ≈ 230 / 0,25 ≈ 920 A ai morsetti del contatore; con 20 m di 2,5 mm² in più (≈ 0,34 Ω) scende a circa 230 / 0,59 ≈ 390 A.",
      },
      {
        title: "Il potere di interruzione",
        body: "Il dispositivo deve saper interrompere la Icc del punto in cui è installato: Icn ≥ Icc. Se non basta, è ammesso solo se a monte c'è un dispositivo che lo protegge (protezione di back-up) secondo le tabelle del costruttore.\nIl distributore dichiara la Icc al punto di consegna: è un dato da chiedere, non da indovinare.",
      },
    ],
    keyPoints: ["Il fusibile si sostituisce, non si riarma.", "La Icc diminuisce allontanandosi dal contatore.", "Icn del dispositivo ≥ Icc del punto di installazione."],
    quiz: [
      { q: "Dopo la fusione di una cartuccia gG da 16 A si deve…", options: ["mettere una cartuccia da 25 A così non salta più", "eliminare la causa e sostituirla con una identica a portafusibili aperto", "riarmare la leva"], correct: 1, why: "Una cartuccia più grande lascerebbe il cavo senza protezione." },
      { q: "Dove la corrente di cortocircuito presunta è maggiore?", options: ["In fondo alla linea più lunga", "Vicino al contatore", "È uguale ovunque"], correct: 1, why: "Ogni metro di cavo aggiunge resistenza e riduce la Icc." },
      { q: "Icc nel punto = 5 kA. Quale magnetotermico va bene senza back-up?", options: ["Icn 4,5 kA", "Icn 6 kA", "Icn 3 kA"], correct: 1, why: "Serve Icn ≥ Icc: 6 kA ≥ 5 kA." },
    ],
    practice: { info: ['fuse-1pn'], exercise: 'l4-cortocircuito', hint: "Guarda la «Icc presunta» nelle proprietà di ogni dispositivo e confrontala con il suo potere di interruzione." },
  },
  {
    id: 'pr-3-selettivita',
    track: 'protezioni',
    level: 3,
    title: "Selettività e cortocircuito a fondo linea",
    minutes: 12,
    goals: ["Capire cosa vuol dire selettività", "Verificare il cortocircuito minimo a fondo linea", "Usare I²t ≤ K²S²"],
    sections: [
      {
        title: "Selettività",
        body: "Un impianto è selettivo quando per un guasto interviene solo la protezione più vicina al guasto: si spegne un circuito, non tutta la casa.\nTra due magnetotermici in serie, con un cortocircuito forte possono intervenire entrambi (i magnetici sono tutti rapidi): la selettività reale si ricava dalle tabelle dei costruttori.\nTra differenziali si ottiene con un dispositivo selettivo (tipo S, ritardato) a monte e con sensibilità diverse.",
      },
      {
        title: "Il cortocircuito a fondo linea",
        body: "Il caso critico non è sempre il guasto vicino al quadro: a fondo linea la corrente è minima e il magnetico potrebbe non intervenire. In quel caso il cavo resterebbe sollecitato per secondi, solo con il termico.\nPer questo si verifica che la corrente a fondo linea superi la soglia magnetica certa della protezione (es. 10 × In per la curva C).",
        example: "Linea da 50 m in 1,5 mm² protetta da C16: se a fondo linea la Icc è circa 140 A siamo sotto 160 A (10 × 16): magnetico non garantito. Soluzioni: sezione maggiore, linea più corta o curva B.",
      },
      {
        title: "L'energia specifica",
        body: "Durante un cortocircuito il cavo si scalda senza fare in tempo a cedere calore: sopporta un'energia specifica K²S², dove K dipende da conduttore e isolante (rame/PVC 115, rame/EPR 143) e S è la sezione in mm².\nL'energia lasciata passare dalla protezione (I²t) deve restare sotto questo valore.",
        formula: "I² × t ≤ K² × S²",
        example: "Rame/PVC 2,5 mm²: K²S² = 115² × 2,5² ≈ 82 656 A²s. Con 400 A per 0,01 s: I²t = 1600 A²s, ampiamente sotto. Per interventi più rapidi di 0,1 s si usa l'I²t dichiarato dal costruttore.",
      },
    ],
    keyPoints: ["Selettività = interviene solo la protezione più vicina al guasto.", "Verifica sempre il cortocircuito minimo a fondo linea.", "I²t ≤ K²S² per proteggere il cavo durante il cortocircuito."],
    quiz: [
      { q: "Con un guasto su una linea luci si spegne tutta la casa. L'impianto è…", options: ["selettivo", "non selettivo", "sovradimensionato"], correct: 1, why: "È intervenuta una protezione a monte invece di quella della linea." },
      { q: "Perché il cortocircuito a fondo linea è critico?", options: ["Perché la corrente è massima", "Perché la corrente è minima e il magnetico può non intervenire", "Perché il cavo è più spesso"], correct: 1, why: "Più lontano = più resistenza = corrente più bassa." },
      { q: "Rame/PVC, 1,5 mm²: K²S² vale circa…", options: ["29 756 A²s", "172 A²s", "115 A²s"], correct: 0, why: "115² × 1,5² = 13 225 × 2,25 ≈ 29 756 A²s." },
    ],
    practice: { exercise: 'l3-dimensionamento', hint: "Nelle proprietà di un utilizzatore trovi le «correnti di guasto presunte» a fondo linea e il confronto con la protezione." },
  },

  // ------------------------------------------------------------ cavi e condutture
  {
    id: 'ca-0-colori',
    track: 'cavi',
    level: 0,
    title: "Conduttori, colori e sezioni",
    minutes: 6,
    goals: ["Riconoscere i conduttori dai colori", "Sapere cos'è la sezione di un cavo"],
    sections: [
      {
        title: "I colori",
        body: "I colori dei conduttori servono a riconoscerne la funzione (CEI EN 60445):\nblu chiaro = neutro;\ngiallo-verde = conduttore di protezione PE, e solo quello;\nmarrone, nero, grigio = fasi (in trifase di solito L1, L2, L3 in quest'ordine).\nUsare il giallo-verde per altro, o il blu per una fase, induce in errore chi lavorerà sull'impianto.",
      },
      {
        title: "La sezione",
        body: "È l'area del rame del conduttore, in mm². Valori comuni: 1,5 – 2,5 – 4 – 6 – 10 – 16 mm².\nPiù è grande la sezione, più corrente il cavo può portare e minore è la sua resistenza.",
      },
      {
        title: "Abitudini di cantiere",
        body: "Nelle case si usa spesso 1,5 mm² per le luci e 2,5 mm² per le prese, ma è una consuetudine, non una regola: la sezione giusta si sceglie con i calcoli (portata e caduta di tensione) che vedrai nei livelli successivi.",
      },
    ],
    keyPoints: ["Blu = neutro, giallo-verde = PE, marrone/nero/grigio = fasi.", "La sezione si misura in mm².", "Sezione maggiore = più portata e meno resistenza."],
    quiz: [
      { q: "Di che colore è il conduttore di neutro?", options: ["Marrone", "Blu chiaro", "Giallo-verde"], correct: 1, why: "Il blu chiaro è riservato al neutro." },
      { q: "Si può usare un cavo giallo-verde come fase se è l'unico disponibile?", options: ["Sì, in emergenza", "No, il giallo-verde è solo per il PE", "Sì, se si mette del nastro"], correct: 1, why: "La combinazione giallo-verde identifica esclusivamente il conduttore di protezione." },
      { q: "A parità di lunghezza, quale cavo ha resistenza minore?", options: ["1,5 mm²", "2,5 mm²", "Uguale"], correct: 1, why: "La resistenza è inversamente proporzionale alla sezione." },
    ],
    practice: { exercise: 'l4-cablaggio-errato', hint: "La scheda «Cablaggio» segnala i colori non conformi." },
  },
  {
    id: 'ca-1-portata',
    track: 'cavi',
    level: 1,
    title: "Portata e posa dei cavi",
    minutes: 9,
    goals: ["Sapere cos'è la portata Iz", "Capire perché la posa cambia la portata", "Conoscere la sezione minima"],
    sections: [
      {
        title: "La portata Iz",
        body: "È la corrente che un cavo può portare in modo continuativo senza superare la temperatura massima del suo isolante (70 °C per il PVC, 90 °C per l'EPR).\nNon dipende solo dalla sezione: conta come il calore riesce a uscire.",
      },
      {
        title: "Posa, temperatura e raggruppamento",
        body: "Un cavo in un tubo incassato smaltisce meno calore di uno in aria libera; più circuiti nello stesso tubo si scaldano a vicenda; un ambiente caldo riduce il margine.\nPer questo la portata si ricava dalle tabelle (metodo di posa, isolante) e si corregge con fattori per temperatura (k1) e raggruppamento (k2).",
        formula: "Iz = I0 × k1 × k2",
      },
      {
        title: "La sezione minima",
        body: "Per i circuiti di potenza in rame degli impianti fissi la sezione minima è 1,5 mm² (sezioni più piccole sono ammesse per segnalazione e comando).\nUna sezione minima non garantisce la portata necessaria: è un limite inferiore, non un dimensionamento.",
      },
    ],
    keyPoints: ["Iz dipende da sezione, isolante e posa.", "Più circuiti nello stesso tubo = meno portata ciascuno.", "Minimo 1,5 mm² per i circuiti di potenza in rame."],
    quiz: [
      { q: "Tre circuiti nello stesso tubo rispetto a uno solo…", options: ["hanno la stessa portata", "hanno portata ridotta (fattore di raggruppamento)", "hanno portata maggiore"], correct: 1, why: "I cavi vicini si scaldano a vicenda: si applica k2 < 1." },
      { q: "Un cavo in EPR rispetto al PVC, a parità di sezione e posa, ha in genere…", options: ["portata maggiore", "portata minore", "la stessa portata"], correct: 0, why: "L'EPR sopporta 90 °C invece di 70 °C." },
      { q: "La sezione minima per un circuito prese in rame è…", options: ["0,75 mm²", "1,5 mm²", "4 mm²"], correct: 1, why: "1,5 mm² è il minimo per i circuiti di potenza; poi va verificata la portata." },
    ],
    practice: { hint: "Seleziona un utilizzatore e compila i «Dati di posa»: il simulatore calcola Iz con k1 e k2." },
  },
  {
    id: 'ca-2-coordinamento',
    track: 'cavi',
    level: 2,
    title: "Coordinamento cavo-protezione: IB ≤ In ≤ Iz",
    minutes: 11,
    goals: ["Calcolare la corrente d'impiego IB", "Scegliere In tra IB e Iz", "Applicare If ≤ 1,45 × Iz"],
    sections: [
      {
        title: "Le tre correnti",
        body: "IB è la corrente d'impiego del circuito (dalla potenza degli utilizzatori). In è la corrente nominale della protezione. Iz è la portata del cavo.\nLa protezione deve lasciar passare la corrente normale (IB ≤ In) e proteggere il cavo (In ≤ Iz).",
        formula: "IB ≤ In ≤ Iz",
      },
      {
        title: "La seconda condizione",
        body: "If è la corrente che assicura l'intervento della protezione entro il tempo convenzionale. Deve essere al massimo 1,45 volte la portata del cavo.\nPer un magnetotermico If = 1,45 × In, quindi la condizione coincide con In ≤ Iz. Per un fusibile gG da 16 A in su If = 1,6 × In: serve In ≤ 0,9 × Iz circa.",
        formula: "If ≤ 1,45 × Iz",
      },
      {
        title: "Esempio completo",
        body: "Circuito prese da 3 kW, cos φ = 1, cavo 2,5 mm² posato in tubo con portata corretta Iz = 21 A.",
        example: "IB = 3000 / 230 ≈ 13 A. Scelgo In = 16 A: 13 ≤ 16 ≤ 21 ✓. Con un magnetotermico If = 1,45 × 16 = 23,2 A ≤ 1,45 × 21 = 30,5 A ✓. Con un fusibile gG 20 A invece: If = 32 A > 30,5 A ✗.",
      },
    ],
    keyPoints: ["IB ≤ In ≤ Iz.", "Magnetotermico: basta In ≤ Iz; fusibile gG: In ≤ 0,9 × Iz circa.", "IB si calcola con il cos φ dei carichi."],
    quiz: [
      { q: "IB = 14 A, Iz = 15,6 A. Quale magnetotermico soddisfa IB ≤ In ≤ Iz?", options: ["C10", "C16", "Nessuno dei due"], correct: 2, why: "10 < 14 (non regge il carico) e 16 > 15,6 (non protegge il cavo): serve un cavo con portata maggiore." },
      { q: "Perché con i fusibili la condizione è più severa?", options: ["Perché fondono più lentamente in sovraccarico (If = 1,6 × In)", "Perché sono più costosi", "Perché non proteggono dal cortocircuito"], correct: 0, why: "If più alto obbliga a scegliere In più piccolo rispetto a Iz." },
      { q: "Un forno da 2300 W (cos φ = 1) ha IB =", options: ["10 A", "23 A", "2,3 A"], correct: 0, why: "IB = 2300 / 230 = 10 A." },
    ],
    practice: { exercise: 'l3-dimensionamento', hint: "La verifica OL-433 nella scheda Norma mostra il calcolo completo per ogni circuito." },
  },
  {
    id: 'ca-3-caduta',
    track: 'cavi',
    level: 3,
    title: "Caduta di tensione e contemporaneità",
    minutes: 12,
    goals: ["Calcolare la caduta di tensione di una linea", "Capire l'effetto delle linee di distribuzione lunghe", "Usare il fattore di contemporaneità"],
    sections: [
      {
        title: "La formula",
        body: "La caduta tra il quadro e l'utilizzatore dipende da corrente, lunghezza e sezione. In monofase, per carichi resistivi:",
        formula: "ΔV ≈ 2 × L × I × ρ / S        ΔV% = ΔV / 230 × 100",
        example: "Linea prese 25 m, 2,5 mm², 13 A: ΔV ≈ 2 × 25 × 13 × 0,0214 / 2,5 ≈ 5,6 V → 2,4%.",
      },
      {
        title: "La caduta si somma lungo il percorso",
        body: "La caduta all'utilizzatore comprende tutti i tratti dalla fornitura: linea al quadro, eventuale linea verso un sottoquadro e linea terminale.\nUna linea di distribuzione lunga e sottile pesa su tutti i circuiti a valle, perché porta la corrente di tutti.",
        example: "71 m in 6 mm² con 20 A: ΔV ≈ 2 × 71 × 20 × 0,0214 / 6 ≈ 10 V → 4,4% prima ancora delle linee terminali. In 16 mm²: circa 1,7%.",
      },
      {
        title: "La contemporaneità",
        body: "Non tutti gli apparecchi sono accesi insieme alla massima potenza. Il fattore di contemporaneità è un'ipotesi di progetto: la parte di potenza degli altri utilizzatori da considerare accesa insieme al circuito che verifichi.\nLa raccomandazione è contenere la caduta entro il 4% tra origine e utilizzatore.",
      },
    ],
    keyPoints: ["ΔV ≈ 2 × L × I × ρ / S in monofase.", "Le linee di distribuzione lunghe pesano su tutto il quadro a valle.", "La contemporaneità è una scelta di progetto da dichiarare."],
    quiz: [
      { q: "Raddoppiando la lunghezza di una linea, la caduta di tensione…", options: ["raddoppia", "si dimezza", "resta uguale"], correct: 0, why: "ΔV è proporzionale alla lunghezza." },
      { q: "Una linea al sottoquadro ha una caduta del 4%. Le linee terminali…", options: ["partono da 0%", "aggiungono la loro caduta a quel 4%", "non hanno caduta"], correct: 1, why: "Le cadute si sommano lungo il percorso dalla fornitura." },
      { q: "Quale intervento riduce di più la caduta su una linea lunga e carica?", options: ["Cambiare il colore del cavo", "Aumentare la sezione", "Usare un differenziale selettivo"], correct: 1, why: "ΔV è inversamente proporzionale alla sezione." },
    ],
    practice: { hint: "Nella scheda Norma imposta il fattore di contemporaneità e scegli gli utilizzatori accesi insieme; attiva «Lunghezze» per vedere sezioni e lunghezze." },
  },
];
