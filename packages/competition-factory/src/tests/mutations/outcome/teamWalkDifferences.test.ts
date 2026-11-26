import { resolveTieFormat, tieFormatConstants } from '@courthive/competition-catalogue';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';
import {
  expectPlayedParity,
  playCall,
  prepareCall,
  type RecordedCall,
} from '@Tests/testHarness/outcome/recordedCallHarness';

// constants and types
import { FEED_IN_CHAMPIONSHIP, FIRST_MATCH_LOSER_CONSOLATION, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { NO_VALID_ACTIONS } from '@Constants/errorConditionConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  COMPLETED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  IN_PROGRESS,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

const { DOMINANT_DUO, USTA_COLLEGE } = tieFormatConstants;

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
    drawProfiles: [{ eventType: TEAM, tieFormat: resolveTieFormat(DOMINANT_DUO), ...drawProfile, drawId: DRAW_ID }],
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
    expectPlayedParity(actual, v1);
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

// Class 4: a dual decided by its own call keeps its winner while its lines project none, so these lines no longer un-decide
// it. The line-ups it sent on stay where they were sent (before this rule they left with the un-deciding; the walk found
// the planners' removal leaving them behind, which is why the cases stand here)
describe('a line on a dual decided by its own call leaves the line-ups the dual sent on', () => {
  it('the winner: its line-up stays in the next dual, where a call on that dual had stored its sides', () => {
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
    expect(after.drawPositions.filter(Boolean).length).toEqual(1);
    expect(after.sides.filter((side: any) => side.lineUp?.length).length).toEqual(1);
    expect(storedMatchUp(v1.record, dual('Main', 1, 4).matchUpId).winningSide).toEqual(2);
  });

  it('the loser: its line-up stays in the dual its loser link fed', () => {
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
    expect(storedMatchUp(v1.record, fed).sides.filter((side: any) => side.lineUp?.length).length).toEqual(1);
    expect(storedMatchUp(v1.record, dual('Main', 1, 2).matchUpId).winningSide).toEqual(2);
  });
});

describe("a team's line-up written on a dual whose sides are stored", () => {
  // v1's `updateSideLineUp` writes the stored side that holds the number and leaves the other as it is stored; v2
  // rebuilt both sides, numbering a side stored without a number
  it('a winner entered again: the next dual keeps its other side as stored', () => {
    const prepared = prepareCall(() => {
      generate({ drawSize: 8, tieFormat: resolveTieFormat(USTA_COLLEGE) });
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
      generate({ drawSize: 4, drawType: ROUND_ROBIN, tieFormat: resolveTieFormat(USTA_COLLEGE) });
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

describe("a team's line-up notice keeps the event an earlier notice of the call gave its dual", () => {
  // `updateSideLineUp` announces with no event, and v1 keeps the event of a notice the same call already made for the
  // matchUp. v2 marked the line-up's notice eventless wherever the assignment wrote it
  it('a changed winner: the dual its loser link feeds is announced by its line-up, with no event', () => {
    const prepared = prepareCall(() => {
      generate({
        drawSize: 8,
        participantsCount: 7,
        drawType: FEED_IN_CHAMPIONSHIP,
        tieFormat: resolveTieFormat(USTA_COLLEGE),
      });
      const first = dual('Main', 1, 3);
      enter(first.matchUpId, { matchUpStatus: DEFAULTED, winningSide: 2 });
      const retired = generateOutcomeFromScoreString({ scoreString: '6-1 2-1', winningSide: 1 }).outcome;
      return call(first.matchUpId, { ...retired, matchUpStatus: RETIRED });
    });
    const v1 = alike(prepared);
    expect(v1.result.success).toEqual(true);
    const lineUpNotices = v1.notices.filter((notice) => notice.includes('"context":"updateSidLineUp"'));
    expect(lineUpNotices.length).toEqual(1);
    // the first loser is taken back with nothing of the dual's side record changed, so no notice of it gave an event
    expect(lineUpNotices[0]).not.toContain('"eventId"');
  });
});

// Class 4: the line no longer un-decides the dual. Before this rule the dual went IN_PROGRESS at 0-0 (a doubles line
// that does not yet win its collection's point), where the planners wrote the removal's status, to be played
describe('a line on a dual decided by its own call leaves the dual decided', () => {
  it.each([
    ['a round robin', { drawSize: 4, drawType: ROUND_ROBIN }],
    ['an elimination draw', { drawSize: 8 }],
  ])('%s: a doubles line won on a dual decided by its own call', (_label, profile) => {
    const prepared = prepareCall(() => {
      generate({ ...profile, tieFormat: resolveTieFormat(USTA_COLLEGE) });
      const [first] = duals();
      enter(first.matchUpId, { winningSide: 2 });
      const doubles = first.tieMatchUps.find((tieMatchUp: any) => tieMatchUp.matchUpType === 'DOUBLES').matchUpId;
      return call(doubles, { matchUpStatus: WALKOVER, winningSide: 1 });
    });
    const v1 = alike(prepared);
    expect(v1.result.success).toEqual(true);
    const held = storedMatchUp(v1.record, duals()[0].matchUpId);
    expect([held.matchUpStatus, held.winningSide]).toEqual([COMPLETED, 2]);
  });
});

describe('a dual holding a double exit that has been played on, its auto-calc turned on', () => {
  // the call is dispatched with the winner its lines project, none, whatever winner it names: no action is valid
  // (row 15). v2 read the call's own winner, passed the dispatch and refused it as a status no route accepts (row 6)
  it('a winner named with enableAutoCalc is refused: no action is valid', () => {
    const prepared = prepareCall(() => {
      generate({ drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP });
      // its produced exit meets the other first-round dual's in the next round, and a line is entered in the
      // consolation dual its loser link feeds: the double exit has been played on
      enter(dual('Main', 1, 4).matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
      enter(dual('Main', 1, 3).matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
      enter(line(dual('Consolation', 1, 2), 2), { matchUpStatus: DOUBLE_WALKOVER });
      return call(dual('Main', 1, 4).matchUpId, { winningSide: 1 }, { enableAutoCalc: true });
    });
    const v1 = alike(prepared);
    expect(v1.result.error?.code).toEqual(NO_VALID_ACTIONS.code);
    expect(storedMatchUp(v1.record, prepared.params.matchUpId as string)).toEqual(
      storedMatchUp(JSON.stringify(prepared.prepared), prepared.params.matchUpId as string),
    );
  });
});

describe('a dual decided by its own call, against or beside its lines, stays directed as its lines are played', () => {
  const retired = (winningSide: number) => ({
    ...generateOutcomeFromScoreString({ scoreString: '6-1 2-1', winningSide }).outcome,
    matchUpStatus: RETIRED,
  });

  // v1 cleared the corrected line, tallied the dual without it (no winner: its direction taken back), then read the
  // dual's winner as unchanged and sent nobody on: COMPLETED, its winner out of the next dual, its loser out of the
  // consolation. v2 left the direction standing
  it('a line corrected to the winner the dual was given: the winner and the loser stand where they were sent', () => {
    const prepared = prepareCall(() => {
      generate({ drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION });
      const first = dual('Main', 1, 3);
      enter(line(first, 0), { winningSide: 1 });
      enter(line(first, 1), won(2));
      enter(first.matchUpId, retired(1));
      return call(line(first, 1), won(1));
    });
    const first = dual('Main', 1, 3);
    const placed = (record: string) => [
      storedMatchUp(record, first.winnerMatchUpId).drawPositions,
      JSON.parse(record).events[0].drawDefinitions[0].structures[1].positionAssignments.filter(
        (assignment: any) => assignment.participantId,
      ).length,
    ];
    const before = placed(JSON.stringify(prepared.prepared));
    expect(before[1]).toEqual(1);
    const v1 = alike(prepared);
    expect(v1.result.success).toEqual(true);
    const held = storedMatchUp(v1.record, first.matchUpId);
    expect([held.matchUpStatus, held.winningSide, held.score.scoreStringSide1]).toEqual([COMPLETED, 1, '2-0']);
    expect(placed(v1.record)).toEqual(before);
  });

  // v1 directed the new winner without taking the old one back: with the next dual full the call returned
  // EXISTING_POSITION_ASSIGNMENT after writing the line and the dual. v2 wrote the same and returned success
  it.each([
    ['the next dual full', true],
    ['the next dual holding the old winner alone', false],
  ])('a fresh line that hands the dual to the other side, %s: the new winner replaces the old', (_label, full) => {
    const prepared = prepareCall(() => {
      generate({ drawSize: 4 });
      const first = dual('Main', 1, 1);
      enter(line(first, 2), won(2));
      enter(first.matchUpId, { winningSide: 1 });
      if (full) enter(dual('Main', 1, 2).matchUpId, { winningSide: 2 });
      return call(line(first, 0), { winningSide: 2 });
    });
    const first = dual('Main', 1, 1);
    const [, loserPosition] = first.drawPositions;
    const v1 = alike(prepared);
    expect(v1.result.success).toEqual(true);
    const held = storedMatchUp(v1.record, first.matchUpId);
    expect([held.matchUpStatus, held.winningSide]).toEqual([COMPLETED, 2]);
    const next = storedMatchUp(v1.record, first.winnerMatchUpId).drawPositions.filter(Boolean);
    expect(next).toEqual(full ? [loserPosition, 4] : [loserPosition]);
  });
});

describe('a result relabelled an exit that carries, where the loser already stands', () => {
  // the exit is written on the loser's dual by that dual's own call, which ensures its sides first; the plan stated
  // them only for a loser who arrives
  it('the dual the exit lands on stores its sides', () => {
    const prepared = prepareCall(() => {
      generate({ drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP });
      const first = dual('Main', 1, 4);
      enter(first.matchUpId, { matchUpStatus: WALKOVER, winningSide: 2 });
      return call(first.matchUpId, { matchUpStatus: DEFAULTED, winningSide: 2 }, { propagateExitStatus: true });
    });
    const landed = dual('Main', 1, 4).loserMatchUpId;
    const v1 = alike(prepared);
    expect(v1.result.success).toEqual(true);
    const written = storedMatchUp(v1.record, landed);
    expect(written.matchUpStatus).toEqual(DEFAULTED);
    expect(written.sides.map((side: any) => side.drawPosition).filter(Boolean).length).toEqual(2);
  });
});
