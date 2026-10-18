import type { FaultType } from './types';

export interface FaultInfo {
  label: string;
  description: string;
  /** Il guasto ha una resistenza di guasto configurabile */
  resistive: boolean;
  defaultResistance: number;
}

export const FAULT_INFO: Record<FaultType, FaultInfo> = {
  'short-LN': {
    label: 'Cortocircuito L-N',
    description: 'Contatto tra fase e neutro all\'utilizzatore (es. cavo schiacciato). La corrente è limitata solo dalle impedenze di rete, conduttori e contatti.',
    resistive: true,
    defaultResistance: 0,
  },
  'short-LL': {
    label: 'Cortocircuito L1-L2',
    description: 'Contatto tra due fasi di un utilizzatore trifase: la tensione che spinge la corrente è la concatenata (400 V), quindi la corrente di guasto è più alta di quella fase-neutro.',
    resistive: true,
    defaultResistance: 0,
  },
  'L-PE': {
    label: 'Guasto a massa (L-PE)',
    description: 'Cedimento dell\'isolamento: la fase tocca l\'involucro metallico. Nel sistema TT la corrente si richiude attraverso PE, dispersore (RA), terreno e terra di cabina (RB).',
    resistive: true,
    defaultResistance: 0,
  },
  'L-earth': {
    label: 'Contatto fase-terra (persona)',
    description: 'Una persona tocca una parte attiva ed è in contatto con il terreno. 1000 Ω è un valore indicativo della resistenza del corpo umano: il valore reale varia molto.',
    resistive: true,
    defaultResistance: 1000,
  },
  'open-L': {
    label: 'Fase interrotta (L / L1)',
    description: 'Il conduttore di fase della linea è interrotto (morsetto allentato, conduttore tranciato).',
    resistive: false,
    defaultResistance: 0,
  },
  'open-N': {
    label: 'Neutro interrotto',
    description: 'Il neutro della linea è interrotto: l\'apparecchio si spegne ma le sue parti collegate al neutro si portano al potenziale di fase.',
    resistive: false,
    defaultResistance: 0,
  },
  'open-PE': {
    label: 'PE interrotto',
    description: 'La massa perde il collegamento a terra. In servizio ordinario non cambia nulla (il PE non porta corrente), ma un successivo guasto d\'isolamento porta la massa a tensione pericolosa senza che il differenziale intervenga.',
    resistive: false,
    defaultResistance: 0,
  },
  'open-wire': {
    label: 'Conduttore interrotto',
    description: 'Il conduttore del quadro è interrotto o il morsetto non serra.',
    resistive: false,
    defaultResistance: 0,
  },
};

export const LOAD_FAULTS: FaultType[] = ['short-LN', 'short-LL', 'L-PE', 'L-earth', 'open-L', 'open-N', 'open-PE'];

/** Guasti applicabili a un utilizzatore (L-L solo sui trifase, N solo se presente). */
export function loadFaultsFor(threePhase: boolean, hasNeutral: boolean): FaultType[] {
  return LOAD_FAULTS.filter((t) => (t === 'short-LL' ? threePhase : t === 'short-LN' || t === 'open-N' ? hasNeutral : true));
}
