import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';

/**
 * USTA League championship tie procedure, as copied into section regulations: USTA/Midwest Section 2026 League Rules and
 * Regulations, Combo section M, "Procedures in the Event of a Tie" (verified at source, Mentat
 * `reports/season-tiebreak-research-2026-11-01.md` § 1.1). The tie is broken by the first of these that does:
 *
 *   1. the most individual matches (lines) won in the entire competition
 *   2. the winner of the head-to-head match
 *   3. the fewest sets lost
 *   4. the fewest games lost
 *   5. the Championship Committee's method; Midwest's: the fewest sets lost in the head-to-head match, then the fewest
 *      games lost in it, then a coin toss by the head referee (a seeded lot here)
 *
 * Scoring conventions from the same regulations: an individual default counts 6-0, 6-0 for the receiver; a match
 * tie-break in lieu of a third set counts as one set and one game. A section that varies the order (Georgia adds
 * game-winning percentage; Southern California gates head-to-head on a sweep) needs its own policy.
 */
export const POLICY_ROUND_ROBIN_TALLY_USTA_LEAGUE = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'USTA League Championship (USTA/Midwest 2026, Combo M)',
    groupOrderKey: 'tieMatchUpsWon',
    headToHead: { disabled: false },
    tallyDirectives: [
      { attribute: 'setsLost', reversed: true, idsFilter: false },
      { attribute: 'gamesLost', reversed: true, idsFilter: false },
      // the committee method: the head-to-head match's own sets and games
      { attribute: 'setsLost', reversed: true, idsFilter: true, maxParticipants: 2 },
      { attribute: 'gamesLost', reversed: true, idsFilter: true, maxParticipants: 2 },
    ],
    terminal: 'LOT',
    setsCreditForDefaults: true,
    gamesCreditForDefaults: true,
    gamesCreditForTiebreakSets: true,
  },
};
