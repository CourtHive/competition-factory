import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getOutcomePipeline, setStateProvider, setSubscriptions } from '@Global/state/globalState';
import { takeUnitTally } from '@Mutate/matchUps/outcome/plan/recordedUnit';
import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import syncGlobalState from '@Global/state/syncGlobalState';
import { canonicalJson } from '@Tools/canonicalJson';
import * as governors from '@Assemblies/governors';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import asyncEngine from '@Engines/asyncEngine';

// constants
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';

/**
 * Bulk outcomes and ad hoc resets: the refusal controls for one unit of a bulk call. Every
 * call runs with rollback off. Each runs under the suite's pipeline (`OUTCOME_PIPELINE=v1|v2|differential`), and the
 * refusal invariant checks each item at its own boundary (`bulkItem`): a refused item must leave the record, stamps
 * included, exactly as it found it.
 *
 * The late refusal is forced in the schedule write that `setMatchUpState` makes AFTER it has written the outcome's
 * score (`addMatchUpScheduleItems`, applied once the outcome is accepted): before this change the score stayed written under
 * the refusal. The unit is now planned on a copy (`planUnit`), so the refusal is met there.
 */
const forced = vi.hoisted(() => ({ matchUpId: undefined as string | undefined, hits: 0 }));
const FORCED = { code: 'ERR_FORCED', message: 'forced by the test' };
vi.mock('@Mutate/matchUps/schedule/scheduleItems/scheduleItems', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    addMatchUpScheduleItems: (params: any) => {
      if (forced.matchUpId && params?.matchUpId === forced.matchUpId) {
        forced.hits += 1;
        return { error: FORCED };
      }
      return actual.addMatchUpScheduleItems(params);
    },
  };
});

afterEach(() => {
  forced.matchUpId = undefined;
  forced.hits = 0;
  setSubscriptions({});
});

const SCHEDULE = { scheduledDate: '2026-11-07', scheduledTime: '09:00' };
const scored = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;

function generate(setState: boolean | 'borrowed' = true) {
  const { tournamentRecord, drawIds, eventIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawId: 'd' }],
    startDate: '2026-11-06',
    endDate: '2026-11-10',
    nonRandom: 808,
  });
  if (setState === 'borrowed') tournamentEngine.setState(tournamentRecord, false);
  else tournamentEngine.setState(tournamentRecord);
  const [eventId] = eventIds;
  const [drawId] = drawIds;
  const roundOne = tournamentEngine.allDrawMatchUps({ drawId, matchUpFilters: { roundNumbers: [1] } }).matchUps;
  const [roundTwo] = tournamentEngine.allDrawMatchUps({ drawId, matchUpFilters: { roundNumbers: [2] } }).matchUps;
  const item = (matchUpId: string, extra: any = {}) => ({
    tournamentId: tournamentRecord.tournamentId,
    matchUpId,
    eventId,
    drawId,
    ...scored,
    ...extra,
  });
  return { tournamentRecord, roundOne, roundTwo, item };
}

const stored = (matchUpId: string) => tournamentEngine.findMatchUp({ matchUpId, inContext: false }).matchUp;
const recordText = () => canonicalJson(tournamentEngine.getTournament().tournamentRecord);

