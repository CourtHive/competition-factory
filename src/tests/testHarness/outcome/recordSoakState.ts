/**
 * What the record soak (`recordSoak.ts`) shares with its test file's module mocks. A module of its own, importing
 * nothing: a mock factory imports it while the modules it mocks are still loading, and `recordSoak.ts` imports those.
 */
export const soakDraw: {
  record?: any;
  drawId?: string;
  /** what `decideOutcomeV2` returned for each call since the last reset */
  decisions: string[];
  /** the mocks engine's `generateTournamentRecord`, as `prepareDraw` calls it: set by `recordSoak.ts` */
  load: () => { drawIds: string[] };
} = { decisions: [], load: () => ({ drawIds: [] }) };

/** what `decideOutcomeV2` handed back: under `v2`, `v1` is a call that fell through to v1 on the stored record */
export function decisionClass(decided: any): string {
  if (decided?.refused) return 'refused';
  if (decided?.owned) return decided.recorded ? 'recorded' : 'native';
  return decided?.compare ? 'compared' : 'v1';
}
