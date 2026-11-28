import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, describe, expect, it } from 'vitest';

// constants
import { CONTRADICTORY_POSITION_ACTION } from '@Constants/errorConditionConstants';
import {
  DEPENDS_ON_RESULT,
  LOSER_DIRECTED,
  PLACED_ACROSS_LINK,
  RESULT_ON_POSITION,
} from '@Query/drawDefinition/positionActionRefusal';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import {
  FIRST_ROUND_LOSER_CONSOLATION,
  ROUND_ROBIN_WITH_PLAYOFF,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

/**
 * A swap that would leave the draw contradicting its own results is refused before anything is written.
 *
 * A structure records its results against drawPositions, but a participant it sent on (a loser to the consolation, a
 * group finisher to the playoff) is recorded in the target structure by who they are. Swapping that participant's seat
 * relabels the results and leaves the target holding them anyway. In FIRST_ROUND_LOSER_CONSOLATION 16, scoring Main
 * R1P4 and R1P1 and then swapping positions 1 and 7 left position 1's loser in the consolation while the main draw
 * said they had won R1P4; reversing R1P4 was then refused with ERR_EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT.
 *
 * The refusal names what the director clears first (`context.mustClear`), in an order that can be cleared; once it is
 * cleared the swap is accepted. A swap whose results stay inside the structure is still a relabel and is accepted.
 */

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];

afterEach(() => {
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline();
});

const played = (winningSide: 1 | 2) => ({
  score: {
    sets: [1, 2].map((setNumber) => ({
      side1Score: winningSide === 1 ? 6 : 2,
      side2Score: winningSide === 1 ? 2 : 6,
      winningSide,
      setNumber,
    })),
  },
  winningSide,
});
const cleared = { matchUpStatus: 'TO_BE_PLAYED', score: { scoreStringSide1: '', scoreStringSide2: '' } };

const drawId = 'd';
const recordNow = () => structuredClone(tournamentEngine.getTournament().tournamentRecord);
const matchUps = () => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
const structureOf = (name: string) =>
  tournamentEngine.getEvent({ drawId }).drawDefinition.structures.find((s: any) => s.structureName === name);
const find = (structureName: string, roundNumber: number, roundPosition: number) =>
  matchUps().find(
    (m: any) => m.structureName === structureName && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
  );
const score = (matchUpId: string, winningSide: 1 | 2) =>
  tournamentEngine.setMatchUpStatus({ outcome: played(winningSide), matchUpId, drawId });
const clear = (matchUpId: string) => tournamentEngine.setMatchUpStatus({ outcome: cleared, matchUpId, drawId });
const swap = (structureName: string, drawPositions: number[]) =>
  tournamentEngine.swapDrawPositionAssignments({
    structureId: structureOf(structureName).structureId,
    drawPositions,
    drawId,
  });
const inconsistencies = () =>
  (tournamentEngine.getDrawInconsistencies({ drawId }).inconsistencies ?? []).filter(
    (i: any) => i.severity === 'error',
  );

function generate(drawType: string, drawSize: number, completeAllMatchUps = false) {
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType, drawSize }],
    completeAllMatchUps,
    setState: true,
  });
}

/** refused, with the record exactly as it was */
function expectRefused(result: any, before: any) {
  expect(result.error).toEqual(CONTRADICTORY_POSITION_ACTION);
  expect(recordNow()).toEqual(before);
  return result.context.mustClear;
}

