import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * FIBA Official Basketball Rules 2026, Appendix D "Classification of Teams" (verified at source, Mentat
 * `reports/season-tiebreak-research-2026-11-01.md` § 8):
 *
 *   D.1.1  2 classification points for a win, 1 for a loss (including a loss by default), 0 for a loss by forfeit
 *   D.1.3  level teams: the games between them decide; then, in those games, game-points difference and game points
 *          scored; then the same over all group games; then the FIBA ranking (national teams) or a draw
 *   D.1.4  when any team is classified, the procedure repeats from the start for the rest (RESTART)
 *
 * FIBA's "forfeit" and "default" are mapped explicitly here: a forfeit is a WALKOVER, a default a DEFAULTED. A
 * competition that records them otherwise needs its own rules. The FIBA ranking step is an external value and is not
 * applied; the draw is a seeded lot.
 */
export const POLICY_ROUND_ROBIN_TALLY_FIBA = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'FIBA Appendix D (Official Basketball Rules 2026)',
    groupOrderKey: 'classificationPoints',
    resultPoints: {
      rules: [
        { id: 'forfeit', matchUpStatuses: [WALKOVER], winner: 2, loser: 0 },
        { id: 'default', matchUpStatuses: [DEFAULTED], winner: 2, loser: 1 },
        { id: 'played', winner: 2, loser: 1 },
      ],
    },
    // D.1.3 reads the games between the tied teams as a mini-league, pairs included
    headToHead: { disabled: true },
    tallyDirectives: [
      { attribute: 'classificationPoints', idsFilter: true },
      { attribute: 'pointsDiff', idsFilter: true },
      { attribute: 'pointsWon', idsFilter: true },
      { attribute: 'pointsDiff', idsFilter: false },
      { attribute: 'pointsWon', idsFilter: false },
    ],
    onSplit: 'RESTART',
    terminal: 'LOT',
  },
};
