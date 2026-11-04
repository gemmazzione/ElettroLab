/**
 * Cabina di trasformazione MT/BT dell'utente: impedenza a monte del quadro generale vista dalla bassa tensione.
 * Rete MT: impedenza Zq = c · U² / Scc (puramente reattiva, c = 1,1 come in IEC 60909).
 * Trasformatore: Zt = ucc% · U² / Sn, con la parte resistiva data dalle perdite nel rame (ur%).
 * Valori per fase riferiti a U = 400 V; il modello del punto di fornitura usa l'impedenza dell'anello
 * fase + neutro, quindi si raddoppia (stessa impedenza sul neutro, approssimazione per i trasformatori Dyn).
 */

/** Taglie normalizzate dei trasformatori MT/BT [kVA]. */
export const TRANSFORMER_SIZES = [100, 160, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600] as const;

/** Parte resistiva della tensione di cortocircuito (perdite nel rame / Sn) [%]: valore tipico per taglia. */
export function typicalUrPct(kva: number): number {
  if (kva <= 160) return 1.8;
  if (kva <= 400) return 1.4;
  if (kva <= 800) return 1.2;
  return 1;
}

export interface CabinImpedance {
  /** Resistenza e reattanza per fase [Ω] */
  r: number;
  x: number;
  /** Valori per il punto di fornitura (anello fase + neutro) [Ω] */
  rNetwork: number;
  xNetwork: number;
  /** Corrente di cortocircuito trifase ai morsetti BT [A] */
  ik3: number;
  /** Corrente nominale del trasformatore lato BT [A] */
  inA: number;
}

export function cabinImpedance(kva: number, ukPct: number, mvSccMVA: number, urPct = typicalUrPct(kva)): CabinImpedance {
  const u = 400;
  const zq = (1.1 * u * u) / (Math.max(10, mvSccMVA) * 1e6);
  const zt = ((ukPct / 100) * u * u) / (kva * 1000);
  const rt = Math.min(zt, ((urPct / 100) * u * u) / (kva * 1000));
  const xt = Math.sqrt(Math.max(0, zt * zt - rt * rt));
  const r = rt;
  const x = xt + zq;
  return { r, x, rNetwork: 2 * r, xNetwork: 2 * x, ik3: 230 / Math.hypot(r, x), inA: (kva * 1000) / (Math.sqrt(3) * u) };
}
