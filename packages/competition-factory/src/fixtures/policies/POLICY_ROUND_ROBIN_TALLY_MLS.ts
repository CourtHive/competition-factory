import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';

/**
 * MLS 2026 Competition Guidelines, regular-season tiebreaking procedures (mlssoccer.com, read 2026-11-04):
 *
 *   3 points a win, 1 a tie; level clubs are separated by
 *   1. total number of wins
 *   2. goal differential
 *   3. goals for
 *   4. head-to-head (intraconference only): points, then goal differential
 *   5. fewest disciplinary points (foul 1, technical staff warning 2, yellow 3, second yellow 7, straight red 7; at
 *      most 7 for a second-yellow incident)
 *   6–9. away goal differential, away goals, home goal differential, home goals for
 *   10. a coin toss (two clubs) or drawing of lots (three or more)
 *
 * Once a club is separated, the clubs still tied go through the procedure again from the start (EXTRACT_ONE).
 *
 * Goals are each half's score (`HAL2A-S:T45`). Disciplinary points are an `external` value, `disciplinaryPoints`, the
 * figure MLS publishes for each club (fewer is better). Head-to-head is for a conference table: a table across both
 * conferences (the Supporters' Shield) must drop the two head-to-head directives. Not applied: the away and home goal
 * steps, since the factory records no home or away side; the lot follows the disciplinary points.
 */
export const POLICY_ROUND_ROBIN_TALLY_MLS = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'MLS Competition Guidelines 2026',
    groupOrderKey: 'classificationPoints',
    resultPoints: {
      rules: [
        { id: 'win', winner: 3, loser: 0 },
        { id: 'tie', isDrawn: true, points: 1 },
      ],
    },
    headToHead: { disabled: true },
    tallyDirectives: [
      { attribute: 'matchUpsWon', idsFilter: false },
      { attribute: 'gamesDiff', idsFilter: false },
      { attribute: 'gamesWon', idsFilter: false },
      { attribute: 'classificationPoints', idsFilter: true },
      { attribute: 'gamesDiff', idsFilter: true },
      { attribute: 'external', externalKey: 'disciplinaryPoints', reversed: true },
    ],
    onSplit: 'EXTRACT_ONE',
    terminal: 'LOT',
  },
};
