/** Declinazione solare nel giorno dell'anno n (formula di Cooper) [°]. */
export function declination(n: number): number {
  return 23.45 * Math.sin((Math.PI / 180) * ((360 * (284 + n)) / 365));
}
