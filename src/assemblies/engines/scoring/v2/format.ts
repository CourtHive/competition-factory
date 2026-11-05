// constants and types
import type { SegmentRule } from '@Helpers/matchUpFormatCode/matchRule';

/**
 * The scorer's side of a format: which code a configuration scores by, and which inputs a segment accepts. Compiling a
 * code into its rules is format knowledge (`@Helpers/matchUpFormatCode/matchRule`).
 */

/** the default format when neither the configuration nor the competition names one (§ 1.1) */
export const DEFAULT_MATCHUP_FORMAT = 'SET3-S:6/TB7';

/** the configured format: the option, else the competition's, else the default (§ 1.1) */
export function configuredFormat(config: {
  matchUpFormat?: string;
  competitionFormat?: { matchUpFormat?: string };
}): string {
  return config.matchUpFormat ?? config.competitionFormat?.matchUpFormat ?? DEFAULT_MATCHUP_FORMAT;
}

/** whether `rule` is a segment kind that takes `input` (§ 3.3): outs take only set totals; a combined total no game */
export function takesInput(rule: SegmentRule, input: 'point' | 'game'): boolean {
  // outs and a shootout take set totals only
  if (rule.kind === 'outs' || rule.kind === 'shootout') return false;
  return !(input === 'game' && rule.kind === 'combined');
}
