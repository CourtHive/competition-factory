import { playCall, prepareCall, type RecordedCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants and types
import { FEED_IN_CHAMPIONSHIP, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DOMINANT_DUO, USTA_COLLEGE } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  COMPLETED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  IN_PROGRESS,
  TO_BE_PLAYED,
} from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * WHAT THE SEEDED TEAM WALKS STILL FOUND BETWEEN v1 AND v2 (close-out, 2026-11-18): each difference as its smallest
 * call, played from one prepared record under every pipeline. v2 and the differential leave what v1 leaves: the
 * result, the stored record, the notices and the record's object graph. Each case also states the behaviour itself,
 * so it holds whichever pipeline writes.
 */
afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

const DRAW_ID = 'd';
const CLEARED = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };
const won = (winningSide: number) => generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide }).outcome;

function generate(drawProfile: Record<string, unknown>) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM, tieFormatName: DOMINANT_DUO, ...drawProfile, drawId: DRAW_ID }],
    setState: true,
    nonRandom: 1,
  });
  expect(
    tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: DRAW_ID }).success,
  ).toEqual(true);
}

const duals = (): any[] =>
  tournamentEngine
    .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
    .matchUps.filter((matchUp: any) => !matchUp.collectionId);

/** a dual by structure, round and position; a round robin's by its two drawPositions */
const dual = (structureName: string, roundNumber: number, roundPosition: number): any =>
  duals().find(
    (matchUp) =>
      matchUp.structureName === structureName &&
      matchUp.roundNumber === roundNumber &&
      matchUp.roundPosition === roundPosition,
  );
const line = (held: any, index: number): string =>
  dual(held.structureName, held.roundNumber, held.roundPosition).tieMatchUps[index].matchUpId;

const enter = (matchUpId: string, outcome: Record<string, unknown>, params: Record<string, unknown> = {}) =>
  expect(
    tournamentEngine.setMatchUpStatus({ drawId: DRAW_ID, matchUpId, outcome, ...params }).success,
    JSON.stringify(outcome),
  ).toEqual(true);

/** the stored matchUp (a dual, or a line among a dual's) of a record */
function storedMatchUp(record: string, matchUpId: string): any {
  let found: any;
  const visit = (value: any) => {
    if (!value || typeof value !== 'object' || found) return;
    if (value.matchUpId === matchUpId) found = value;
    else Object.values(value).forEach(visit);
  };
  visit(JSON.parse(record).events);
  return found;
}

/** the call under v1, then under v2 and the differential, which leave what v1 leaves */
function alike(call: RecordedCall) {
  const v1 = playCall(OUTCOME_PIPELINE_V1, call);
  for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
    const actual = playCall(mode, call);
    expect([mode, actual.result]).toEqual([mode, v1.result]);
    expect(actual.record === v1.record, `${mode}: the stored record`).toEqual(true);
    expect(actual.notices).toEqual(v1.notices);
    expect(actual.graph).toEqual(v1.graph);
  }
  return v1;
}

const call = (matchUpId: string, outcome: Record<string, unknown>, params: Record<string, unknown> = {}) => ({
  outcome,
  drawId: DRAW_ID,
  matchUpId,
  ...params,
});

