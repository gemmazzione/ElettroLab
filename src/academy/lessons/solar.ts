import type { Lesson } from './types';

/** Percorso: impianti fotovoltaici. */
export const SOLAR_LESSONS: Lesson[] = [
  {
    id: 'fv-0-sole',
    track: 'fotovoltaico',
    level: 0,
    title: "Dal sole alla presa: come funziona un impianto fotovoltaico",
    minutes: 7,
    goals: ["Sapere cosa fanno moduli e inverter", "Capire dove va l'energia prodotta", "Sapere perché di sera si preleva dalla rete"],
    sections: [
      {
        title: "Il modulo fotovoltaico",
        body:
          "Una cella fotovoltaica è una lamina di silicio che, colpita dalla luce, fa scorrere una corrente: è l'effetto fotovoltaico. Più luce arriva, più corrente produce.\nLe celle sono collegate tra loro e protette da vetro e cornice: è il modulo (spesso chiamato «pannello»). I moduli producono corrente CONTINUA, come una pila.",
      },
      {
        title: "L'inverter",
        body:
          "In casa tutto funziona in corrente alternata a 230 V e 50 Hz. L'inverter trasforma la continua dei moduli in alternata sincronizzata con la rete e la immette nell'impianto di casa, a valle del contatore.",
      },
      {
        title: "Dove va l'energia",
        body:
          "Gli apparecchi accesi usano per primi l'energia prodotta: è l'autoconsumo. Se si produce più di quanto si consuma, l'eccedenza esce verso la rete del distributore (immissione). Se si produce meno, la parte mancante arriva dalla rete come sempre (prelievo).\nDi notte i moduli non producono: senza batteria tutta l'energia arriva dalla rete.",
      },
    ],
    keyPoints: ["Moduli = corrente continua dalla luce.", "Inverter = continua → alternata a 230 V.", "Prima si autoconsuma, l'eccedenza va in rete, la mancanza arriva dalla rete."],
    quiz: [
      { q: "Che tipo di corrente producono i moduli fotovoltaici?", options: ["Alternata a 50 Hz", "Continua", "Trifase"], correct: 1, why: "La cella genera corrente continua; l'alternata la produce l'inverter." },
      { q: "A mezzogiorno l'impianto produce 2 kW e in casa sono accesi 500 W. Cosa succede ai 1,5 kW in più?", options: ["Si perdono", "Vanno in rete (immissione)", "Bruciano l'inverter"], correct: 1, why: "L'eccedenza esce verso la rete del distributore attraverso il contatore di scambio." },
      { q: "Di sera, senza batteria, da dove arriva l'energia per la casa?", options: ["Dai moduli", "Dalla rete del distributore", "Dall'inverter spento"], correct: 1, why: "Senza luce non c'è produzione: si preleva dalla rete." },
    ],
    practice: { demo: 'demo-fotovoltaico', info: ['pv-string', 'pv-inverter'], hint: "Avvia la simulazione, chiudi Q1 e sposta l'irraggiamento nelle proprietà dell'inverter: guarda il contatore passare da prelievo a immissione." },
  },
  {
    id: 'fv-1-moduli',
    track: 'fotovoltaico',
    level: 1,
    title: "Moduli e stringhe: potenza di picco, Voc e Isc",
    minutes: 10,
    goals: ["Leggere i dati di targa di un modulo", "Calcolare tensione e corrente di una stringa", "Capire l'effetto di luce e temperatura"],
    sections: [
      {
        title: "I dati di targa",
        body:
          "I valori sono riferiti alle condizioni standard di prova (STC): irraggiamento di 1000 W/m² e cella a 25 °C.\nPmax (Wp, watt di picco) è la potenza massima; Vmp e Imp sono tensione e corrente in quel punto; Voc è la tensione a vuoto (nessun carico), Isc la corrente di cortocircuito.",
        example: "Modulo da 400 Wp: Vmp 34 V, Imp 11,8 A (34 × 11,8 ≈ 400 W), Voc 41 V, Isc 12,5 A.",
      },
      {
        title: "Serie e parallelo",
        body:
          "Moduli in serie formano una stringa: le tensioni si sommano, la corrente resta quella di un modulo. Più stringhe uguali in parallelo sommano le correnti a parità di tensione.",
        formula: "V_stringa = N × V_modulo      I_totale = M × I_stringa      P = N × M × Pmax",
        example: "8 moduli in serie: Voc = 8 × 41 = 328 V, Vmp = 272 V; potenza di picco 8 × 400 = 3,2 kWp.",
      },
      {
        title: "Luce e temperatura",
        body:
          "La corrente è quasi proporzionale all'irraggiamento: a metà luce, circa metà corrente e metà potenza.\nLa temperatura agisce soprattutto sulla tensione: con il caldo cala, con il freddo sale (coefficiente tipico −0,3 %/°C). La cella al sole è molto più calda dell'aria: si stima con il NOCT.",
        formula: "Tcella ≈ Tambiente + (NOCT − 20) / 800 × G",
        example: "Aria a 25 °C, 1000 W/m², NOCT 45 °C: Tcella ≈ 25 + 25/800 × 1000 ≈ 56 °C. Con −0,35 %/°C la potenza cala di circa l'11%.",
      },
    ],
    keyPoints: ["STC: 1000 W/m², cella a 25 °C.", "Serie = più tensione, parallelo = più corrente.", "Il caldo riduce tensione e potenza; il freddo fa salire la tensione."],
    quiz: [
      { q: "10 moduli con Voc 40 V in serie: tensione a vuoto della stringa (a 25 °C)?", options: ["40 V", "400 V", "4 V"], correct: 1, why: "In serie le tensioni si sommano: 10 × 40 V = 400 V." },
      { q: "Con metà dell'irraggiamento la corrente del modulo è circa…", options: ["la stessa", "la metà", "il doppio"], correct: 1, why: "La corrente è quasi proporzionale alla luce ricevuta." },
      { q: "In una mattina d'inverno molto fredda la tensione a vuoto della stringa…", options: ["è più bassa del valore di targa", "è più alta del valore di targa", "è uguale"], correct: 1, why: "Il coefficiente della Voc è negativo: sotto i 25 °C la tensione aumenta." },
    ],
    practice: { demo: 'demo-fotovoltaico', exercise: 'l6-polarita', info: ['pv-string'], hint: "Seleziona il generatore: il «Punto di lavoro» mostra temperatura di cella, Vmp, Imp, Voc e Isc con il sole impostato." },
  },
  {
    id: 'fv-2-inverter',
    track: 'fotovoltaico',
    level: 2,
    title: "Inverter, MPPT e dimensionamento della stringa",
    minutes: 12,
    goals: ["Capire cosa fa l'inseguitore MPPT", "Verificare la stringa con la tensione massima e minima", "Riconoscere il limite di potenza (clipping)"],
    sections: [
      {
        title: "L'inseguitore del punto di massima potenza",
        body:
          "La potenza della stringa dipende dalla tensione a cui lavora: c'è un solo punto (MPP) in cui è massima, e si sposta con luce e temperatura. L'inverter lo cerca continuamente variando la tensione: è l'MPPT. Funziona solo dentro un intervallo di tensione dichiarato dal costruttore.",
      },
      {
        title: "Tre verifiche di tensione",
        body:
          "1) Con il freddo la tensione a vuoto sale: alla temperatura minima del sito deve restare sotto la massima tensione DC dell'inverter, altrimenti l'ingresso può danneggiarsi.\n2) Con la cella calda la tensione MPP scende: deve restare sopra il minimo dell'MPPT.\n3) Con la cella fredda la tensione MPP deve restare sotto il massimo dell'MPPT.",
        formula: "Voc,max = N × Voc × (1 + βVoc × (Tmin − 25))",
        example: "8 moduli, Voc 41 V, β = −0,27 %/°C, Tmin = −10 °C: 8 × 41 × (1 + 0,0027 × 35) ≈ 359 V, sotto i 600 V dell'inverter. Con 16 moduli sarebbero circa 718 V: troppi.",
      },
      {
        title: "Corrente e potenza",
        body:
          "La corrente di cortocircuito delle stringhe in parallelo non deve superare la massima corrente DC ammessa dall'ingresso.\nSe il generatore può dare più potenza di quella nominale dell'inverter, nelle ore migliori l'inverter la limita (clipping). Un rapporto DC/AC vicino a 1 è comune; un leggero sovradimensionamento dei moduli è una scelta di progetto.",
      },
    ],
    keyPoints: ["MPPT = l'inverter cerca la tensione di massima potenza.", "Voc con il freddo ≤ massima tensione DC.", "Vmp con il caldo ≥ minimo MPPT."],
    quiz: [
      { q: "Perché la tensione massima si verifica con la temperatura minima del sito?", options: ["Perché con il freddo la tensione dei moduli sale", "Perché d'inverno c'è più sole", "Perché l'inverter si raffredda"], correct: 0, why: "Il coefficiente di temperatura della tensione è negativo: al freddo la Voc aumenta." },
      { q: "Cosa succede se la tensione MPP scende sotto il minimo dell'MPPT?", options: ["L'inverter produce di più", "L'inverter non riesce a lavorare nel punto ottimale o si ferma", "Niente"], correct: 1, why: "Fuori dall'intervallo l'inseguitore non funziona: produzione ridotta o nulla." },
      { q: "Generatore da 4 kWp e inverter da 3 kW a mezzogiorno d'estate:", options: ["l'inverter immette 4 kW", "l'inverter limita la potenza a circa 3 kW", "l'inverter si spegne"], correct: 1, why: "La potenza in uscita è limitata alla nominale: è il clipping." },
    ],
    practice: { demo: 'demo-fotovoltaico', exercise: 'l6-stringa', info: ['pv-inverter'], hint: "Seleziona l'inverter: «Dimensionamento stringa-inverter» mostra le verifiche. Prova a portare la stringa a 16 moduli." },
  },
  {
    id: 'fv-3-rete',
    track: 'fotovoltaico',
    level: 3,
    title: "Connessione alla rete, sicurezza e accumulo",
    minutes: 13,
    goals: ["Disegnare il collegamento dell'inverter all'impianto", "Conoscere protezione di interfaccia e anti-isola", "Lavorare in sicurezza sul lato DC", "Valutare autoconsumo e batteria"],
    sections: [
      {
        title: "Il collegamento lato AC",
        body:
          "L'inverter si collega all'impianto con una linea dedicata, protetta contro le sovracorrenti e, se richiesto dal costruttore, con un differenziale del tipo indicato. Spesso si inserisce un contatore di produzione che misura l'energia generata; il contatore del distributore diventa bidirezionale e conta prelievi e immissioni.",
      },
      {
        title: "Protezione di interfaccia e anti-isola",
        body:
          "Se la rete del distributore viene a mancare (guasto o lavori), l'impianto non deve continuare ad alimentarla: chi lavora sulla linea la troverebbe in tensione. La protezione di interfaccia controlla tensione e frequenza e stacca il generatore fuori dalle soglie.\nI requisiti di connessione alla rete di bassa tensione sono nella regola tecnica CEI 0-21 (soglie, dispositivi, casi in cui la protezione può essere integrata nell'inverter): vanno verificati sul testo vigente e con il distributore.",
      },
      {
        title: "Sicurezza sul lato in continua",
        body:
          "Con la luce i moduli producono tensione anche con l'inverter spento o il sezionatore aperto: i cavi di stringa sono sempre parti attive. In continua l'arco che si forma aprendo un contatto sotto carico non si estingue da solo: si sezionano i circuiti solo a inverter fermo, con dispositivi adatti alla tensione DC.\nSPD lato DC e collegamento delle masse e delle strutture al conduttore di protezione si valutano secondo le norme e le istruzioni dei costruttori.",
      },
      {
        title: "Autoconsumo e accumulo",
        body:
          "La produzione si concentra a metà giornata, i consumi spesso la sera. Senza accumulo gran parte dell'energia va in rete; con una batteria l'eccedenza viene immagazzinata e usata dopo il tramonto.",
        formula: "Autoconsumo = energia prodotta e consumata / energia prodotta      Autosufficienza = consumi coperti / consumi totali",
      },
    ],
    keyPoints: ["Linea dedicata e protetta per l'inverter.", "Senza rete l'inverter deve staccarsi (anti-isola).", "Il lato DC è in tensione finché c'è luce.", "La batteria sposta l'energia di mezzogiorno alla sera."],
    quiz: [
      { q: "Il distributore toglie tensione alla linea per lavori. L'inverter deve…", options: ["continuare ad alimentare la casa e la linea", "staccarsi e smettere di immettere", "aumentare la potenza"], correct: 1, why: "È la funzione anti-isola: protegge chi lavora sulla rete." },
      { q: "Hai aperto il sezionatore DC accanto all'inverter. I cavi verso i moduli sono…", options: ["senza tensione", "ancora in tensione finché c'è luce", "collegati a terra"], correct: 1, why: "Il sezionatore separa l'inverter, ma la stringa continua a generare tensione." },
      { q: "Una batteria in un impianto domestico serve soprattutto a…", options: ["aumentare la potenza di picco dei moduli", "usare la sera l'energia prodotta a mezzogiorno", "evitare il contatore"], correct: 1, why: "Aumenta l'autoconsumo spostando l'energia nel tempo." },
    ],
    practice: { demo: 'demo-fotovoltaico', exercise: 'l6-autoconsumo', info: ['pv-inverter-hybrid', 'dc-switch-2p', 'energy-meter'], hint: "Nel progetto apri il generale Q1 con il sole: l'inverter si stacca. Poi nella «Giornata tipo» dell'inverter imposta una batteria e confronta autoconsumo e prelievi." },
  },
];
