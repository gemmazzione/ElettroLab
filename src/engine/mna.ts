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

export class SingularMatrixError extends Error {}

export function solveNodal(
  nodes: string[],
  ground: string,
  branches: Branch[],
  injections: CurrentInjection[],
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