describe('a line of a dual scored manually (auto-calc disabled), cleared', () => {
  // v1's removal on such a line is `attemptToModifyScore`: nothing is taken back, and the line is written as the call
  // names it. The differential compared v1's write with a removal's (the score blanked) and threw
  it.each([
    ['a line nobody scored, cleared with no score', false, { matchUpStatus: TO_BE_PLAYED }, TO_BE_PLAYED],
    ['a scored line, cleared with an empty score', true, CLEARED, TO_BE_PLAYED],
    // a status that keeps the score it finds: the winner goes, and the line is in progress
    ['a scored line, cleared with no score', true, { matchUpStatus: TO_BE_PLAYED }, IN_PROGRESS],
  ])('%s', (_label, scored, outcome, matchUpStatus) => {
    const prepared = prepareCall(() => {
      generate({ drawSize: 4 });
      const first = dual('Main', 1, 1);
      enter(first.matchUpId, { winningSide: 2 }, { disableAutoCalc: true });
      if (scored) enter(line(first, 1), won(1));
      return call(line(first, 1), outcome);
    });
    const v1 = alike(prepared);
    expect(v1.result.success).toEqual(true);
    const written = storedMatchUp(v1.record, prepared.params.matchUpId as string);
    expect(written.matchUpStatus).toEqual(matchUpStatus);
    expect(written.winningSide).toBeUndefined();
    // the dual keeps the result it was given by hand
    const held = storedMatchUp(v1.record, dual('Main', 1, 1).matchUpId);
    expect([held.matchUpStatus, held.winningSide]).toEqual([COMPLETED, 2]);
  });
});

