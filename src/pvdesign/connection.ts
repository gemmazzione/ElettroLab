// Connessione alla rete e pratiche: livello di tensione, protezione di interfaccia, officina elettrica,
// prevenzione incendi. Indicazioni di massima con le fonti: le regole vanno verificate con il distributore.

import { acPowerW, f, threePhase } from './calc';
import { BUSINESS_SOURCES, type PriceSource } from './data';
import { isBusiness, type PvDesign } from './design';

export interface ConnectionItem {
  id: 'level' | 'spi' | 'phases' | 'adm' | 'fire' | 'gaudi';
  title: string;
  /** Sintesi in una riga */
  summary: string;
  detail: string;
  /** true = tutto a posto, null = adempimento o attenzione */
  ok: boolean | null;
  sources: PriceSource[];
}

/** Soglie di potenza [kW] richiamate nelle pratiche. */
export const CONNECTION_LIMITS = { spiIntegratedKW: 11.08, lowVoltageKW: 100, mediumVoltageKW: 6000, admKW: 20 } as const;

export function connectionInfo(d: PvDesign): ConnectionItem[] {
  const kw = acPowerW(d) / 1000;
  const mt = kw > CONNECTION_LIMITS.lowVoltageKW;
  const out: ConnectionItem[] = [
    {
      id: 'level',
      title: 'Livello di tensione della connessione',
      summary: mt ? `Media tensione (${f(kw, 1)} kW oltre 100 kW): regola tecnica CEI 0-16` : `Bassa tensione (${f(kw, 1)} kW fino a 100 kW): regola tecnica CEI 0-21`,
      detail: mt
        ? "Oltre 100 kW la connessione ordinaria è in media tensione (fino a 6.000 kW): servono la cabina di consegna, la protezione generale e la protezione di interfaccia secondo la CEI 0-16. Se l'azienda è già allacciata in media tensione, di solito si usa la cabina esistente adeguandola. Il distributore può indicare soluzioni diverse nel preventivo di connessione."
        : 'Fino a 100 kW la connessione ordinaria è in bassa tensione. Se esiste già un allaccio, si resta al suo livello di tensione entro la potenza disponibile. Il distributore conferma tutto nel preventivo di connessione.',
      ok: null,
      sources: BUSINESS_SOURCES.connection,
    },
    {
      id: 'spi',
      title: 'Protezione di interfaccia (SPI)',
      summary:
        kw <= CONNECTION_LIMITS.spiIntegratedKW
          ? `Fino a ${f(CONNECTION_LIMITS.spiIntegratedKW, 2)} kW: integrata nell'inverter`
          : mt
            ? 'Esterna, con la protezione generale della cabina (CEI 0-16)'
            : `Oltre ${f(CONNECTION_LIMITS.spiIntegratedKW, 2)} kW: SPI e dispositivo di interfaccia esterni`,
      detail:
        kw <= CONNECTION_LIMITS.spiIntegratedKW
          ? "La protezione che stacca l'impianto dalla rete quando la rete manca o è fuori tolleranza può essere quella dell'inverter, certificata CEI 0-21."
          : "Serve un relè di protezione di interfaccia certificato con il suo dispositivo di interfaccia (contattore o interruttore) in un quadro dedicato, più le prove di intervento alla messa in servizio. Nel listino c'è la voce «Protezione di interfaccia esterna».",
      ok: kw <= CONNECTION_LIMITS.spiIntegratedKW ? true : null,
      sources: BUSINESS_SOURCES.spi,
    },
  ];
  if (!threePhase(d) && kw > 6) {
    out.push({
      id: 'phases',
      title: 'Collegamento trifase',
      summary: `${f(kw, 1)} kW su una fase: in genere serve il trifase`,
      detail: 'Oltre circa 6 kW il distributore chiede di solito un collegamento trifase (CEI 0-21, riferimento non verificato su testo): scegli un inverter trifase.',
      ok: null,
      sources: [],
    });
  }
  if (kw > CONNECTION_LIMITS.admKW) {
    out.push({
      id: 'adm',
      title: "Officina elettrica (Agenzia delle Dogane)",
      summary: 'Oltre 20 kW con autoconsumo: denuncia di officina elettrica e licenza',
      detail:
        "Un impianto oltre 20 kW che consuma sul posto parte dell'energia è un'officina elettrica: va denunciato all'ufficio delle Dogane competente, che rilascia la licenza di esercizio. Seguono il diritto annuale e le dichiarazioni periodiche dei consumi. Le regole sono cambiate nel 2026 (DM MEF del 10 marzo 2026): verificale sul sito dell'Agenzia delle Dogane o con un consulente.",
      ok: null,
      sources: BUSINESS_SOURCES.adm,
    });
  }
  if (isBusiness(d)) {
    out.push({
      id: 'fire',
      title: 'Prevenzione incendi',
      summary: 'Attività soggette ai controlli dei Vigili del Fuoco: linea guida 2025',
      detail:
        "Se nell'edificio si svolge un'attività soggetta ai controlli di prevenzione incendi, progetto e installazione seguono la linea guida dei Vigili del Fuoco (nota DCPREV 14030 del 1° settembre 2025, che sostituisce la guida del 2012): distanze, compartimentazioni, sezionamento di emergenza, segnaletica. Può servire l'aggiornamento della pratica antincendio.",
      ok: null,
      sources: BUSINESS_SOURCES.fire,
    });
  }
  out.push({
    id: 'gaudi',
    title: 'Registrazione e vendita dell\'energia',
    summary: 'Gaudì di Terna, regolamento di esercizio, convenzione con il GSE',
    detail:
      "Con la pratica di connessione l'impianto si registra sul sistema Gaudì di Terna e si firma il regolamento di esercizio con il distributore; dopo l'attivazione si chiede al GSE la convenzione per l'energia immessa (ritiro dedicato) o si vende a un operatore di mercato.",
    ok: null,
    sources: [],
  });
  return out;
}
