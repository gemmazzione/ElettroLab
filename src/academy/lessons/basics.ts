import type { Lesson } from './types';

/** Percorsi: elettricità di base e sicurezza elettrica. */
export const BASICS_LESSONS: Lesson[] = [
  // ------------------------------------------------------------ elettricità di base
  {
    id: 'el-0-circuito',
    track: 'elettricita',
    level: 0,
    title: "Cos'è un circuito elettrico",
    minutes: 6,
    goals: ["Capire che la corrente scorre solo in un percorso chiuso", "Distinguere conduttori e isolanti", "Usare l'analogia dell'acqua per tensione e corrente"],
    sections: [
      {
        title: "Un percorso chiuso",
        body:
          "La corrente elettrica è un movimento ordinato di cariche (nei metalli, elettroni) lungo un materiale conduttore.\nPerché scorra serve un percorso chiuso: dal generatore (la rete, una pila) attraverso un conduttore fino all'utilizzatore e poi di nuovo indietro al generatore.\nSe il percorso si interrompe in un punto qualsiasi (un interruttore aperto, un filo staccato) la corrente si ferma ovunque nel circuito.",
      },
      {
        title: "L'analogia dell'acqua",
        body:
          "Immagina un impianto idraulico: la pompa crea una differenza di pressione, l'acqua scorre nei tubi, un tubo stretto rallenta il flusso.\nNell'impianto elettrico la tensione (volt, V) è la «pressione», la corrente (ampere, A) è la «portata» e la resistenza (ohm, Ω) è la «strettoia».\nL'analogia aiuta a ragionare, ma ha dei limiti: la corrente non «esce» da un filo aperto come l'acqua da un tubo rotto.",
      },
      {
        title: "Conduttori e isolanti",
        body:
          "I metalli come rame e alluminio sono buoni conduttori: lasciano passare la corrente con poca resistenza. Per questo i cavi hanno un'anima di rame.\nPlastiche, gomma, vetro e aria secca sono isolanti: servono a impedire che la corrente vada dove non deve, per esempio verso le persone.\nIl corpo umano conduce: per questo le parti in tensione devono essere sempre isolate o racchiuse.",
      },
      {
        title: "Gli elementi di un impianto",
        body:
          "In una casa il generatore è la rete del distributore, che arriva al contatore. Da lì partono i conduttori di fase (L) e di neutro (N), che portano la corrente agli utilizzatori e la riportano indietro.\nIl conduttore di protezione (PE, giallo-verde) non porta corrente in condizioni normali: collega le parti metalliche degli apparecchi all'impianto di terra.",
      },
    ],
    keyPoints: [
      "Senza un percorso chiuso non c'è corrente.",
      "Tensione = spinta (V), corrente = flusso (A), resistenza = ostacolo (Ω).",
      "Fase e neutro portano la corrente; il PE serve alla sicurezza.",
    ],
    quiz: [
      {
        q: "Una lampada è collegata alla rete ma un filo è staccato. Cosa succede?",
        options: ["La lampada si accende più debole", "La lampada resta spenta: il circuito è aperto", "La corrente esce dal filo staccato"],
        correct: 1,
        why: "Il percorso è interrotto: la corrente non può scorrere in nessun punto del circuito.",
      },
      {
        q: "Nell'analogia dell'acqua, la tensione corrisponde a…",
        options: ["la portata d'acqua", "la pressione della pompa", "il diametro del tubo"],
        correct: 1,
        why: "La tensione è la «spinta» che fa muovere le cariche, come la pressione fa muovere l'acqua.",
      },
      {
        q: "A cosa serve il conduttore giallo-verde?",
        options: ["A portare la corrente di ritorno", "A collegare le masse metalliche all'impianto di terra", "A comandare le luci"],
        correct: 1,
        why: "È il conduttore di protezione (PE): in condizioni normali non porta corrente.",
      },
    ],
    practice: { exercise: 'l1-fase-neutro-terra', info: ['supply-mono', 'earth'] },
  },
  {
    id: 'el-1-ohm-potenza',
    track: 'elettricita',
    level: 1,
    title: "Legge di Ohm, potenza ed energia",
    minutes: 9,
    goals: ["Calcolare corrente, tensione e resistenza con la legge di Ohm", "Ricavare la corrente assorbita da un apparecchio dalla sua potenza", "Distinguere potenza (W) ed energia (kWh)"],
    sections: [
      {
        title: "La legge di Ohm",
        body: "In un conduttore la corrente è proporzionale alla tensione applicata e inversamente proporzionale alla resistenza.\nRaddoppiando la tensione la corrente raddoppia; raddoppiando la resistenza la corrente si dimezza.",
        formula: "V = R × I      I = V / R      R = V / I",
        example: "Una resistenza da 23 Ω alimentata a 230 V: I = 230 / 23 = 10 A.",
      },
      {
        title: "La potenza",
        body: "La potenza è l'energia trasformata ogni secondo (in luce, calore, movimento). Si misura in watt (W) o kilowatt (kW).\nPer un carico resistivo (stufa, forno, scaldabagno) la potenza è il prodotto di tensione e corrente.",
        formula: "P = V × I      I = P / V      P = R × I²      P = V² / R",
        example: "Un forno da 2300 W a 230 V assorbe I = 2300 / 230 = 10 A. La sua resistenza vale R = 230² / 2300 = 23 Ω.",
      },
      {
        title: "L'energia",
        body: "L'energia è la potenza mantenuta nel tempo. In bolletta si paga in kilowattora (kWh): 1 kWh è l'energia di un apparecchio da 1 kW acceso per un'ora.\nLa potenza impegnata del contratto (es. 3 kW) è invece un limite istantaneo: se la superi a lungo il limitatore del contatore interrompe la fornitura.",
        formula: "E [kWh] = P [kW] × t [h]",
        example: "Un forno da 2 kW acceso per 1,5 ore consuma 2 × 1,5 = 3 kWh.",
      },
      {
        title: "Perché la corrente conta più della potenza",
        body: "Cavi e protezioni si scelgono in base alla corrente: è la corrente che scalda i conduttori (P = R × I²).\nDue apparecchi da 2 kW sulla stessa linea a 230 V fanno circa 17 A: un magnetotermico da 16 A, prima o poi, interviene.",
      },
    ],
    keyPoints: ["V = R × I e P = V × I (carichi resistivi).", "A 230 V ogni kilowatt sono circa 4,35 A.", "Potenza (kW) e energia (kWh) sono grandezze diverse."],
    quiz: [
      { q: "Uno scaldabagno da 1200 W a 230 V assorbe circa…", options: ["0,19 A", "5,2 A", "52 A"], correct: 1, why: "I = P / V = 1200 / 230 ≈ 5,2 A." },
      { q: "Raddoppiando la corrente in un conduttore, il calore prodotto…", options: ["raddoppia", "quadruplica", "resta uguale"], correct: 1, why: "La potenza dissipata è R × I²: con il doppio della corrente il calore è quattro volte maggiore." },
      { q: "Una lavatrice da 2 kW lavora 2 ore. Quanta energia consuma?", options: ["1 kWh", "2 kW", "4 kWh"], correct: 2, why: "E = 2 kW × 2 h = 4 kWh. I kW sono una potenza, non un'energia." },
    ],
    practice: { exercise: 'l1-corrente-potenza', hint: "Nel laboratorio seleziona un utilizzatore: vedi tensione, corrente e potenza calcolate con queste stesse formule." },
  },
  {
    id: 'el-2-alternata',
    track: 'elettricita',
    level: 2,
    title: "Corrente alternata e fattore di potenza",
    minutes: 10,
    goals: ["Sapere cosa significano 230 V e 50 Hz", "Capire il fattore di potenza cos φ", "Calcolare la corrente di un carico con motore"],
    sections: [
      {
        title: "Tensione alternata a 50 Hz",
        body: "La rete distribuisce una tensione sinusoidale che cambia verso 50 volte al secondo (50 Hz).\nI «230 V» sono il valore efficace: quello che produce lo stesso riscaldamento di una tensione continua di 230 V. Il valore di picco è circa 230 × √2 ≈ 325 V.",
        formula: "V_picco = √2 × V_efficace",
      },
      {
        title: "Carichi resistivi e ohmico-induttivi",
        body: "In un carico resistivo (forno, lampada a incandescenza) corrente e tensione sono in fase.\nNei carichi con motori o trasformatori (frigorifero, climatizzatore, lavatrice) la corrente è sfasata in ritardo: una parte serve a creare i campi magnetici e non produce lavoro utile.\nLo sfasamento si misura con il fattore di potenza cos φ (1 = nessuno sfasamento).",
      },
      {
        title: "Potenza attiva, reattiva e apparente",
        body: "La potenza attiva P (W) è quella che produce lavoro e che si paga. La potenza apparente S (VA) è il prodotto V × I e determina la corrente che scorre nei cavi.\nLa potenza reattiva Q (var) è la parte «di andata e ritorno» legata ai campi magnetici.",
        formula: "P = V × I × cos φ      S = V × I      Q = √(S² − P²)",
        example: "Frigorifero da 150 W con cos φ = 0,7: I = 150 / (230 × 0,7) ≈ 0,93 A. Con cos φ = 1 sarebbero solo 0,65 A.",
      },
      {
        title: "Perché interessa all'impiantista",
        body: "A parità di potenza attiva, un cos φ basso aumenta la corrente: cavi e protezioni vanno scelti sulla corrente vera.\nNel simulatore ogni utilizzatore ha il suo cos φ: la corrente d'impiego IB delle verifiche lo tiene in conto.",
      },
    ],
    keyPoints: ["230 V è il valore efficace; il picco è circa 325 V.", "Con un motore la corrente è maggiore di P / V.", "I = P / (V × cos φ)."],
    quiz: [
      { q: "Il valore di picco di una tensione efficace di 230 V è circa…", options: ["163 V", "230 V", "325 V"], correct: 2, why: "Per una sinusoide V_picco = √2 × V_eff ≈ 1,41 × 230 ≈ 325 V." },
      { q: "Un climatizzatore da 1000 W ha cos φ = 0,95. Quale corrente assorbe a 230 V?", options: ["4,1 A", "4,6 A", "4,35 A"], correct: 1, why: "I = 1000 / (230 × 0,95) ≈ 4,6 A, un po' più di 1000 / 230 = 4,35 A." },
      { q: "Quale potenza determina la corrente nei cavi?", options: ["Solo la potenza attiva P", "La potenza apparente S = V × I", "La potenza reattiva Q"], correct: 1, why: "La corrente è S / V: comprende anche la parte reattiva." },
    ],
    practice: { info: ['load-frigo', 'load-clima'], hint: "Aggiungi un frigorifero e confronta la corrente con quella di un carico resistivo della stessa potenza." },
  },
  {
    id: 'el-3-linea-reale',
    track: 'elettricita',
    level: 3,
    title: "Il circuito reale: resistenza dei conduttori e potenza effettiva",
    minutes: 10,
    goals: ["Calcolare la resistenza di una linea", "Capire perché la potenza reale è minore di quella di targa", "Leggere i valori del simulatore"],
    sections: [
      {
        title: "Anche i cavi hanno una resistenza",
        body: "Un conduttore di rame ha una resistenza proporzionale alla lunghezza e inversamente proporzionale alla sezione.\nIn monofase la corrente percorre la fase all'andata e il neutro al ritorno: la lunghezza da considerare è il doppio di quella della linea.",
        formula: "R = ρ × L / S        (ρ rame: il simulatore usa 0,0214 Ω·mm²/m)",
        example: "Linea da 20 m in 2,5 mm²: R = 0,0214 × (2 × 20) / 2,5 ≈ 0,34 Ω. A 10 A si perdono 3,4 V, cioè circa l'1,5%.",
      },
      {
        title: "La rete non è ideale",
        body: "Anche a monte del contatore ci sono trasformatore e linee del distributore: la loro impedenza fa scendere la tensione quando la corrente aumenta.\nNel simulatore è il parametro «impedenza di rete» del punto di fornitura.",
      },
      {
        title: "Potenza di targa e potenza effettiva",
        body: "La potenza scritta sull'apparecchio vale alla tensione nominale. Un carico resistivo a tensione minore assorbe meno potenza, secondo il quadrato del rapporto tra le tensioni.",
        formula: "P_effettiva ≈ P_targa × (V / V_nominale)²",
        example: "Un forno da 2000 W che riceve 220 V invece di 230 V sviluppa circa 2000 × (220/230)² ≈ 1830 W.",
      },
    ],
    keyPoints: ["Andata e ritorno: in monofase la lunghezza conta due volte.", "Più corrente = più caduta lungo la linea.", "A tensione ridotta un carico resistivo rende meno."],
    quiz: [
      { q: "Raddoppiando la sezione di un cavo, la sua resistenza…", options: ["raddoppia", "si dimezza", "non cambia"], correct: 1, why: "R = ρ × L / S: la resistenza è inversamente proporzionale alla sezione." },
      { q: "Perché nel calcolo monofase si usa il doppio della lunghezza?", options: ["Per sicurezza", "Perché la corrente va sulla fase e torna sul neutro", "Perché il rame si scalda"], correct: 1, why: "Il percorso della corrente comprende entrambi i conduttori attivi." },
      { q: "Una stufa da 2000 W alimentata a 207 V (−10%) sviluppa circa…", options: ["1620 W", "1800 W", "2000 W"], correct: 0, why: "2000 × (207/230)² = 2000 × 0,81 = 1620 W." },
    ],
    practice: { demo: 'demo-appartamento', hint: "Avvia la simulazione e confronta la potenza nominale di ogni utilizzatore con quella effettiva nel cruscotto." },
  },

  // ------------------------------------------------------------ sicurezza elettrica
  {
    id: 'si-0-pericolo',
    track: 'sicurezza',
    level: 0,
    title: "Perché la corrente è pericolosa",
    minutes: 7,
    goals: ["Sapere da cosa dipende il danno di una scossa", "Conoscere le regole di comportamento di base"],
    sections: [
      {
        title: "Il corpo umano fa parte del circuito",
        body: "Se una persona tocca una parte in tensione mentre è in contatto con un'altra parte a potenziale diverso (il pavimento, un rubinetto, l'altra mano sul neutro) diventa un tratto del circuito e viene attraversata da corrente.\nLa pericolosità dipende soprattutto dall'intensità della corrente, dalla durata e dal percorso nel corpo (attraverso il torace è il caso peggiore).",
      },
      {
        title: "Ordini di grandezza",
        body: "Per corrente alternata a 50 Hz, valori indicativi tratti dalla IEC/TS 60479-1: circa 0,5 mA è la soglia di percezione; intorno ai 10 mA i muscoli si contraggono e può diventare impossibile lasciare la presa; oltre qualche decina di mA, se il passaggio dura abbastanza, c'è il rischio di fibrillazione ventricolare, che può essere mortale.\nI valori reali variano molto da persona a persona e con le condizioni (pelle bagnata, superficie di contatto).",
      },
      {
        title: "Le regole che non si discutono",
        body: "Si lavora fuori tensione: si sezionano i circuiti, si impedisce la richiusura e si verifica con uno strumento adatto che la tensione sia davvero assente.\nNon si toccano parti attive, non si rimuovono le protezioni, non si usano apparecchi o cavi danneggiati.\nIl simulatore serve proprio a studiare i guasti senza rischi: nella realtà questi interventi richiedono competenze e abilitazioni.",
      },
    ],
    keyPoints: ["Conta la corrente che attraversa il corpo e per quanto tempo.", "Pochi milliampere bastano per non riuscire a lasciare la presa.", "Sempre: sezionare, impedire la richiusura, verificare l'assenza di tensione."],
    quiz: [
      { q: "Da cosa dipende soprattutto la pericolosità di una scossa?", options: ["Dal colore del cavo", "Dalla corrente nel corpo, dalla durata e dal percorso", "Solo dalla potenza dell'impianto"], correct: 1, why: "Il danno è legato alla corrente che attraversa il corpo, per quanto tempo e lungo quale percorso." },
      { q: "Prima di lavorare su un circuito bisogna…", options: ["abbassare l'interruttore e iniziare", "sezionare, impedire la richiusura e verificare l'assenza di tensione", "indossare guanti di lana"], correct: 1, why: "Il sezionamento da solo non basta: va verificata l'assenza di tensione con uno strumento." },
      { q: "Circa 10 mA in corrente alternata possono…", options: ["non essere percepiti", "impedire di lasciare la presa", "essere del tutto innocui sempre"], correct: 1, why: "È l'ordine di grandezza della soglia di rilascio: i muscoli si contraggono." },
    ],
  },
  {
    id: 'si-1-contatti',
    track: 'sicurezza',
    level: 1,
    title: "Contatti diretti, indiretti e impianto di terra",
    minutes: 8,
    goals: ["Distinguere contatto diretto e indiretto", "Capire a cosa serve l'impianto di terra", "Sapere cos'è una massa"],
    sections: [
      {
        title: "Contatto diretto",
        body: "Si tocca una parte attiva, cioè normalmente in tensione: un conduttore spellato, un morsetto scoperto.\nLa protezione principale è impedirlo: isolamento, involucri, barriere. Il differenziale da 30 mA è una protezione addizionale, utile se le altre falliscono.",
      },
      {
        title: "Contatto indiretto",
        body: "Si tocca una massa, cioè una parte metallica di un apparecchio che normalmente non è in tensione (la carcassa della lavatrice) ma che lo diventa per un guasto d'isolamento.\nÈ insidioso perché la persona non sta facendo nulla di sbagliato.",
      },
      {
        title: "Il ruolo della terra",
        body: "Le masse sono collegate con il conduttore PE al dispersore, l'elettrodo infisso nel terreno. Se la fase tocca la carcassa, la corrente di guasto trova una via verso terra.\nQuesta corrente è ciò che fa intervenire il differenziale, che toglie tensione prima che la massa resti pericolosa a lungo.\nSenza PE la massa resterebbe in tensione e il primo a «chiudere il circuito» verso terra sarebbe una persona.",
      },
    ],
    keyPoints: ["Diretto = parte attiva; indiretto = massa in tensione per guasto.", "PE e dispersore servono a far nascere una corrente di guasto controllata.", "La terra da sola non toglie tensione: serve il dispositivo di interruzione."],
    quiz: [
      { q: "Toccare la carcassa di un frigorifero con un guasto d'isolamento è un contatto…", options: ["diretto", "indiretto", "nessuno dei due"], correct: 1, why: "La carcassa è una massa, in tensione solo a causa del guasto." },
      { q: "Cosa succede se una massa in tensione non è collegata al PE?", options: ["Interviene subito il magnetotermico", "Resta in tensione senza far intervenire le protezioni", "La tensione scompare"], correct: 1, why: "Non nasce una corrente di guasto finché qualcuno non tocca la massa." },
      { q: "Il differenziale da 30 mA contro i contatti diretti è…", options: ["l'unica protezione necessaria", "una protezione addizionale", "inutile"], correct: 1, why: "La protezione principale è l'isolamento; il differenziale interviene se questa fallisce." },
    ],
    practice: { exercise: 'l1-fase-neutro-terra', info: ['earth', 'bar-pe-8'] },
  },
  {
    id: 'si-2-differenziale',
    track: 'sicurezza',
    level: 2,
    title: "Il differenziale",
    minutes: 10,
    goals: ["Capire come funziona un differenziale", "Scegliere sensibilità e tipo", "Sapere cosa NON fa il differenziale"],
    sections: [
      {
        title: "Come funziona",
        body: "Fase e neutro passano dentro un toroide. Se la corrente che va verso il carico è uguale a quella che torna, i loro effetti magnetici si annullano.\nSe una parte della corrente si disperde verso terra (guasto o persona) la somma non è più zero: oltre la soglia il differenziale apre il circuito.",
        formula: "I_differenziale = I_fase − I_neutro   (in monofase)",
      },
      {
        title: "Sensibilità e tempi",
        body: "IΔn è la corrente differenziale nominale: 30 mA è la sensibilità usata come protezione addizionale delle persone, valori più alti (es. 300 mA) si usano per altre funzioni e per la selettività.\nSotto 0,5 × IΔn il differenziale non deve intervenire; da IΔn in su deve intervenire, con tempi massimi fissati dalla norma di prodotto (per il tipo generale 0,3 s a IΔn). Tra 0,5 e 1 × IΔn l'intervento è possibile ma non garantito.",
      },
      {
        title: "I tipi AC, A, F, B",
        body: "Indicano quali forme di corrente di guasto il dispositivo rileva: AC solo alternate sinusoidali; A anche pulsanti unidirezionali (apparecchi con elettronica); F anche quelle tipiche degli apparecchi con inverter monofase; B anche continue (es. alcune stazioni di ricarica, inverter trifase).\nLa scelta dipende dagli apparecchi alimentati e dalle indicazioni dei costruttori.",
      },
      {
        title: "Cosa non fa",
        body: "Un differenziale puro non protegge da sovraccarico e cortocircuito: per questo va abbinato a un magnetotermico, oppure si usa un magnetotermico differenziale.\nNon interviene se una persona tocca fase e neutro contemporaneamente senza dispersione verso terra: la corrente entra ed esce dal toroide.\nIl pulsante di prova T controlla il meccanismo, non l'efficacia della protezione dell'impianto.",
      },
    ],
    keyPoints: ["Misura la differenza tra corrente in andata e in ritorno.", "30 mA per la protezione addizionale delle persone.", "Non protegge da sovraccarico e cortocircuito."],
    quiz: [
      { q: "Un differenziale da 30 mA rileva una dispersione di 10 mA. Cosa fa?", options: ["Interviene sempre", "Non deve intervenire (sotto 0,5 × IΔn)", "Va in cortocircuito"], correct: 1, why: "10 mA sono meno di 15 mA (0,5 × 30 mA): zona di non intervento." },
      { q: "Una persona isolata da terra tocca fase e neutro insieme. Il differenziale…", options: ["interviene subito", "non vede differenza tra andata e ritorno", "interviene dopo 1 s"], correct: 1, why: "La corrente passa nella persona ma torna sul neutro: nessuna dispersione verso terra." },
      { q: "Per una lavatrice con inverter monofase il costruttore indica spesso un differenziale…", options: ["di tipo AC", "di tipo F (o A secondo le indicazioni)", "nessun differenziale"], correct: 1, why: "Il tipo F rileva anche le correnti di guasto tipiche degli inverter monofase." },
    ],
    practice: { exercise: 'l1-differenziale', info: ['rcd-2p', 'rcbo-1pn'] },
  },
  {
    id: 'si-3-tt',
    track: 'sicurezza',
    level: 3,
    title: "Il sistema TT e il coordinamento con la terra",
    minutes: 12,
    goals: ["Seguire il percorso della corrente di guasto in un sistema TT", "Capire perché in TT serve il differenziale", "Verificare RA × IΔn ≤ UL"],
    sections: [
      {
        title: "Cos'è il sistema TT",
        body: "Nelle abitazioni alimentate in bassa tensione il neutro è collegato a terra in cabina (resistenza RB) e le masse dell'utente sono collegate al dispersore dell'utente (resistenza RA). Le due terre sono separate: «T» e «T».\nIl distributore non fornisce un conduttore di protezione: il PE nasce dal dispersore dell'utente.",
      },
      {
        title: "Il percorso del guasto",
        body: "Con un guasto fase-massa la corrente percorre: fase → massa → PE → dispersore RA → terreno → terra di cabina RB → neutro → trasformatore.\nLe resistenze di terra sono di decine di ohm o più: la corrente di guasto è di pochi ampere.",
        formula: "I_guasto ≈ U0 / (RA + RB)",
        example: "RA = 50 Ω, RB = 2 Ω: I ≈ 230 / 52 ≈ 4,4 A. Un magnetotermico da 16 A non interviene: né il termico in tempi brevi, né il magnetico.",
      },
      {
        title: "Perché il differenziale è indispensabile",
        body: "Pochi ampere sono troppo pochi per i magnetotermici, ma sono enormi per un differenziale da 30 mA, che interviene in decine di millisecondi.\nLa tensione che la massa assume durante il guasto è circa RA × I_guasto: con RA = 50 Ω e 4,4 A sarebbero 220 V se nessuno intervenisse.",
      },
      {
        title: "La condizione sulla resistenza di terra",
        body: "La condizione classica (CEI 64-8, edizione 2007) per il sistema TT è che una corrente pari alla soglia del differenziale non porti le masse oltre la tensione di contatto limite UL (50 V negli ambienti ordinari).\nL'edizione oggi in vigore è la IX: per le verifiche ufficiali fa fede quella.",
        formula: "RA × IΔn ≤ UL",
        example: "Con IΔn = 30 mA: RA ≤ 50 / 0,03 ≈ 1667 Ω. Con IΔn = 300 mA: RA ≤ 167 Ω.",
      },
    ],
    keyPoints: ["In TT la corrente di guasto è limitata dalle resistenze di terra.", "I magnetotermici non bastano: serve il differenziale.", "Verifica: RA × IΔn ≤ 50 V negli ambienti ordinari."],
    quiz: [
      { q: "RA = 100 Ω, RB = 2 Ω. La corrente di un guasto franco fase-massa è circa…", options: ["2,3 A", "23 A", "115 A"], correct: 0, why: "I ≈ 230 / (100 + 2) ≈ 2,25 A." },
      { q: "Con un differenziale da 300 mA la massima RA ammessa (UL = 50 V) è circa…", options: ["17 Ω", "167 Ω", "1667 Ω"], correct: 1, why: "RA ≤ 50 / 0,3 ≈ 167 Ω." },
      { q: "Perché in TT il magnetotermico in genere non protegge dai contatti indiretti?", options: ["Perché è troppo veloce", "Perché la corrente di guasto è troppo bassa per farlo intervenire rapidamente", "Perché non è collegato al PE"], correct: 1, why: "Pochi ampere sono sotto la soglia magnetica: interverrebbe solo il termico, troppo lentamente." },
    ],
    practice: { exercise: 'l4-dispersione', hint: "Inserisci un guasto L-PE su un utilizzatore e guarda la tensione della massa e il differenziale che interviene." },
  },
];
