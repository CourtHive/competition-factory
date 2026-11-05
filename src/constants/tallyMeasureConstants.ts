/**
 * The round-robin tally's measure vocabulary, by name: which measures a ledger carries, which may lead an ordering,
 * and which the standings engine computes only when ordering. Data only, so the tally policy validators and the
 * standings engine both read it from contracts.
 */

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

/** measures added by the standings engine (S3c): differences and ratios; any of them may be a primary measure */
export const V2_MEASURES = [
  'setsDiff',
  'gamesDiff',
  'pointsDiff',
  'setsRatio',
  'gamesRatio',
  'pointsRatio',
  // from `resultPoints` (S4b)
  'classificationPoints',
];

/**
 * ratio measures, won over lost: computed only when ordering, never stored (a ratio with nothing lost is unbounded),
 * and the only measures a directive's `zeroDivision` applies to
 */
export const RATIO_INPUTS: Record<string, [string, string]> = {
  setsRatio: ['setsWon', 'setsLost'],
  gamesRatio: ['gamesWon', 'gamesLost'],
  pointsRatio: ['pointsWon', 'pointsLost'],
};

export const RATIO_MEASURES = Object.keys(RATIO_INPUTS);

/**
 * Graph measures (spec § 5.2, D6-2 GRAPH): read from the whole table, each opponent scored by the policy's primary
 * measure. Computed only when ordering; never the primary measure (circular) nor scoped to the tied (`idsFilter`).
 */
export const GRAPH_MEASURES = ['buchholz', 'buchholzCut1', 'buchholzMedian', 'sonnebornBerger'];

/**
 * Tied-set measures: read from the whole table and the caller's groupings, valued for the set being sorted.
 * `commonOpponents` (NFL common games): the record against the opponents every member met. `groupLeader` (NBA division
 * winner), `recordVsGroup` (division or conference record) and `recordVsSet` (against a caller's set) read the caller's
 * groupings. Directive-only: never the primary measure, never stored, never scoped to the tied (`idsFilter`).
 */
export const SET_MEASURES = ['commonOpponents', 'groupLeader', 'recordVsGroup', 'recordVsSet'];

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
  ...V2_MEASURES,
  ...GRAPH_MEASURES,
];
