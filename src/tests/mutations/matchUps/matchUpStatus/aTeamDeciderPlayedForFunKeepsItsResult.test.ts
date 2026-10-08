import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, DEAD_RUBBER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * A TEAM DECIDER PLAYED "JUST FOR FUN" KEEPS THE RESULT ITS LINES GIVE IT.
 *
 * CA, 2026-09-29: *"If someone wanted to clear the DEAD_RUBBER and play the decider 'just for fun', there's no reason
 * to prevent that."* `reconcileDeciders` exempts a mutation OF the decider, and it also settles a decider the cascade
 * changed. In a TEAM draw the decider is played through its lines, and the snapshot of the decider held only the dual:
 * a line's write moved the dual, read as the cascade moving it, and the decider was settled back to a DEAD_RUBBER,
 * wiping the winner the lines had just given it. Found by the checkpoint differential (v1 left the dual undecided, v2
 * planned its projected winner) in `teamMatrix.line.doubleElimination` and `findDrawMatchUpInContext`.
 *
 * DOUBLE_ELIMINATION 4, DOMINANT_DUO (two of three lines win the dual): Main R3 is the final.
 */

const DRAW_ID = 'team-decider';
const duals = (): any[] =>
  tournamentEngine
    .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
    .matchUps.filter((matchUp) => matchUp.matchUpType === TEAM_MATCHUP);
const dual = (structureName: string, roundNumber: number) =>
  duals().find((matchUp) => matchUp.structureName === structureName && matchUp.roundNumber === roundNumber);
const decider = () => dual('Decider', 1);

function setStatus(matchUpId: string, outcome: any) {
  const result: any = tournamentEngine.setMatchUpStatus({ matchUpId, outcome, drawId: DRAW_ID });
  expect(result.error).toBeUndefined();
}

function playLines(dualMatchUpId: string, winningSide: number) {
  const lines = tournamentEngine
    .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
    .matchUps.filter((matchUp) => matchUp.matchUpTieId === dualMatchUpId);
  for (const line of lines) {
    const scoreString = line.matchUpFormat.startsWith('SET3') ? '6-1 6-1' : '8-1';
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString, winningSide });
    setStatus(line.matchUpId, outcome);
  }
}

it('a TEAM decider cleared from DEAD_RUBBER and played through its lines keeps its winner', () => {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: DOUBLE_ELIMINATION,
        tieFormatName: 'DOMINANT_DUO',
        eventType: TEAM_EVENT,
        drawSize: 4,
        drawId: DRAW_ID,
      },
    ],
    setState: true,
  });
  const result: any = tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: DRAW_ID });
  expect(result.success).toEqual(true);

  for (const [structureName, roundNumber] of [
    ['Main', 1],
    ['Main', 2],
    ['Backdraw', 1],
    ['Backdraw', 2],
  ] as const) {
    for (const matchUp of duals().filter((m) => m.structureName === structureName && m.roundNumber === roundNumber)) {
      playLines(matchUp.matchUpId, 1);
    }
  }

  // the undefeated finalist (Main R2's winner) wins the final, so the decider is not needed
  const mainFinalWinner = dual('Main', 2).sides.find((side) => side.sideNumber === dual('Main', 2).winningSide);
  const final = dual('Main', 3);
  const undefeatedSide = final.sides.find((side) => side.participantId === mainFinalWinner.participantId).sideNumber;
  playLines(final.matchUpId, undefeatedSide);
  expect(dual('Main', 3).winningSide).toEqual(undefeatedSide);
  expect(decider().matchUpStatus).toEqual(DEAD_RUBBER);

  // cleared, and played anyway: its lines decide it for side 2
  setStatus(decider().matchUpId, { matchUpStatus: TO_BE_PLAYED, winningSide: undefined });
  expect(decider().matchUpStatus).toEqual(TO_BE_PLAYED);
  playLines(decider().matchUpId, 2);

  expect(decider().matchUpStatus).toEqual(COMPLETED);
  expect(decider().winningSide).toEqual(2);
});
