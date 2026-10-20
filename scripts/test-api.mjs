// Prova di integrazione dell'API account (public/api) con un server PHP locale e un database SQLite temporaneo.
// Uso: npm run test:api   (richiede PHP 7.4+ con l'estensione pdo_sqlite disponibile)
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8000 + Math.floor(Math.random() * 900);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), 'electrolab-api-'));
cpSync('public/api', join(dir, 'api'), { recursive: true });
const dbPath = join(dir, 'test.db').split('\\').join('/');
writeFileSync(
  join(dir, 'api', 'config.php'),
  `<?php\nif (!defined('ELECTROLAB_API')) { http_response_code(404); exit; }\nreturn ['dsn' => 'sqlite:${dbPath}', 'user' => null, 'password' => null, 'setup_token' => 'token-di-prova-123'];\n`,
);
const php = spawn('php', ['-d', 'extension=pdo_sqlite', '-S', `127.0.0.1:${PORT}`, '-t', dir], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1000));

const BASE = `${ORIGIN}/api/index.php`;
const results = [];
const check = (name, cond, extra = '') => results.push(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

function client() {
  let cookie = '';
  return async (action, body, { method, headers = {} } = {}) => {
    const m = method ?? (body === undefined ? 'GET' : 'POST');
    const h = { ...headers };
    if (m === 'POST' && !('X-ElectroLab' in h)) h['X-ElectroLab'] = '1';
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (cookie) h['Cookie'] = cookie;
    const r = await fetch(`${BASE}?action=${action}`, { method: m, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get('set-cookie');
    if (set) {
      const v = set.split(';')[0];
      cookie = v.endsWith('=') || set.includes('expires=Thu, 01 Jan 1970') || /Max-Age=0/i.test(set) ? '' : v;
      if (/electrolab_session=deleted|electrolab_session=;/.test(set)) cookie = '';
    }
    let data = null;
    try { data = await r.json(); } catch { data = null; }
    return { status: r.status, data, set };
  };
}

const admin = client();
const anon = client();

let r = await admin('status');
check('status: configurazione iniziale richiesta', r.data?.setupNeeded === true && r.data?.setupAvailable === true, JSON.stringify(r.data));

r = await anon('setup', { token: 'sbagliato', username: 'admin', password: 'password-lunga-1' });
check('setup con codice errato rifiutato', r.status === 403);

r = await anon('setup', { token: 'token-di-prova-123', username: 'admin', password: 'corta' });
check('setup con password corta rifiutato', r.status === 400);

r = await admin('setup', { token: 'token-di-prova-123', username: 'admin', password: 'password-lunga-1' });
check('setup crea l\'amministratore', r.status === 200 && r.data?.user?.role === 'admin', JSON.stringify(r.data));
check('cookie HttpOnly e SameSite=Strict', /HttpOnly/i.test(r.set ?? '') && /SameSite=Strict/i.test(r.set ?? ''), r.set);

r = await anon('setup', { token: 'token-di-prova-123', username: 'altro', password: 'password-lunga-2' });
check('secondo setup rifiutato', r.status === 409 || r.status === 403, String(r.status));

r = await admin('status');
check('status dopo il setup: utente collegato', r.data?.user?.username === 'admin' && r.data?.setupNeeded === false);

r = await anon('projects');
check('progetti senza accesso → 401', r.status === 401);

r = await admin('user_create', { username: 'mario', password: 'password-mario' }, { headers: { 'X-ElectroLab': '' } });
check('POST senza intestazione anti-CSRF rifiutato', r.status === 403);

r = await admin('user_create', { username: 'mario', password: 'password-mario' });
check('admin crea un utente', r.status === 200);
r = await admin('user_create', { username: 'mario', password: 'password-mario' });
check('nome utente duplicato rifiutato', r.status === 409);
r = await admin('user_create', { username: "x' OR 1=1 --", password: 'password-mario' });
check('nome utente con caratteri non ammessi rifiutato', r.status === 400);

const mario = client();
r = await mario('login', { username: 'mario', password: 'sbagliata!!' });
check('login con password errata → 401', r.status === 401);
r = await mario('login', { username: 'mario', password: 'password-mario' });
check('login corretto', r.status === 200 && r.data?.user?.role === 'user');

r = await mario('users');
check('utente normale non vede la gestione utenti', r.status === 403);

const project = { schemaVersion: 1, id: 'prj_abc123', name: 'Casa di Mario', description: '', panels: [], components: [], wires: [], updatedAt: '2026-10-20T10:00:00Z' };
r = await mario('project_save', { project });
check('salva progetto', r.status === 200);
r = await mario('project_save', { project: { ...project, name: 'Casa di Mario (2)' } });
r = await mario('projects');
check('elenco progetti: aggiornato, nessun duplicato', r.data?.projects?.length === 1 && r.data.projects[0].name === 'Casa di Mario (2)', JSON.stringify(r.data?.projects?.map((p) => p.name)));
r = await mario('project_save', { project: { ...project, id: '../../etc' } });
check('id progetto non valido rifiutato', r.status === 400);

r = await admin('projects');
check('i progetti di un utente non sono visibili agli altri', r.data?.projects?.length === 0);

r = await mario('state_save', { current: project, lessons: { 'el-0-circuito': { best: 3, total: 3, done: true } }, exercises: { 'l1-magnetotermico': { best: 90, attempts: 2 } } });
check('salva progetto in corso e progressi', r.status === 200);
r = await mario('state');
check('legge progetto in corso e progressi', r.data?.current?.id === 'prj_abc123' && r.data?.lessons?.['el-0-circuito']?.done === true && r.data?.exercises?.['l1-magnetotermico']?.best === 90);

r = await mario('password', { old: 'sbagliata!!', new: 'nuova-password-1' });
check('cambio password con vecchia password errata rifiutato', r.status === 403);
r = await mario('password', { old: 'password-mario', new: 'nuova-password-1' });
check('cambio password', r.status === 200);

const usersList = (await admin('users')).data?.users ?? [];
const marioId = usersList.find((u) => u.username === 'mario')?.id;
r = await admin('user_disable', { id: marioId, disabled: true });
r = await mario('projects');
check('utente disattivato: sessione chiusa', r.status === 401);
r = await mario('login', { username: 'mario', password: 'nuova-password-1' });
check('utente disattivato non può accedere', r.status === 401);
await admin('user_disable', { id: marioId, disabled: false });

const adminId = usersList.find((u) => u.username === 'admin')?.id;
r = await admin('user_delete', { id: adminId });
check('l\'admin non può eliminare sé stesso', r.status === 400);

// limite ai tentativi falliti
const bad = client();
let last = 0;
for (let i = 0; i < 12; i++) last = (await bad('login', { username: 'nessuno', password: 'xxxxxxxxx' })).status;
check('dopo 10 tentativi falliti → 429', last === 429, String(last));

r = await admin('user_delete', { id: marioId });
check('admin elimina l\'utente e i suoi dati', r.status === 200);

r = await admin('logout', {});
r = await admin('projects');
check('dopo il logout → 401', r.status === 401);

r = await fetch(`${ORIGIN}/api/lib.php`);
const libText = await r.text();
check('lib.php richiamato direttamente non esegue nulla', libText.trim() === '', `${r.status} ${libText.slice(0, 40)}`);
r = await fetch(`${ORIGIN}/api/config.php`);
check('config.php richiamato direttamente non mostra dati', (await r.text()).trim() === '');

console.log(results.join('\n'));
const failed = results.some((x) => x.startsWith('FAIL'));
console.log(failed ? '\nALCUNE PROVE FALLITE' : '\nTUTTE LE PROVE SUPERATE');
php.kill();
try {
  rmSync(dir, { recursive: true, force: true });
} catch {
  /* file ancora in uso dal server appena chiuso */
}
process.exit(failed ? 1 : 0);
