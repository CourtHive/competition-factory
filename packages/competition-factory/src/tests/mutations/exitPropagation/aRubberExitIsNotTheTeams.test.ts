import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { DOUBLE_ELIMINATION, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';

/**
 * A RUBBER'S EXIT IS NOT THE TEAM'S.
 *
 * When a rubber decides its dual, the dual's participants are directed: the winning team on, the losing
 * team to its loser target. The dual was directed with the RUBBER's status, so a rubber decided by
 * WALKOVER, with `propagateExitStatus`, carried that walkover onto the losing team's next matchUp as a
 * pending exit. That matchUp then went to whoever arrived opposite without being played.
 *
 * Found 2026-10-06 through `findDrawMatchUpInContext`'s TEAM double-elimination lines cell (seed 300071):
 * a walkover rubber decided the winners' final, the losing team arrived in the Backdraw final carrying
 * that walkover, the Backdraw semi-final winner was walked over into the grand final, and the grand
 * final's result later refused with ERR_OCCUPIED_DRAW_POSITION after mutating the draw.
 *
 * A walkover on the DUAL itself is a team exit, and it still propagates.
 */

const drawId = 'rubberExit';

const generate = (drawType: string) => {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType, drawSize: 8, eventType: TEAM, tieFormatName: DOMINANT_DUO }],
    nonRandom: 1,
    setState: true,
  });
  const result: any = tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId });
  expect(result.success).toEqual(true);
};

const teamMatchUps = () =>
  tournamentEngine.allDrawMatchUps({ drawId, inContext: true, matchUpFilters: { matchUpTypes: [TEAM] } }).matchUps;

const firstDual = () =>
  teamMatchUps().find(
    (matchUp: any) => matchUp.stageSequence === 1 && matchUp.roundNumber === 1 && matchUp.roundPosition === 1,
  ) ?? teamMatchUps().find((matchUp: any) => matchUp.roundNumber === 1 && matchUp.roundPosition === 1);

// the loser's next matchUp: the one, outside the dual's own structure, the losing team now stands in
const loserTarget = (dual: any, loserId: string) =>
  teamMatchUps().find(
    (matchUp: any) =>
      matchUp.structureId !== dual.structureId && matchUp.sides?.some((side: any) => side.participantId === loserId),
  );

const score = (matchUpId: string, outcome: any) => {
  const result: any = tournamentEngine.setMatchUpStatus({ propagateExitStatus: true, matchUpId, outcome, drawId });
  expect(result.error, JSON.stringify(outcome)).toBeUndefined();
};

const played = { winningSide: 1 };

describe.each([FIRST_MATCH_LOSER_CONSOLATION, DOUBLE_ELIMINATION])('%s', (drawType) => {
  it('a walkover rubber that decides the dual sends the losing team on without an exit', () => {
    generate(drawType);
    const dual = firstDual();
    const loserId = dual.sides.find((side: any) => side.sideNumber === 2).participantId;
    expect(loserId).toBeDefined();

    // DOMINANT_DUO: every rubber is worth a point, two decide the dual
    const doubles = dual.tieMatchUps.find(({ matchUpType }: any) => matchUpType === DOUBLES);
    const singles = dual.tieMatchUps.find(({ matchUpType }: any) => matchUpType === SINGLES);
    score(doubles.matchUpId, played);
    score(singles.matchUpId, { matchUpStatus: WALKOVER, winningSide: 1 });

    // CONTROL: the walkover rubber decided the dual, and the losing team reached its loser target
    const decided = teamMatchUps().find((matchUp: any) => matchUp.matchUpId === dual.matchUpId);
    expect(decided.matchUpStatus).toEqual(COMPLETED);
    expect(decided.winningSide).toEqual(1);
    const target = loserTarget(dual, loserId);
    expect(target).toBeDefined();

    // the losing team did not walk over: its next matchUp is still to be played, and nobody won it
    expect(target.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(target.winningSide).toBeUndefined();
    expect(target.matchUpStatusCodes ?? []).toEqual([]);
  });

  it('a walkover on the dual itself is the team exit, and propagates', () => {
    generate(drawType);
    const dual = firstDual();
    const loserId = dual.sides.find((side: any) => side.sideNumber === 2).participantId;

    score(dual.matchUpId, { matchUpStatus: WALKOVER, winningSide: 1 });

    const target = loserTarget(dual, loserId);
    expect(target).toBeDefined();
    expect(target.matchUpStatus).toEqual(WALKOVER);
  });
});
