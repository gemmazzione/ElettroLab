import type { ComponentInstance, Project, PvArrayParams } from '../model/types';
import { inverterDcLink } from './dc';
import { DAY_SEASONS, dayProfile, pvEnv, type DaySummary } from './pv';

export type DaySeason = keyof typeof DAY_SEASONS;

/** Potenza degli utilizzatori accesi [W] (consumo costante della giornata tipo). */
export const loadsOnW = (project: Project) =>
  project.components.reduce((a, c) => a + (c.params.kind === 'load' && c.params.p.on ? c.params.p.powerW : 0), 0);

/** Giornata tipo di un inverter con i generatori collegati e i consumi accesi nel progetto. */
export function inverterDay(project: Project, inv: ComponentInstance, season: DaySeason): DaySummary | null {
  if (inv.params.kind !== 'inverter') return null;
  const link = inverterDcLink(project, inv, () => true);
  const arrs = link.arrays.map((a) => (a.params.kind === 'pv-array' ? a.params.p : null)).filter((x): x is PvArrayParams => !!x);
  if (!arrs.length) return null;
  const s = DAY_SEASONS[season];
  const loadW = loadsOnW(project);
  return dayProfile(arrs, inv.params.p, { ...pvEnv(project.pv), ambientC: s.ambientC }, () => loadW, { sunrise: s.sunrise, sunset: s.sunset, peak: s.peak });
}
