import { getDrawDefinition, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_ELIMINATION, FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A winner flip re-sorts later matchUps' drawPositions, and a DECIDED one whose winner changes side
 * must carry its winningSide — and its score — with it.
 *
 * `swapWinnerLoser` substitutes a position and re-sorts, because side 1 is the lower position. That
 * can move a participant to the other side without changing who won, and the winningSide stayed
 * where it was: it named the participant who had LOST, while the real winner sat in the next round.
 * Shrunk from census 9100583 (FEED_IN_CHAMPIONSHIP) and DE window 9305122, both flag ON.
 */
const drawId = 'swap-resort';
const RETIRED_6_3 = { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' };

type Submission = [structureName: string, roundNumber: number, roundPosition: number, outcome: any];

const CASES: {
  name: string;
  drawType: string;
  participantsCount: number;
  nonRandom: number;
  propagateExitStatus: boolean;
  submissions: Submission[];
  scoredMatchUp?: string;
}[] = [
  {
    name: 'census 9100583 — FEED_IN_CHAMPIONSHIP consolation flip',
    drawType: FEED_IN_CHAMPIONSHIP,
    participantsCount: 6,
    nonRandom: 9100583,
    propagateExitStatus: true,
    submissions: [
      ['Main', 1, 2, { winningSide: 2 }],
      ['Main', 2, 1, { matchUpStatus: RETIRED, winningSide: 1, score: RETIRED_6_3 }],
      ['Main', 1, 3, { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['Main', 2, 2, { matchUpStatus: DOUBLE_WALKOVER }],
      ['Consolation', 3, 1, { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Consolation', 2, 2, { winningSide: 2 }],
    ],
  },
  {
    // the same flip over a downstream matchUp that carries a SET SCORE, so the score must re-side too
    name: 'census 9100583, scored — the downstream score is re-sided with its winner',
    drawType: FEED_IN_CHAMPIONSHIP,
    participantsCount: 6,
    nonRandom: 9100583,
    propagateExitStatus: true,
    scoredMatchUp: 'Consolation|3|1',
    submissions: [
      ['Main', 1, 2, { winningSide: 2 }],
      ['Main', 2, 1, { matchUpStatus: RETIRED, winningSide: 1, score: RETIRED_6_3 }],
      ['Main', 1, 3, { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['Main', 2, 2, { matchUpStatus: DOUBLE_WALKOVER }],
      [
        'Consolation',
        3,
        1,
        {
          winningSide: 2,
          score: {
            sets: [
              { side1Score: 3, side2Score: 6, winningSide: 2 },
              { side1Score: 3, side2Score: 6, winningSide: 2 },
            ],
            scoreStringSide1: '3-6 3-6',
            scoreStringSide2: '6-3 6-3',
          },
        },
      ],
      ['Consolation', 2, 2, { winningSide: 2 }],
    ],
  },
  {
    name: 'DE window 9305122 — Backdraw flip',
    drawType: DOUBLE_ELIMINATION,
    participantsCount: 5,
    nonRandom: 9305122,
    propagateExitStatus: false,
    submissions: [
      ['Main', 1, 3, { matchUpStatus: RETIRED, winningSide: 1, score: RETIRED_6_3 }],
      ['Main', 2, 1, { winningSide: 2 }],
      ['Main', 2, 2, { winningSide: 1 }],
      ['Backdraw', 2, 1, { winningSide: 1 }],
      ['Backdraw', 3, 1, { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Backdraw', 2, 1, { winningSide: 2 }],
    ],
  },
];

it.each(CASES)(
  '$name',
  ({ drawType, participantsCount, nonRandom, propagateExitStatus, submissions, scoredMatchUp }) => {
    setSubscriptions({});
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType, drawSize: 8, participantsCount, drawId }],
      setState: true,
      nonRandom,
    });
    const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
    const matchUps = () => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;

    let scoredWinnerId;
    for (const [index, [structureName, roundNumber, roundPosition, outcome]] of submissions.entries()) {
      const step = `step ${index + 1} ${structureName}|${roundNumber}|${roundPosition}`;
      const matchUp = matchUps().find((m: any) => key(m) === `${structureName}|${roundNumber}|${roundPosition}`);
      const before = hash(getDrawDefinition(drawId));
      const result: any = tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        allowChangePropagation: true,
        propagateExitStatus,
        outcome,
        drawId,
      });
      if (result.error) expect(hash(getDrawDefinition(drawId)), `${step} ${result.error.code}`).toEqual(before);
      expect(tournamentEngine.getDrawInconsistencies({ drawId }).inconsistencies ?? [], step).toEqual([]);

      if (scoredMatchUp) {
        const scored = matchUps().find((m: any) => key(m) === scoredMatchUp);
        if (scored?.winningSide) {
          const winner = scored.sides.find((side: any) => side.sideNumber === scored.winningSide);
          scoredWinnerId ??= winner.participantId;
          // who won never changes, and the score still says the winning side won the set
          expect(winner.participantId, `${step} ${scoredMatchUp} winner`).toEqual(scoredWinnerId);
          const [set] = scored.score.sets;
          const winnerGames = scored.winningSide === 1 ? set.side1Score : set.side2Score;
          expect(winnerGames, `${step} ${scoredMatchUp} score`).toEqual(6);
        }
      }
    }
    // the control: a scored case that never decided its matchUp would pass vacuously
    if (scoredMatchUp) expect(scoredWinnerId, `${scoredMatchUp} was never decided`).toBeDefined();
  },
);
