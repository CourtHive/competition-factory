import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * FIVB Volleyball Nations League 2026 Competition Regulations, § 2.5 Team Ranking System (volleyballworld.com, read
 * 2026-11-04):
 *
 *   a.  total number of victories
 *   b.  most points gained: 3 for a 3-0 or 3-1 win, 2 for a 3-2 win, 1 for a 2-3 loss, 0 for a 0-3 or 1-3 loss, 0 for a
 *       forfeited match (scored 25-0, 25-0, 25-0)
 *   c.  I.   set ratio (sets won divided by sets lost)
 *       II.  points ratio (points scored divided by points lost)
 *       III. the match between the tied teams; three or more teams are ranked on the matches among them only
 *       IV.  teams that did not play each other: the FIVB World Ranking
 *
 * The forfeit is mapped explicitly: a forfeited match is a WALKOVER, scored for the winner as a 3-0. Rally points are
 * each set's tiebreak score (`SET5-S:TB25-F:TB15`). A ratio with nothing lost ranks above every other (`MAX`). The
 * World Ranking is an `external` value, `worldRanking`, the team's rank (lower is better). The regulations name no step
 * after it, so a set still tied is left to the engine's default (an organiser's sub-order).
 */
export const POLICY_ROUND_ROBIN_TALLY_FIVB = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'FIVB VNL Competition Regulations 2026 (§ 2.5)',
    groupOrderKey: 'matchUpsWon',
    resultPoints: {
      rules: [
        { id: 'forfeit', matchUpStatuses: [WALKOVER], winner: 3, loser: 0 },
        { id: 'fiveSets', loserSetsWon: [2], winner: 2, loser: 1 },
        { id: 'win', winner: 3, loser: 0 },
      ],
    },
    headToHead: { disabled: true },
    tallyDirectives: [
      { attribute: 'classificationPoints', idsFilter: false },
      { attribute: 'setsRatio', idsFilter: false, zeroDivision: 'MAX' },
      { attribute: 'pointsRatio', idsFilter: false, zeroDivision: 'MAX' },
      { attribute: 'matchUpsWon', idsFilter: true },
      { attribute: 'classificationPoints', idsFilter: true },
      { attribute: 'setsRatio', idsFilter: true, zeroDivision: 'MAX' },
      { attribute: 'pointsRatio', idsFilter: true, zeroDivision: 'MAX' },
      { attribute: 'external', externalKey: 'worldRanking', reversed: true },
    ],
    onSplit: 'CONTINUE',
  },
};