describe('one bulk outcome is one unit', () => {
  useEngineCatch();

  it('a late refusal after the item wrote its score leaves that item unwritten; the items around it commit', () => {
    const { roundOne, item } = generate();
    const [a, b, c] = roundOne.map((matchUp: any) => matchUp.matchUpId);
    const before = stored(b);
    forced.matchUpId = b;
    takeUnitTally();
    const result: any = tournamentEngine.bulkMatchUpStatusUpdate({
      outcomes: [item(a), item(b, { schedule: SCHEDULE }), item(c)],
    });
    expect(forced.hits).toBeGreaterThan(0); // the forced refusal was reached
    expect(result.error).toEqual(FORCED);
    expect(result.committed).toEqual(true);
    expect(result.results.map((entry: any) => entry.success ?? entry.error)).toEqual([true, FORCED, true]);
    expect(stored(b)).toEqual(before);
    expect([stored(a).winningSide, stored(c).winningSide]).toEqual([1, 1]);
    // under v2 every item is v2's own call (`native`): the refused one is refused from v1's run on a copy
    // (`plan/recordedCall.ts`) before the stored record is written. Under v1 and differential every item is planned on
    // a copy by the bulk writer, and the refused one is refused there
    const tally = takeUnitTally();
    const v2 = getOutcomePipeline() === 'v2';
    expect(tally.native + tally.owned).toEqual(v2 ? 3 : 2);
    expect(tally).toMatchObject({ refused: v2 ? 0 : 1, rehearsed: 0 });
  });

  it('the same inside an executionQueue without rollback', () => {
    const { roundOne, item } = generate();
    const [a, b] = roundOne.map((matchUp: any) => matchUp.matchUpId);
    const before = stored(b);
    forced.matchUpId = b;
    const result: any = tournamentEngine.executionQueue([
      { method: 'bulkMatchUpStatusUpdate', params: { outcomes: [item(a), item(b, { schedule: SCHEDULE })] } },
    ]);
    expect(result.error).toEqual(FORCED);
    expect(result.rolledBack).toEqual(false);
    // the refused bulk directive is listed with its per-outcome results, as a direct call returns them
    expect(result.results.map((entry: any) => entry.methodName)).toEqual(['bulkMatchUpStatusUpdate']);
    expect(result.results[0].results.map((entry: any) => entry.success ?? entry.error)).toEqual([true, FORCED]);
    expect(stored(b)).toEqual(before);
    expect(stored(a).winningSide).toEqual(1);
  });

  it('a borrowed plain record keeps its identity: committed items are written into it, a refused item leaves it', () => {
    const { tournamentRecord, roundOne, item } = generate('borrowed');
    const [a, b] = roundOne.map((matchUp: any) => matchUp.matchUpId);
    const borrowedMatchUp = (matchUpId: string) =>
      tournamentRecord.events?.[0].drawDefinitions?.[0].structures?.[0].matchUps?.find(
        (matchUp) => matchUp.matchUpId === matchUpId,
      );
    const heldA = borrowedMatchUp(a);
    const heldB = borrowedMatchUp(b);
    const beforeB = structuredClone(heldB);
    forced.matchUpId = b;
    const result: any = tournamentEngine.bulkMatchUpStatusUpdate({
      outcomes: [item(a), item(b, { schedule: SCHEDULE })],
    });
    expect(result.error).toEqual(FORCED);
    expect(tournamentEngine.getTournament({ convertExtensions: false }).tournamentRecord.tournamentId).toEqual(
      tournamentRecord.tournamentId,
    );
    // the caller's own objects: the committed item wrote through them, the refused one did not touch them
    expect(borrowedMatchUp(a)).toBe(heldA);
    expect(heldA?.winningSide).toEqual(1);
    expect(borrowedMatchUp(b)).toBe(heldB);
    expect(heldB).toEqual(beforeB);
  });

  it('a stale target: an outcome planned against what the items before it committed is refused, and writes nothing', () => {
    const { roundOne, roundTwo, item } = generate();
    const feeders = tournamentEngine
      .allDrawMatchUps({ drawId: 'd', inContext: true, matchUpFilters: { roundNumbers: [1] } })
      .matchUps.filter((matchUp: any) => matchUp.winnerMatchUpId === roundTwo.matchUpId)
      .map((matchUp: any) => matchUp.matchUpId);
    expect(roundOne.length).toBeGreaterThan(2);
    // the winner a feeder sent on has played in round two: changing the feeder's winner is refused
    const result: any = tournamentEngine.bulkMatchUpStatusUpdate({
      outcomes: [
        item(feeders[0]),
        item(feeders[1]),
        item(roundTwo.matchUpId),
        item(
          feeders[0],
          mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 2 }).outcome,
        ),
      ],
    });
    const text = recordText();
    expect(result.error).toBeDefined();
    expect(result.context).toMatchObject({ outcomeIndex: 3 });
    expect(result.results.slice(0, 3).every((entry: any) => entry.success)).toEqual(true);
    expect(stored(roundTwo.matchUpId).winningSide).toEqual(1);
    expect(stored(feeders[0]).winningSide).toEqual(1);
    expect(recordText()).toEqual(text);
  });

  it('committed items are announced in order and the refused item is not', () => {
    const { roundOne, item } = generate();
    const [a, b, c] = roundOne.map((matchUp: any) => matchUp.matchUpId);
    const modified: string[] = [];
    setSubscriptions({
      subscriptions: {
        [MODIFY_MATCHUP]: (payloads: any[]) => modified.push(...payloads.map((p) => p.matchUp.matchUpId)),
      },
    });
    forced.matchUpId = b;
    tournamentEngine.bulkMatchUpStatusUpdate({ outcomes: [item(a), item(b, { schedule: SCHEDULE }), item(c)] });
    expect(modified).toContain(a);
    expect(modified).toContain(c);
    expect(modified).not.toContain(b);
  });
});

