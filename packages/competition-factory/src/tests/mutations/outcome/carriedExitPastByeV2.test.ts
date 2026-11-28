import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

// constants
import { BYE, COMPLETED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION, CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';

/**
 * S2c: an exit that meets a BYE, carried (exit-propagation RULE 1) or produced by a double exit, planned by
 * v2 and compared with v1.
 *
 * Not a corpus scenario: every draw with a BYE stores a trailing hole in a second-round `drawPositions`
 * (`[1, undefined]`, serialised `[1, null]`), which fails tournament.schema.json, so the corpus cannot
 * hold its starting record.
 */
const DRAW_ID = 'past-a-bye';

afterEach(() => setOutcomePipeline());

const at = (stage: string, roundNumber: number, roundPosition: number): any =>
  tournamentEngine
    .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
    .matchUps?.find(
      (matchUp: any) =>
        matchUp.stage === stage && matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition,
    );

function setup() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: DRAW_ID, drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, participantsCount: 7 }],
    setState: true,
  });
}

it('sends a carried exit on past a BYE: the holder stays a BYE and the next round holds the exit', () => {
  setup();
  // CONTROL: the loser of MAIN 1/2 is fed opposite a BYE
  expect(at(CONSOLATION, 1, 1).sides.some((side: any) => side.bye)).toEqual(true);

  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
    matchUpId: at(MAIN, 1, 2).matchUpId,
    propagateExitStatus: true,
    drawId: DRAW_ID,
  });
  expect(result.success).toEqual(true);

  const holder = at(CONSOLATION, 1, 1);
  expect(holder.matchUpStatus).toEqual(BYE);
  expect(holder.winningSide).toBeUndefined();
  const onward = at(CONSOLATION, 2, 1);
  const loserSide = onward.sides.find((side: any) => side.participantId)?.sideNumber;
  expect(onward.matchUpStatus).toEqual(WALKOVER);
  expect(onward.winningSide).toEqual(3 - loserSide);
});

it('a completed result relabelled as a WALKOVER carries the exit to the loser already directed', () => {
  setup();
  const matchUpId = at(MAIN, 1, 3).matchUpId;
  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome,
    drawId: DRAW_ID,
    matchUpId,
  });
  expect(result.success).toEqual(true);
  expect(at(MAIN, 1, 3).matchUpStatus).toEqual(COMPLETED);
  const fed = at(CONSOLATION, 1, 2);
  expect(fed.matchUpStatus).toEqual(TO_BE_PLAYED);

  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
    propagateExitStatus: true,
    drawId: DRAW_ID,
    matchUpId,
  });
  expect(result.success).toEqual(true);
  expect(at(MAIN, 1, 3).matchUpStatus).toEqual(WALKOVER);
  // the consolation matchUp the loser was already fed into now holds the exit they carry
  expect(at(CONSOLATION, 1, 2).matchUpStatus).toEqual(WALKOVER);
});
