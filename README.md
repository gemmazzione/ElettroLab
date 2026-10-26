# ElectroLab — Simulatore di quadri elettrici civili

Laboratorio virtuale didattico per progettare, cablare e simulare quadri elettrici di abitazioni italiane.
Strumento di apprendimento e pre-verifica: **non** sostituisce progettazione, installazione e verifiche di professionisti abilitati e non attesta conformità.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # test del motore e delle verifiche di cablaggio
npm run build
```

## Architettura

| Livello | Cartella | Contenuto |
|---|---|---|
| Modello componenti | `src/model` | tipi, catalogo, morsetti/poli, geometria DIN, costanti fisiche documentate |
| Grafo connessioni | `src/graph/netGraph.ts` | reti statiche (union-find), percorso a monte di ogni linea |
| Verifiche cablaggio | `src/graph/erc.ts` | morsetti liberi, fase/neutro, neutri tra differenziali, PE, colori |
| Analisi circuitale | `src/engine` | netlist (con guasti) → analisi nodale a fasori complessi; Icc presunta, misure strumentali |
| Verifica normativa | `src/rules` | motore di regole versionato (17 regole, 11 aree), contesto di calcolo, portate con fattori di correzione |
| Protezioni e guasti | `src/protection` | curve termica/magnetica/differenziale, stepper a eventi con selettività |
| Accademia | `src/academy` | 17 esercizi su 5 livelli, controllo automatico, punteggio, progressi |
| Schema unifilare | `src/diagram` | albero ricavato dal grafo elettrico, layout, simboli SVG (vista app e stampa) |
| Esportazione | `src/export` | dati della relazione (puri) e impaginazione PDF con jsPDF |
| Stato | `src/store` | Zustand: progetto, undo/redo, simulazione, registro eventi |
| Persistenza | `src/persistence` | LocalStorage, libreria progetti (duplica, rinomina, import/export singolo o intera libreria) |
| Editor grafico | `src/editor`, `src/ui` | XYFlow (nodi = dispositivi, handle = morsetti, edge = conduttori), SVG |

Il motore è indipendente dalla grafica: `simulate(project)` è una funzione pura.
Le approssimazioni del modello sono elencate in `src/model/constants.ts` (`MODEL_ASSUMPTIONS`) e visibili nell'app ("Modello fisico").

## Stato delle fasi

- **Fase 1 (completata):** quadro DIN 12–72 moduli, catalogo essenziale, drag & drop, cablaggio su morsetti reali, rete monofase TT, interruttori manovrabili, carichi resistivi, tensioni/correnti/potenze, salvataggio locale, progetto dimostrativo.
- **Fase 2 (completata):** sganciatore termico tempo-corrente con memoria termica, magnetico con fascia d'incertezza, verifica Icn sulla corrente interrotta, differenziale con zone 0,5–1·IΔn e tempi di norma, pulsante di prova, guasti L-N / L-PE / fase-terra / interruzioni di L, N, PE e di singoli conduttori, Icc presunta ai morsetti e a fondo linea, multimetro (V~, Ω, continuità a impianto disalimentato), pinza amperometrica (conduttore o L+N), tempo simulato 1×/10×/60×.
- **Fase 3 (completata):** motore di regole versionato (`src/rules`): ogni regola ha ID, versione, descrizione, riferimenti, campo di applicazione, gravità, spiegazione didattica e dati richiesti. Esiti: conforme alle regole verificate / errore / attenzione / dati insufficienti / verifica sul campo necessaria; nessuna dichiarazione di conformità globale. Riferimenti verificati sul testo CEI 64-8:2007 (6ª ed., studio storico); l'edizione vigente è la IX (in vigore dal 1/11/2024, comunicato CEI): le corrispondenze con i suoi articoli sono marcate come non verificate. Portate: valori IEC 60364-5-52 All. B con k1/k2 (la 2007 rimanda a CEI-UNEL 35024/1, non inclusa: Iz inseribile dall'utente). Schede informative per ogni articolo del catalogo.
- **Fase 4 (completata):** rete trifase 400/230 V (generatori a 0°/−120°/+120°), dispositivi 3P, 3P+N, 4P, differenziale 4P, sezionatore 4P, carico trifase a stella con o senza neutro, guasto L1-L2, identificazione automatica della fase dei conduttori, correnti di fase e di neutro, tensioni concatenate, diagramma fasoriale con spostamento del centro stella (verificato con il teorema di Millman). Quattro progetti predefiniti (3 kW, 4,5 kW, 6 kW, trifase squilibrato). Accademia con 17 esercizi (fondamenti, primo quadro, appartamento, ricerca guasti con guasti nascosti, trifase).
- **Fase 5 (completata):** schema unifilare generato automaticamente dai collegamenti (simboli, conduttori, fasi, targhe, correnti in tempo reale, selezione dei componenti, cartiglio), relazione PDF (dati generali, dispositivi, circuiti con IB/Iz/ΔV/Icc, schema unifilare, verifiche normative e di cablaggio, approssimazioni, avvertenze), libreria progetti. Icc presunta massima ai dispositivi trifase con guasto trifase simmetrico.

**Aggiornamenti successivi:** quadri multipli (quadro generale e sottoquadri affiancati, ciascuno con le proprie guide; i progetti a quadro singolo vengono convertiti automaticamente), guasto «sovraccarico» (apparecchi aggiuntivi su una linea), registro eventi che riporta lo stato dopo gli interventi istantanei invece dei transitori di pochi millisecondi, progetto predefinito «Villetta con sottoquadro», scaricatori di sovratensione (SPD), relè passo-passo con pulsanti, climatizzatore/frigorifero/caldaia, quadri da 4 moduli, sezionatori portafusibili con cartucce gG 10,3×38 (curva media sintetica entro le porte CEI EN 60269-2, fusione per polo, sostituzione della cartuccia a portafusibili aperto), lavatrice e lavastoviglie, sezione e lunghezza dei conduttori sulle etichette, pettini di collegamento 1P, 1P+N, 3P, 3P+N (barra in rame tra gli ingressi di dispositivi affiancati). Fotovoltaico: generatori a stringhe con modello di cella (irraggiamento, temperatura, NOCT), inverter come generatore nel circuito con MPPT, limitazione di potenza e distacco senza rete, sezionatore e SPD lato DC, misuratore di energia bidirezionale, verifiche stringa-inverter sui dati di targa, giornata tipo con autoconsumo e accumulo, multimetro in continua, progetto «Casa con fotovoltaico» e percorso di lezioni dedicato.

Non implementati in questa versione (indicati con il lucchetto nel catalogo): contattori, relè di controllo tensione, alimentatori.

## Pubblicazione automatica su Aruba (FTP)

A ogni `git push` su `main` la GitHub Action `.github/workflows/deploy-aruba.yml` esegue i test, compila l'app e carica via FTP **solo i file cambiati** sul tuo spazio Aruba. Se un test fallisce, non pubblica nulla.

Configurazione, una volta sola, in GitHub → repository → **Settings → Secrets and variables → Actions**:

| Tipo | Nome | Valore |
|---|---|---|
| Secret | `FTP_SERVER` | server FTP Aruba, es. `ftp.tuodominio.it` |
| Secret | `FTP_USERNAME` | utente FTP (pannello Aruba → Hosting Linux → Gestione FTP) |
| Secret | `FTP_PASSWORD` | password FTP |
| Variable | `FTP_SERVER_DIR` | cartella di destinazione con `/` finale, es. `/www.tuodominio.it/electrolab/` (oppure `/www.tuodominio.it/` per la radice del sito) |
| Variable (facoltativa) | `FTP_PROTOCOL` | `ftps` (predefinito, cifrato) oppure `ftp` se il piano non supporta FTPS |

Poi avvia una pubblicazione da **Actions → Pubblica su Aruba → Run workflow** (o fai un push). Lo stato di ogni pubblicazione è visibile nella scheda Actions.

Note:
- L'app è statica (HTML, JS, CSS); PHP e database servono solo per gli account (facoltativi, vedi sotto). I percorsi sono relativi, quindi funziona sia nella radice del sito sia in una sottocartella.
- Il file `public/.htaccess` (copiato nella build) imposta compressione e cache su Apache.
- Senza account i progetti restano salvati nel browser (memoria locale); usa «Esporta tutta la libreria» per trasferirli.

## Account utente (database MySQL, es. AlterVista)

Con gli account la libreria progetti, i progressi dell'Accademia e il progetto in corso vengono salvati nel database del sito e si ritrovano da qualsiasi computer. Gli account li crea solo l'amministratore (nessuna registrazione pubblica).

Componenti: `public/api/` (PHP 7.4+ con PDO MySQL) e `src/cloud/` (client e sincronizzazione).

Attivazione, una volta sola:
1. Nel pannello dell'hosting attiva il database MySQL e annota nome del database, utente e password (su AlterVista di solito il database è `my_nomesito` e l'utente `nomesito`: verifica nel pannello).
2. In GitHub → Settings → Secrets and variables → Actions aggiungi i secrets `DB_NAME`, `DB_USER`, `DB_PASSWORD` (non crearlo se il database non ha password) e `SETUP_TOKEN` (un codice lungo e casuale scelto da te). Variabile facoltativa `DB_HOST` (predefinito `localhost`).
3. Ripubblica (push o Run workflow): la GitHub Action crea `api/config.php` dai secrets. Il file non è mai nel repository.
4. Apri il sito, clicca «Configura account», inserisci il codice `SETUP_TOKEN` e scegli nome e password dell'amministratore. Le tabelle (`el_*`) si creano da sole.
5. Dalla finestra dell'account (pulsante con l'omino) l'amministratore crea, disattiva o elimina gli utenti e ne reimposta la password.

Sicurezza: password con `password_hash`; sessioni proprie nel database (nel cookie un token casuale, nel database solo il suo hash); cookie HttpOnly e SameSite=Strict (Secure in HTTPS); intestazione anti-CSRF obbligatoria sulle richieste che modificano dati; query preparate; limite di 10 tentativi di accesso falliti ogni 15 minuti per indirizzo IP; `lib.php` e `config.php` non accessibili dal web. Con l'accesso i dati locali stanno in uno spazio separato del browser, cancellato all'uscita.

Prova dell'API in locale (serve PHP con pdo_sqlite): `npm run test:api`.
