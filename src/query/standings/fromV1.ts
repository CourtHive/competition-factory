import type { StandingsDirective, StandingsPolicy } from './standingsTypes';
import type { RoundRobinTallyPolicy } from '@Types/roundRobinTallyPolicy';

/** the measures v1 accepts as `groupOrderKey`; any other key silently becomes matchUpsWon (K3) */
export const V1_PRIMARY_KEYS = [
  'tieMatchUpsWon',
  'tieSinglesWon',
  'tieDoublesWon',
  'matchUpsWon',
  'matchUpsDrawn',
  'standingsPoints',
  'pointsWon',
  'gamesWon',
  'setsWon',
  'gamesPct',
  'setsPct',
  'pointsPct',
  'matchUpsPct',
];

/** v1's directives when a policy supplies none */
export const V1_DEFAULT_DIRECTIVES: StandingsDirective[] = [
  { attribute: 'matchUpsPct', idsFilter: false },
  { attribute: 'allDefaults', reversed: true, idsFilter: false },
  { attribute: 'defaults', reversed: true, idsFilter: false },
  { attribute: 'walkovers', reversed: true, idsFilter: false },
  { attribute: 'retirements', reversed: true, idsFilter: false },
  { attribute: 'setsPct', idsFilter: false },
  { attribute: 'gamesPct', idsFilter: false },
  { attribute: 'pointsPct', idsFilter: false },
  { attribute: 'matchUpsPct', idsFilter: true },
  { attribute: 'setsPct', idsFilter: true },
  { attribute: 'gamesPct', idsFilter: true },
  { attribute: 'pointsPct', idsFilter: true },
];

/**
 * The head-to-head v1 applies to two tied participants before any directive, made explicit. A `headToHead` directive
 * reads a pair only: with more participants it is passed over and, unlike a `maxParticipants` skip, not reported.
 */
export const V1_HEAD_TO_HEAD: StandingsDirective = { attribute: 'headToHead', mode: 'FIRST_VICTORY' };

/**
 * A stored round-robin tally policy as the standings engine reads it. Nothing is reinterpreted: every v1 behaviour,
 * including its quirks (spec § 1: K1 the single victory, K3 the key fallback, K11 the conditional disable), is spelled
 * out as a field, so the core needs no knowledge of v1.
 */
export function fromV1(tallyPolicy?: RoundRobinTallyPolicy): StandingsPolicy {
  const groupOrderKey = tallyPolicy?.groupOrderKey;
  const primary = groupOrderKey && V1_PRIMARY_KEYS.includes(groupOrderKey) ? groupOrderKey : 'matchUpsWon';
  const headToHeadDisabled = !!(tallyPolicy?.headToHead as { disabled?: boolean } | undefined)?.disabled;
  const stored = (tallyPolicy?.tallyDirectives as StandingsDirective[] | undefined) ?? V1_DEFAULT_DIRECTIVES;
  return {
    primary,
    directives: headToHeadDisabled ? stored : [V1_HEAD_TO_HEAD, ...stored],
    honourDisableHeadToHead: !!tallyPolicy?.headToHead,
  };
}