describe("a line's double exit produced nothing, and leaving it touches nothing beyond its dual", () => {
  // v1 unwound it as a draw matchUp's double exit, walking the DUAL's targets: the next dual, which nobody had reached,
  // was given a score and codes, stamped and announced
  it.each([
    ['cleared', { matchUpStatus: TO_BE_PLAYED }],
    ['cleared with an empty score', CLEARED],
    ['given a result', won(1)],
    ['entered as the other double exit', { matchUpStatus: DOUBLE_WALKOVER }],
  ])('%s', (_label, outcome) => {
    const prepared = prepareCall(() => {
      generate({ drawSize: 4 });
      const first = dual('Main', 1, 1);
      enter(line(first, 1), { matchUpStatus: DOUBLE_DEFAULT });
      return call(line(first, 1), outcome);
    });
    const next = dual('Main', 2, 1).matchUpId;
    const before = storedMatchUp(JSON.stringify(prepared.prepared), next);
    const v1 = alike(prepared);
    expect(v1.result.success).toEqual(true);
    // its values and its stamp
    expect(storedMatchUp(v1.record, next)).toEqual(before);
  });

  // the shape the walk met it in: the other first-round dual holds a double exit, so the next dual holds the exit it
  // produced, and the line's double exit stands beside a scored line. A control: this construction held before too
  it('cleared beside a scored line, with a produced exit standing in the next dual', () => {
    const prepared = prepareCall(() => {
      generate({ drawSize: 4 });
      enter(dual('Main', 1, 1).matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
      const second = dual('Main', 1, 2);
      enter(line(second, 1), { matchUpStatus: DOUBLE_DEFAULT });
      enter(line(second, 0), { winningSide: 2 });
      return call(line(second, 1), { matchUpStatus: TO_BE_PLAYED });
    });
    const next = dual('Main', 2, 1).matchUpId;
    const before = storedMatchUp(JSON.stringify(prepared.prepared), next);
    const v1 = alike(prepared);
    expect(v1.result.success).toEqual(true);
    expect(storedMatchUp(v1.record, next)).toEqual(before);
  });
});

describe('a line that un-decides its dual takes back the line-ups the dual sent on', () => {
  // the planners' removal took the team's drawPosition back and left its line-up stored on the side it had held
  it('the winner: its line-up leaves the next dual, where a call on that dual had stored its sides', () => {
    const prepared = prepareCall(() => {
      generate({ drawSize: 8 });
      const first = dual('Main', 1, 4);
      enter(first.matchUpId, { winningSide: 2 });
      // any call on the next dual stores its sides, the arrived team's line-up among them
      enter(line(dual('Main', 2, 2), 1), { matchUpStatus: TO_BE_PLAYED });
      return call(line(first, 1), won(1));
    });
    const next = dual('Main', 2, 2).matchUpId;
    const sidesBefore = storedMatchUp(JSON.stringify(prepared.prepared), next).sides;
    expect(sidesBefore.filter((side: any) => side.lineUp?.length).length).toEqual(1);
    const v1 = alike(prepared);
    expect(v1.result.success).toEqual(true);
    const after = storedMatchUp(v1.record, next);
    expect(after.drawPositions.filter(Boolean)).toEqual([]);
    expect(after.sides.filter((side: any) => side.lineUp?.length)).toEqual([]);
  });

  it('the loser: its line-up leaves the dual its loser link fed', () => {
    const prepared = prepareCall(() => {
      generate({ drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP });
      const first = dual('Main', 1, 2);
      enter(first.matchUpId, { winningSide: 2 });
      return call(line(first, 0), { matchUpStatus: DEFAULTED, winningSide: 1 });
    });
    const fed = dual('Main', 1, 2).loserMatchUpId;
    const sidesBefore = storedMatchUp(JSON.stringify(prepared.prepared), fed).sides;
    expect(sidesBefore.filter((side: any) => side.lineUp?.length).length).toEqual(1);
    const v1 = alike(prepared);
    expect(v1.result.success).toEqual(true);
    expect(storedMatchUp(v1.record, fed).sides.filter((side: any) => side.lineUp?.length)).toEqual([]);
  });
});

describe("a team's line-up written on a dual whose sides are stored", () => {
  // v1's `updateSideLineUp` writes the stored side that holds the number and leaves the other as it is stored; v2
  // rebuilt both sides, numbering a side stored without a number
  it('a winner entered again: the next dual keeps its other side as stored', () => {
    const prepared = prepareCall(() => {
      generate({ drawSize: 8, tieFormatName: USTA_COLLEGE });
      const first = dual('Main', 1, 3);
      enter(first.matchUpId, { winningSide: 1 });
      // a call on the next dual stores its sides: the arrived team's, and one for the seat nobody holds
      enter(dual('Main', 2, 2).matchUpId, CLEARED);
      return call(first.matchUpId, { winningSide: 1 });
    });
    const next = dual('Main', 2, 2).matchUpId;
    const sidesBefore = storedMatchUp(JSON.stringify(prepared.prepared), next).sides;
    const v1 = alike(prepared);
    expect(v1.result.success).toEqual(true);
    const sidesAfter = storedMatchUp(v1.record, next).sides;
    expect(sidesAfter.map((side: any) => side.sideNumber)).toEqual(sidesBefore.map((side: any) => side.sideNumber));
  });
});

describe("a round robin's tally keeps the score of a line whose winner is entered again", () => {
  // the group is tallied with the line as the call leaves it: a call that brings no score leaves the line the score it
  // holds. The planners tallied it with no score, and the group's games and sets went to nothing
  it.each([
    ['the same winner', 2],
    ['the other winner', 1],
  ])('%s, named alone', (_label, winningSide) => {
    const prepared = prepareCall(() => {
      generate({ drawSize: 4, drawType: ROUND_ROBIN, tieFormatName: USTA_COLLEGE });
      const [first] = duals();
      const singles = first.tieMatchUps.find((tieMatchUp: any) => tieMatchUp.matchUpType === 'SINGLES').matchUpId;
      enter(singles, won(2));
      return call(singles, { winningSide });
    });
    const v1 = alike(prepared);
    expect(v1.result.success).toEqual(true);
    const written = storedMatchUp(v1.record, prepared.params.matchUpId as string);
    expect([written.winningSide, written.score.scoreStringSide1]).toEqual([winningSide, '1-6 1-6']);
    const tallies = JSON.parse(v1.record)
      .events[0].drawDefinitions[0].structures[0].structures[0].positionAssignments.map(
        (assignment: any) => assignment.tally,
      )
      .filter((tally: any) => tally?.gamesWon);
    // 6-1 6-1: both teams of the dual hold the games of the line
    expect(tallies.map((tally: any) => tally.gamesWon).sort((a: number, b: number) => a - b)).toEqual([2, 12]);
  });
});