describe('one ad hoc reset is one unit', () => {
  useEngineCatch();

  function adHoc(eventType = 'SINGLES') {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'h', drawSize: 8, drawType: 'AD_HOC', automated: true, roundsCount: 1, eventType }],
      policyDefinitions: { scoring: { requireParticipantsForScoring: false } },
      completeAllMatchUps: true,
      nonRandom: 909,
      setState: true,
    });
    return tournamentEngine.allDrawMatchUps({ drawId: 'h' }).matchUps.map((matchUp: any) => matchUp.matchUpId);
  }

  it('a refusal after the reset blanked the outcome (a side removal) leaves the matchUp as it was', async () => {
    const [first, second] = adHoc();
    const sides = await import('@Mutate/matchUps/sides/removeMatchUpSideParticipant');
    const actual = sides.removeMatchUpSideParticipant;
    const spy = vi
      .spyOn(sides, 'removeMatchUpSideParticipant')
      .mockImplementation((params: any) => (params.matchUpId === second ? { error: FORCED } : actual(params)));
    const before = stored(second);
    const result: any = tournamentEngine.resetAdHocMatchUps({
      drawId: 'h',
      matchUpIds: [first, second],
      removeAssignments: true,
    });
    spy.mockRestore();
    expect(result.error).toEqual(FORCED);
    expect(result.committed).toEqual(true);
    expect(stored(second)).toEqual(before);
    expect(stored(first).winningSide).toBeUndefined();
    expect(stored(first).sides.every((side: any) => !side.participantId)).toEqual(true);
  });

  it('valid, unknown, valid: both valid matchUps are reset, the unknown ID keeps MATCHUP_NOT_FOUND', () => {
    const [first, second] = adHoc();
    const result: any = tournamentEngine.resetAdHocMatchUps({ drawId: 'h', matchUpIds: [first, 'unknown', second] });
    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
    expect(result.committed).toEqual(true);
    expect(result.results.map((entry: any) => [entry.index, entry.matchUpId, entry.success ?? entry.error])).toEqual([
      [0, first, true],
      [1, 'unknown', MATCHUP_NOT_FOUND],
      [2, second, true],
    ]);
    expect(stored(first).winningSide).toBeUndefined();
    expect(stored(second).winningSide).toBeUndefined();
  });

  it('a reset whose every matchUp is refused commits nothing', () => {
    adHoc();
    const before = recordText();
    const result: any = tournamentEngine.resetAdHocMatchUps({ drawId: 'h', matchUpIds: ['unknown', 'other'] });
    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
    expect(result.committed).toBeUndefined();
    expect(recordText()).toEqual(before);
  });

  it('inside a queue without rollback the refused reset directive is listed with its per-matchUp results', () => {
    const [first, second] = adHoc();
    const result: any = tournamentEngine.executionQueue([
      { method: 'resetAdHocMatchUps', params: { drawId: 'h', matchUpIds: [first, 'unknown', second] } },
    ]);
    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
    expect(result.results.map((entry: any) => entry.methodName)).toEqual(['resetAdHocMatchUps']);
    expect(result.results[0].results.map((entry: any) => entry.success ?? entry.error)).toEqual([
      true,
      MATCHUP_NOT_FOUND,
      true,
    ]);
  });
});

describe('async isolation', () => {
  beforeAll(() => setStateProvider(asyncGlobalState));
  afterAll(() => setStateProvider(syncGlobalState));

  it('interleaved bulk calls in separate contexts write only their own records', async () => {
    const records = ['A', 'B'].map(
      (id) =>
        mocksEngine.generateTournamentRecord({
          tournamentAttributes: { tournamentId: id },
          drawProfiles: [{ drawSize: 8, drawId: `d${id}` }],
          nonRandom: 7,
        }).tournamentRecord,
    );
    const run = (record: any, bad: boolean) =>
      asyncGlobalState.runWithInstanceState(async () => {
        asyncEngine.importMethods(governors, true, 1);
        await asyncEngine.setState(record);
        const { matchUps } = await asyncEngine.allDrawMatchUps({
          drawId: record.events[0].drawDefinitions[0].drawId,
          matchUpFilters: { roundNumbers: [1] },
        });
        const outcome = (matchUpId: string) => ({
          tournamentId: record.tournamentId,
          eventId: record.events[0].eventId,
          drawId: record.events[0].drawDefinitions[0].drawId,
          matchUpId,
          ...scored,
        });
        const result: any = await asyncEngine.bulkMatchUpStatusUpdate({
          outcomes: [outcome(matchUps[0].matchUpId), outcome(bad ? 'unknown' : matchUps[1].matchUpId)],
        });
        const after = await asyncEngine.allDrawMatchUps({
          drawId: record.events[0].drawDefinitions[0].drawId,
          matchUpFilters: { roundNumbers: [1] },
        });
        const { tournamentRecords } = await asyncEngine.getState();
        return { result, winners: after.matchUps.map((m: any) => m.winningSide), ids: Object.keys(tournamentRecords) };
      });
    const [a, b] = await Promise.all([run(records[0], true), run(records[1], false)]);
    expect(a.result.error).toEqual(MATCHUP_NOT_FOUND);
    expect(a.result.committed).toEqual(true);
    expect(a.ids).toEqual(['A']);
    expect(a.winners.filter(Boolean)).toEqual([1]);
    expect(b.result.success).toEqual(true);
    expect(b.ids).toEqual(['B']);
    expect(b.winners.filter(Boolean)).toEqual([1, 1]);
  });
});
