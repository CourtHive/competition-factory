import { STANDINGS_PURPOSE_ADVANCEMENT, STANDINGS_PURPOSE_MOVEMENT } from '@Constants/seasonConstants';
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';

/**
 * Premier League Handbook 2025/26, Section C (rules C.4 to C.7 and C.17; the order verified against the Premier
 * League's own 2025/26 explainer, read 2026-11-04):
 *
 *   C.4–C.6  3 points a win, 1 a draw; clubs level on points are separated by goal difference, then goals scored
 *   C.7      clubs still level share the place
 *   C.17     at the end of the season, and only where the title, relegation or qualification for another competition
 *            depends on it: the points in the matches between the tied clubs, then the away goals in those matches,
 *            then a play-off at a neutral venue
 *
 * Goals are each half's score (`HAL2A-S:T45`), so goal difference is `gamesDiff` and goals scored `gamesWon`. C.17
 * applies to a FINAL season table asked for ADVANCEMENT or MOVEMENT (`STANDINGS_PURPOSE_*`); a caller deciding the
 * title asks with ADVANCEMENT. Not applied: the head-to-head away goals (the factory records no home or away side) and
 * the play-off, which is a match the organiser arranges.
 */
const C17 = { purposes: [STANDINGS_PURPOSE_ADVANCEMENT, STANDINGS_PURPOSE_MOVEMENT], phase: 'FINAL' as const };

export const POLICY_ROUND_ROBIN_TALLY_PREMIER_LEAGUE = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'Premier League Handbook 2025/26 (C.4-C.7, C.17)',
    groupOrderKey: 'classificationPoints',
    resultPoints: {
      rules: [
        { id: 'win', winner: 3, loser: 0 },
        { id: 'draw', isDrawn: true, points: 1 },
      ],
    },
    // no pairwise head-to-head before goal difference: C.17's head-to-head is the purpose-scoped directive below
    headToHead: { disabled: true },
    tallyDirectives: [
      { attribute: 'gamesDiff', idsFilter: false },
      { attribute: 'gamesWon', idsFilter: false },
      { attribute: 'classificationPoints', idsFilter: true, when: C17 },
    ],
    onSplit: 'CONTINUE',
    terminal: 'SHARE',
  },
};
