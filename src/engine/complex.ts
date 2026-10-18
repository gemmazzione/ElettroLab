/** Aritmetica complessa minimale per i fasori. */
export interface Complex {
  re: number;
  im: number;
}

export const C = (re: number, im = 0): Complex => ({ re, im });
export const ZERO: Complex = { re: 0, im: 0 };

export const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const sub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
export const mul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
export const div = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
export const neg = (a: Complex): Complex => ({ re: -a.re, im: -a.im });
export const conj = (a: Complex): Complex => ({ re: a.re, im: -a.im });
export const abs = (a: Complex): number => Math.hypot(a.re, a.im);
export const abs2 = (a: Complex): number => a.re * a.re + a.im * a.im;
export const inv = (a: Complex): Complex => div(C(1), a);
export const polar = (mag: number, deg: number): Complex => {
  const r = (deg * Math.PI) / 180;
  return { re: mag * Math.cos(r), im: mag * Math.sin(r) };
};
export const argDeg = (a: Complex): number => (Math.atan2(a.im, a.re) * 180) / Math.PI;
