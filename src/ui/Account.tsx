import { CloudOff, KeyRound, LogIn, LogOut, RefreshCw, ShieldCheck, Trash2, User, UserPlus, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, type AdminUserRow } from '../cloud/api';
import { useAccount } from '../cloud/account';
import { Modal } from './Dialogs';

const inputCls =
  'w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[13px] text-slate-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function ErrorText({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-md bg-red-500/10 px-2.5 py-1.5 text-[12.5px] text-red-300 ring-1 ring-red-500/30">
      {text}
    </p>
  );
}

const btn = 'flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-50';

/** Pulsante dell'account nella barra superiore. */
export function AccountButton() {
  const phase = useAccount((s) => s.phase);
  const user = useAccount((s) => s.user);
  const sync = useAccount((s) => s.sync);
  const [open, setOpen] = useState(false);
  if (phase === 'checking') return null;
  const dot = phase === 'signed-in' ? (sync === 'error' ? 'bg-red-500' : sync === 'saving' ? 'bg-amber-400' : 'bg-emerald-400') : null;
  const title =
    phase === 'unavailable'
      ? 'Account non disponibili su questo sito'
      : phase === 'signed-in'
        ? `Account ${user?.username}: ${sync === 'error' ? 'errore di sincronizzazione' : sync === 'saving' ? 'salvataggio in corso' : 'dati salvati'}`
        : phase === 'setup'
          ? 'Configura gli account (prima volta)'
          : 'Accedi al tuo account';
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={title}
        className="relative flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium text-slate-300 hover:bg-slate-800"
      >
        {phase === 'unavailable' ? <CloudOff size={15} className="text-slate-500" /> : <User size={15} />}
        <span className="hidden max-w-[110px] truncate xl:inline">{phase === 'signed-in' ? user?.username : phase === 'setup' ? 'Configura account' : 'Accedi'}</span>
        {dot && <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${dot}`} />}
      </button>
      {open && <AccountDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function AccountDialog({ onClose }: { onClose: () => void }) {
  const phase = useAccount((s) => s.phase);
  const user = useAccount((s) => s.user);
  return (
    <Modal title={phase === 'signed-in' ? `Account · ${user?.username}` : 'Account'} onClose={onClose}>
      {phase === 'unavailable' && <Unavailable />}
      {phase === 'setup' && <SetupForm />}
      {phase === 'signed-out' && <LoginForm />}
      {phase === 'signed-in' && <SignedIn onClose={onClose} />}
    </Modal>
  );
}

function Unavailable() {
  const reason = useAccount((s) => s.unavailableReason);
  const init = useAccount((s) => s.init);
  return (
    <div className="space-y-3 text-[13px] text-slate-300">
      <p>Gli account non sono disponibili: {reason}</p>
      <p className="text-slate-400">L'app funziona comunque: i progetti restano salvati in questo browser.</p>
      <button className={`${btn} bg-slate-800 text-slate-100 hover:bg-slate-700`} onClick={() => void init()}>
        <RefreshCw size={13} /> Riprova
      </button>
    </div>
  );
}

function LoginForm() {
  const login = useAccount((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-3">
      <p className="text-[13px] text-slate-400">Accedi per salvare progetti e progressi sul tuo account e ritrovarli da qualsiasi computer. Gli account li crea l'amministratore.</p>
      <Field label="Nome utente">
        <input className={inputCls} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
      </Field>
      <Field label="Password">
        <input className={inputCls} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <ErrorText text={error} />
      <button type="submit" disabled={busy} className={`${btn} w-full bg-sky-600 text-white hover:bg-sky-500`}>
        <LogIn size={14} /> {busy ? 'Accesso…' : 'Accedi'}
      </button>
    </form>
  );
}

function SetupForm() {
  const setup = useAccount((s) => s.setup);
  const available = useAccount((s) => s.setupAvailable);
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!available) {
    return (
      <p className="text-[13px] text-slate-300">
        Il database è collegato ma non c'è ancora un amministratore. Per crearlo imposta il secret <code className="text-amber-200">SETUP_TOKEN</code> su GitHub e ripubblica il sito.
      </p>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError('Le due password non coincidono.');
    setBusy(true);
    setError(null);
    try {
      await setup(token.trim(), username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-3">
      <p className="text-[13px] text-slate-300">
        <ShieldCheck size={14} className="mr-1 inline text-amber-300" />
        Configurazione iniziale: crea l'account amministratore. Serve il codice impostato nel secret <code className="text-amber-200">SETUP_TOKEN</code>; dopo questo passaggio il codice non serve più.
      </p>
      <Field label="Codice di configurazione (SETUP_TOKEN)">
        <input className={inputCls} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} required />
      </Field>
      <Field label="Nome utente amministratore">
        <input className={inputCls} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={40} />
      </Field>
      <Field label="Password (almeno 8 caratteri)">
        <input className={inputCls} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
      </Field>
      <Field label="Ripeti la password">
        <input className={inputCls} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
      </Field>
      <ErrorText text={error} />
      <button type="submit" disabled={busy} className={`${btn} w-full bg-amber-400 text-slate-950 hover:bg-amber-300`}>
        {busy ? 'Creazione…' : 'Crea amministratore'}
      </button>
    </form>
  );
}

function SignedIn({ onClose }: { onClose: () => void }) {
  const user = useAccount((s) => s.user)!;
  const sync = useAccount((s) => s.sync);
  const syncError = useAccount((s) => s.syncError);
  const lastSyncAt = useAccount((s) => s.lastSyncAt);
  const logout = useAccount((s) => s.logout);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
        <User size={18} className="text-sky-300" />
        <div className="min-w-0 flex-1 text-[13px]">
          <div className="font-semibold text-slate-100">
            {user.username} {user.role === 'admin' && <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10.5px] text-amber-300">amministratore</span>}
          </div>
          <div className={sync === 'error' ? 'text-red-300' : 'text-slate-400'}>
            {sync === 'error'
              ? `Sincronizzazione non riuscita: ${syncError}. I dati restano in questo browser e verranno inviati al prossimo salvataggio.`
              : sync === 'saving'
                ? 'Salvataggio in corso…'
                : `Libreria, progressi e progetto in corso sono salvati sul tuo account${lastSyncAt ? ` (ultimo invio ${new Date(lastSyncAt).toLocaleTimeString('it-IT')})` : ''}.`}
          </div>
        </div>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await logout();
            onClose();
          }}
          className={`${btn} bg-slate-800 text-slate-100 hover:bg-slate-700`}
        >
          <LogOut size={14} /> Esci
        </button>
      </div>
      <ChangePassword />
      {user.role === 'admin' && <AdminUsers />}
    </div>
  );
}

function ChangePassword() {
  const [old, setOld] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.changePassword(old, next);
      setOld('');
      setNext('');
      setMsg({ ok: true, text: 'Password cambiata.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-200">
        <KeyRound size={14} /> Cambia password
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Password attuale">
          <input className={inputCls} type="password" autoComplete="current-password" value={old} onChange={(e) => setOld(e.target.value)} required />
        </Field>
        <Field label="Nuova password (min. 8)">
          <input className={inputCls} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
        </Field>
        <button type="submit" className={`${btn} bg-slate-800 text-slate-100 hover:bg-slate-700`}>
          Cambia
        </button>
      </div>
      {msg && <p className={`text-[12.5px] ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</p>}
    </form>
  );
}