describe.each(MODES)('a contradictory swap is refused (%s)', (mode) => {
  it('swapping a seat whose loser went to the consolation is refused, and accepted once that result is cleared', () => {
    generate(FIRST_ROUND_LOSER_CONSOLATION, 16);
    setOutcomePipeline(mode);
    expect(score(find('Main', 1, 4).matchUpId, 1).success).toEqual(true);
    const r1p1 = find('Main', 1, 1);
    expect(score(r1p1.matchUpId, 2).success).toEqual(true);

    const mustClear = expectRefused(swap('Main', [1, 7]), recordNow());
    expect(mustClear).toEqual([
      {
        structureId: r1p1.structureId,
        matchUpId: r1p1.matchUpId,
        reason: LOSER_DIRECTED,
        roundPosition: 1,
        roundNumber: 1,
      },
    ]);

    for (const { matchUpId } of mustClear) expect(clear(matchUpId).success).toEqual(true);
    expect(swap('Main', [1, 7]).success).toEqual(true);
    expect(inconsistencies()).toEqual([]);
    // the call the old acceptance broke: reversing R1P4 now sends its new loser to an empty consolation seat
    expect(score(find('Main', 1, 4).matchUpId, 2).success).toEqual(true);
    expect(inconsistencies()).toEqual([]);
  });

  it('a consolation result that depends on the directed loser is listed first', () => {
    generate(FIRST_ROUND_LOSER_CONSOLATION, 16);
    setOutcomePipeline(mode);
    const [r1p1, r1p2] = [find('Main', 1, 1), find('Main', 1, 2)];
    expect(score(r1p1.matchUpId, 2).success).toEqual(true);
    expect(score(r1p2.matchUpId, 2).success).toEqual(true);
    const consolation = matchUps().find(
      (m: any) => m.structureName === 'Consolation' && m.sides?.filter((s: any) => s.participantId).length === 2,
    );
    expect(score(consolation.matchUpId, 1).success).toEqual(true);

    const mustClear = expectRefused(swap('Main', [1, 5]), recordNow());
    expect(mustClear.map(({ matchUpId }) => matchUpId)).toEqual([consolation.matchUpId, r1p1.matchUpId]);

    for (const { matchUpId } of mustClear) expect(clear(matchUpId).success).toEqual(true);
    expect(swap('Main', [1, 5]).success).toEqual(true);
    expect(inconsistencies()).toEqual([]);
  });

  it('a DOUBLE_ELIMINATION loser in the backdraw holds the swap the same way', () => {
    generate(DOUBLE_ELIMINATION, 8);
    setOutcomePipeline(mode);
    const r1p1 = find('Main', 1, 1);
    expect(score(r1p1.matchUpId, 1).success).toEqual(true);
    const mustClear = expectRefused(swap('Main', [2, 3]), recordNow());
    expect(mustClear.map(({ matchUpId, reason }) => [matchUpId, reason])).toEqual([[r1p1.matchUpId, LOSER_DIRECTED]]);
    for (const { matchUpId } of mustClear) expect(clear(matchUpId).success).toEqual(true);
    expect(swap('Main', [2, 3]).success).toEqual(true);
  });

  it('a FEED_IN_CHAMPIONSHIP loser fed in a later round holds the swap', () => {
    generate(FEED_IN_CHAMPIONSHIP, 8);
    setOutcomePipeline(mode);
    expect(score(find('Main', 1, 1).matchUpId, 1).success).toEqual(true);
    expect(score(find('Main', 1, 2).matchUpId, 1).success).toEqual(true);
    const r2p1 = find('Main', 2, 1);
    expect(score(r2p1.matchUpId, 2).success).toEqual(true); // drawPosition 1 loses R2 and is fed to the consolation
    const mustClear = expectRefused(swap('Main', [1, 5]), recordNow());
    expect(mustClear.at(-1)).toMatchObject({ matchUpId: r2p1.matchUpId, reason: LOSER_DIRECTED });
    for (const { matchUpId } of mustClear) expect(clear(matchUpId).success).toEqual(true);
    expect(swap('Main', [1, 5]).success).toEqual(true);
    expect(inconsistencies()).toEqual([]);
  });

  it('results are not moved onto a seat that holds nobody', () => {
    generate(SINGLE_ELIMINATION, 8);
    setOutcomePipeline(mode);
    const main = structureOf('Main');
    expect(
      tournamentEngine.removeDrawPositionAssignment({ structureId: main.structureId, drawPosition: 8, drawId }).success,
    ).toEqual(true);
    const r1p1 = find('Main', 1, 1);
    expect(score(r1p1.matchUpId, 1).success).toEqual(true);
    const mustClear = expectRefused(swap('Main', [1, 8]), recordNow());
    expect(mustClear).toEqual([
      {
        structureId: main.structureId,
        matchUpId: r1p1.matchUpId,
        reason: RESULT_ON_POSITION,
        roundNumber: 1,
        roundPosition: 1,
      },
    ]);
    for (const { matchUpId } of mustClear) expect(clear(matchUpId).success).toEqual(true);
    expect(swap('Main', [1, 8]).success).toEqual(true);
  });

  it('a group finisher placed in the playoff holds a round robin swap until the placement is removed', () => {
    generate(ROUND_ROBIN_WITH_PLAYOFF, 8, true);
    setOutcomePipeline(mode);
    const playoff = tournamentEngine
      .getEvent({ drawId })
      .drawDefinition.structures.find((s: any) => s.structureType !== 'CONTAINER');
    expect(playoff.positionAssignments.filter((a: any) => a.participantId).length).toEqual(2);
    const mustClear = expectRefused(swap('Main', [1, 2]), recordNow());
    // the playoff result first (an active seat cannot be emptied), then the placement itself
    expect(mustClear.map(({ reason, structureId }) => [reason, structureId === playoff.structureId])).toEqual([
      [DEPENDS_ON_RESULT, true],
      [PLACED_ACROSS_LINK, true],
    ]);
    for (const { matchUpId, structureId, drawPosition } of mustClear) {
      const result = matchUpId
        ? clear(matchUpId)
        : tournamentEngine.removeDrawPositionAssignment({ structureId, drawPosition, drawId });
      expect(result.success).toEqual(true);
    }
    expect(swap('Main', [1, 2]).success).toEqual(true);
  });
});

describe.each(MODES)('swaps that relabel nothing outside the structure are accepted (%s)', (mode) => {
  it('SINGLE_ELIMINATION: two seats with results swap, and the draw stays consistent', () => {
    generate(SINGLE_ELIMINATION, 8);
    setOutcomePipeline(mode);
    expect(score(find('Main', 1, 1).matchUpId, 1).success).toEqual(true);
    expect(score(find('Main', 1, 2).matchUpId, 2).success).toEqual(true);
    expect(swap('Main', [1, 3]).success).toEqual(true);
    expect(inconsistencies()).toEqual([]);
  });

  it('FIRST_ROUND_LOSER_CONSOLATION: a swap before any result, and one of seats no result has sent on', () => {
    generate(FIRST_ROUND_LOSER_CONSOLATION, 16);
    setOutcomePipeline(mode);
    expect(swap('Main', [1, 7]).success).toEqual(true);
    expect(score(find('Main', 1, 4).matchUpId, 1).success).toEqual(true);
    expect(swap('Main', [1, 7]).success).toEqual(true); // drawPosition 7 won: nobody it holds was sent on
    expect(swap('Main', [3, 5]).success).toEqual(true);
    expect(inconsistencies()).toEqual([]);
  });

  it('DOUBLE_ELIMINATION: two first-round winners swap', () => {
    generate(DOUBLE_ELIMINATION, 8);
    setOutcomePipeline(mode);
    expect(score(find('Main', 1, 1).matchUpId, 1).success).toEqual(true);
    expect(score(find('Main', 1, 2).matchUpId, 1).success).toEqual(true);
    expect(swap('Main', [1, 3]).success).toEqual(true);
    expect(inconsistencies()).toEqual([]);
  });
});
