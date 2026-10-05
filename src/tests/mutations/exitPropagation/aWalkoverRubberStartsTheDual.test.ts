import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, IN_PROGRESS, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COLLEGE_DEFAULT, DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOUBLES, TEAM } from '@Constants/matchUpTypes';

/**
 * A RUBBER DECIDED BY A WALKOVER OR A DEFAULT STARTS ITS DUAL, AS A PLAYED RUBBER DOES.
 *
 * Found by the TEAM arm's first run over COLLEGE_DEFAULT (2026-10-05): 96 line-level cells failed
 * `UNDECIDED_WITH_SCORE`, the dual `TO_BE_PLAYED` while carrying a `0-0` score. In COLLEGE_DEFAULT the
 * three doubles rubbers are worth ONE point between them (`collectionValue: 1`), so deciding one of
 * them leaves the dual at 0-0. A played rubber then made the dual IN_PROGRESS; a walkover did not.
 *
 * `isActiveMatchUp` read a rubber's winner as assigned only when its winning SIDE held a
 * participantId. Rubbers carry their players on `lineUp`, so that never holds, and WALKOVER and
 * DEFAULTED are excluded by status (a produced exit has no winner yet). A played rubber is rescued
 * by its score; a walkover has none. DOMINANT_DUO never showed it, because there every rubber is
 * worth a point and the dual's own score is non-zero.
 */

const drawId = 'rubber';

const generate = (tieFormatName: string) => {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: SINGLE_ELIMINATION, drawSize: 4, eventType: TEAM, tieFormatName }],
    nonRandom: 1,
    setState: true,
  });
  const result: any = tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId });
  expect(result.success).toEqual(true);
};

const dual = () =>
  tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true, matchUpFilters: { matchUpTypes: [TEAM] } })
    .matchUps.find((matchUp: any) => matchUp.roundNumber === 1);

const decideADoublesRubber = (outcome: any) => {
  const rubber = dual().tieMatchUps.find((tieMatchUp: any) => tieMatchUp.matchUpType === DOUBLES);
  const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: rubber.matchUpId, outcome, drawId });
  expect(result.success).toEqual(true);
  return dual();
};

const played = { winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1 }] } };

it.each([
  ['a WALKOVER', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['a DEFAULTED', { matchUpStatus: DEFAULTED, winningSide: 2 }],
  ['a RETIRED', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 2, side2Score: 1 }] } }],
  ['a played result (the control)', played],
])('COLLEGE_DEFAULT: %s doubles rubber makes the dual IN_PROGRESS at 0-0', (_, outcome) => {
  generate(COLLEGE_DEFAULT);
  const after = decideADoublesRubber(outcome);
  expect(after.score?.scoreStringSide1).toEqual('0-0');
  expect(after.matchUpStatus).toEqual(IN_PROGRESS);
  expect(after.winningSide).toBeUndefined();
});

it('DOMINANT_DUO: the same walkover was already IN_PROGRESS, carried by the point it scores', () => {
  generate(DOMINANT_DUO);
  const after = decideADoublesRubber({ matchUpStatus: WALKOVER, winningSide: 1 });
  expect(after.score?.scoreStringSide1).toEqual('1-0');
  expect(after.matchUpStatus).toEqual(IN_PROGRESS);
});
