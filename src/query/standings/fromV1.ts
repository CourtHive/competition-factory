import type { SplitMode, StandingsDirective, StandingsPolicy, TerminalStep } from './standingsTypes';
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
 * RECORD since the K1 ruling (D4): v1 read any one victory, so a pair that split two meetings was decided by list order.
 */
export const V1_HEAD_TO_HEAD: StandingsDirective = { attribute: 'headToHead', mode: 'RECORD' };

/** the measures a season's ledger adds to the round-robin ledger's: the tie-score values */
export const SEASON_TALLY_MEASURES = ['valueWon', 'valueLost'];

/** every measure a round-robin ledger carries, by name: the counters and the measures derived from them */
export const TALLY_MEASURES = [
  'allDefaults',
  'defaults',
  'walkovers',
  'retirements',
  'matchUpsWon',
  'matchUpsLost',
  'matchUpsDrawn',
  'matchUpsCancelled',
  'matchUpsPct',
  'setsWon',
  'setsLost',
  'setsPct',
  'gamesWon',
  'gamesLost',
  'gamesPct',
  'pointsWon',
  'pointsLost',
  'pointsPct',
  'tieMatchUpsWon',
  'tieMatchUpsLost',
  'tieMatchUpsPct',
  'tieSinglesWon',
  'tieSinglesLost',
  'tieDoublesWon',
  'tieDoublesLost',
  'standingsPoints',
];

/**
 * A stored round-robin tally policy as the standings engine reads it. Nothing is reinterpreted: every v1 behaviour,
 * including its quirks (spec § 1: K3 the key fallback, K11 the conditional disable), is spelled
 * out as a field, so the core needs no knowledge of v1. `primaryKeys` widens the accepted primary measures for a caller
 * whose ledger has more (a season adds the tie-score values).
 */
export function fromV1(tallyPolicy?: RoundRobinTallyPolicy, primaryKeys: string[] = V1_PRIMARY_KEYS): StandingsPolicy {
  const groupOrderKey = tallyPolicy?.groupOrderKey;
  const primary = groupOrderKey && primaryKeys.includes(groupOrderKey) ? groupOrderKey : 'matchUpsWon';
  const headToHeadDisabled = !!(tallyPolicy?.headToHead as { disabled?: boolean } | undefined)?.disabled;
  const stored = (tallyPolicy?.tallyDirectives as StandingsDirective[] | undefined) ?? V1_DEFAULT_DIRECTIVES;
  return {
    primary,
    directives: headToHeadDisabled ? stored : [V1_HEAD_TO_HEAD, ...stored],
    honourDisableHeadToHead: !!tallyPolicy?.headToHead,
    demote: [
      ...(tallyPolicy?.disqualifyWalkovers ? ['walkovers'] : []),
      ...(tallyPolicy?.disqualifyDefaults ? ['defaults'] : []),
    ],
    ...(tallyPolicy?.onSplit !== undefined && { onSplit: tallyPolicy.onSplit as SplitMode }),
    ...(tallyPolicy?.terminal !== undefined && { terminal: tallyPolicy.terminal as TerminalStep }),
  };
}