function AdminUsers() {
  const me = useAccount((s) => s.user)!;
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const refresh = async () => {
    try {
      setUsers((await api.users()).users);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      await api.createUser(username.trim(), password, role);
      setUsername('');
      setPassword('');
      setRole('user');
    });
  };
  const fmtDate = (d: string | null) => (d ? new Date(`${d.replace(' ', 'T')}Z`).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : 'mai');
  return (
    <section className="space-y-3 border-t border-slate-800 pt-4">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-200">
        <Users size={14} /> Gestione utenti
      </h3>
      <form onSubmit={create} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-800 p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <Field label="Nuovo nome utente">
          <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={40} pattern="[A-Za-z0-9._\-]+" title="Lettere, numeri, punto, trattino e trattino basso" />
        </Field>
        <Field label="Password iniziale (min. 8)">
          <input className={inputCls} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </Field>
        <Field label="Ruolo">
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as 'user' | 'admin')}>
            <option value="user">utente</option>
            <option value="admin">amministratore</option>
          </select>
        </Field>
        <button type="submit" className={`${btn} bg-sky-600 text-white hover:bg-sky-500`}>
          <UserPlus size={14} /> Crea
        </button>
      </form>
      <ErrorText text={error} />
      {users === null ? (
        <p className="text-[12.5px] text-slate-500">Caricamento…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-1.5 pr-3">Utente</th>
                <th className="py-1.5 pr-3">Ruolo</th>
                <th className="py-1.5 pr-3">Ultimo accesso</th>
                <th className="py-1.5 pr-3">Stato</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-800">
                  <td className="py-1.5 pr-3 font-semibold text-slate-100">{u.username}</td>
                  <td className="py-1.5 pr-3 text-slate-300">{u.role === 'admin' ? 'amministratore' : 'utente'}</td>
                  <td className="py-1.5 pr-3 text-slate-400">{fmtDate(u.lastLogin)}</td>
                  <td className={`py-1.5 pr-3 ${u.disabled ? 'text-red-300' : 'text-emerald-300'}`}>{u.disabled ? 'disattivato' : 'attivo'}</td>
                  <td className="py-1.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        className="rounded px-2 py-1 text-[11.5px] text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800"
                        onClick={() => {
                          const p = window.prompt(`Nuova password per ${u.username} (almeno 8 caratteri):`);
                          if (p) void act(() => api.setUserPassword(u.id, p));
                        }}
                      >
                        Password
                      </button>
                      {u.id !== me.id && (
                        <>
                          <button className="rounded px-2 py-1 text-[11.5px] text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800" onClick={() => void act(() => api.setUserDisabled(u.id, !u.disabled))}>
                            {u.disabled ? 'Riattiva' : 'Disattiva'}
                          </button>
                          <button
                            title="Elimina utente e dati"
                            className="rounded px-1.5 py-1 text-red-300 ring-1 ring-red-500/40 hover:bg-red-500/10"
                            onClick={() => {
                              if (window.confirm(`Eliminare l'utente «${u.username}» e tutti i suoi progetti e progressi? L'operazione non si può annullare.`)) void act(() => api.deleteUser(u.id));
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
