import { add, abs, C, div, mul, neg, sub, type Complex, ZERO } from './complex';

/**
 * Analisi Nodale Modificata ridotta a sole ammettenze e generatori di corrente
 * (i generatori di tensione reali sono convertiti nel loro equivalente di Norton).
 *
 *   Y · V = I
 *
 * Y: matrice delle ammettenze nodali, V: potenziali dei nodi rispetto al riferimento,
 * I: correnti impresse. Il nodo di riferimento non compare nel sistema.
 */

export interface Branch {
  a: string;
  b: string;
  /** Impedenza del ramo [Ω] */
  z: Complex;
}

export interface CurrentInjection {
  /** Nodo in cui la corrente entra */
  node: string;
  i: Complex;
}

/**
 * Trasformatore ideale con rapporto n = U1/U2 e impedenza z riportata al secondario (p = primario, s = secondario).
 * Corrente erogata dal secondario: Is = (Vp/n − Vs)/z; corrente assorbita dal primario: Ip = Is/n.
 * Entra nella matrice delle ammettenze come un doppio bipolo simmetrico.
 */
export interface Coupling {
  p1: string;
  p2: string;
  s1: string;
  s2: string;
  n: number;
  z: Complex;
}

export class SingularMatrixError extends Error {}

export function solveNodal(
  nodes: string[],
  ground: string,
  branches: Branch[],
  injections: CurrentInjection[],
  couplings: Coupling[] = [],
): Map<string, Complex> {
  const index = new Map<string, number>();
  for (const n of nodes) if (n !== ground && !index.has(n)) index.set(n, index.size);
  const n = index.size;
  const Y: Complex[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => ZERO));
  const I: Complex[] = Array.from({ length: n }, () => ZERO);

  const at = (r: number, c: number): Complex => Y[r]![c]!;
  const put = (r: number, c: number, v: Complex) => {
    Y[r]![c] = add(at(r, c), v);
  };

  for (const br of branches) {
    const y = div(C(1), br.z);
    const ia = index.get(br.a);
    const ib = index.get(br.b);
    if (ia !== undefined) put(ia, ia, y);
    if (ib !== undefined) put(ib, ib, y);
    if (ia !== undefined && ib !== undefined) {
      put(ia, ib, neg(y));
      put(ib, ia, neg(y));
    }
  }
  for (const k of couplings) {
    const y = div(C(1), k.z);
    const nodesK = [k.p1, k.p2, k.s1, k.s2].map((x) => index.get(x));
    // Coefficienti: righe/colonne p1, p2, s1, s2; segno +1/−1 sui morsetti, fattore 1/n sul lato primario.
    const w = [1 / k.n, -1 / k.n, -1, 1];
    for (let r = 0; r < 4; r++) {
      const ir = nodesK[r];
      if (ir === undefined) continue;
      for (let c = 0; c < 4; c++) {
        const ic = nodesK[c];
        if (ic === undefined) continue;
        put(ir, ic, mul(y, C(w[r]! * w[c]!)));
      }
    }
  }
  for (const inj of injections) {
    const k = index.get(inj.node);
    if (k !== undefined) I[k] = add(I[k]!, inj.i);
  }

  const x = gaussSolve(Y, I);
  const result = new Map<string, Complex>();
  result.set(ground, ZERO);
  for (const [name, k] of index) result.set(name, x[k]!);
  return result;
}

/** Eliminazione di Gauss con pivoting parziale su matrice complessa densa. */
export function gaussSolve(A: Complex[][], b: Complex[]): Complex[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    let best = abs(M[col]![col]!);
    for (let r = col + 1; r < n; r++) {
      const v = abs(M[r]![col]!);
      if (v > best) {
        best = v;
        piv = r;
      }
    }
    if (best < 1e-14) throw new SingularMatrixError('Sistema singolare: rete non determinata');
    if (piv !== col) [M[col], M[piv]] = [M[piv]!, M[col]!];
    const pivotRow = M[col]!;
    const p = pivotRow[col]!;
    for (let r = col + 1; r < n; r++) {
      const row = M[r]!;
      const f = div(row[col]!, p);
      if (f.re === 0 && f.im === 0) continue;
      for (let c = col; c <= n; c++) row[c] = sub(row[c]!, mul(f, pivotRow[c]!));
    }
  }
  const x: Complex[] = Array.from({ length: n }, () => ZERO);
  for (let r = n - 1; r >= 0; r--) {
    const row = M[r]!;
    let s = row[n]!;
    for (let c = r + 1; c < n; c++) s = sub(s, mul(row[c]!, x[c]!));
    x[r] = div(s, row[r]!);
  }
  return x;
}
