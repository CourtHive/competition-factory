import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import {
  DRAW_DEFINITION_NOT_FOUND,
  EVENT_NOT_FOUND,
  INVALID_MATCHUP_STATUS,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_ID,
  MISSING_EVENT,
  MISSING_MATCHUP_ID,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';

/**
 * PER-ITEM ATOMICITY. Each outcome of a bulk call is one unit: applied whole, or refused with
 * nothing written. A refused outcome does not stop the call. Every outcome is attempted in order and has its own entry
 * in `results`. The outcomes before and after it stay written. The call still returns the first refusal as its own
 * `error`, `context.outcomeIndex` naming it, and `committed: true` when an outcome was written, so that the engine
 * announces what was written. With `rollbackOnError` the engine restores the whole call.
 *
 * An outcome naming something not there used to refuse the whole call before any outcome was written. It is now
 * refused on its own, and still never skipped silently: its error is its result. Every call below runs with rollback off unless it says otherwise, so nothing but each outcome's own
 * planning keeps a refused outcome from writing.
 */

function setup() {
  setSubscriptions({});
  const {
    tournamentRecord,
    eventIds: [eventId, otherEventId],
    drawIds: [drawId, otherDrawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }, { drawSize: 8 }],
    setState: true,
  });
  const [first, second, third] = tournamentEngine.allDrawMatchUps({
    drawId,
    matchUpFilters: { roundNumbers: [1] },
  }).matchUps;
  const [roundTwo] = tournamentEngine.allDrawMatchUps({ drawId, matchUpFilters: { roundNumbers: [2] } }).matchUps;
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  const { tournamentId } = tournamentRecord;
  const valid = (matchUpId: string) => ({ tournamentId, eventId, drawId, matchUpId, ...outcome });
  return { tournamentId, eventId, otherEventId, drawId, otherDrawId, first, second, third, roundTwo, valid };
}

const recordNow = () => structuredClone(tournamentEngine.getTournament().tournamentRecord);
const winnerOf = (matchUpId: string) =>
  tournamentEngine.findMatchUp({ matchUpId, inContext: false }).matchUp?.winningSide;

describe('bulkMatchUpStatusUpdate commits each outcome on its own', () => {
  useEngineCatch();

  it('positive control: two valid outcomes are both written, each with its result', () => {
    const { first, second, valid } = setup();
    const result = tournamentEngine.bulkMatchUpStatusUpdate({
      outcomes: [valid(first.matchUpId), valid(second.matchUpId)],
    });
    expect(result.success).toEqual(true);
    expect(result.results.map((entry: any) => [entry.outcomeIndex, entry.matchUpId, entry.success])).toEqual([
      [0, first.matchUpId, true],
      [1, second.matchUpId, true],
    ]);
    expect([winnerOf(first.matchUpId), winnerOf(second.matchUpId)]).toEqual([1, 1]);
  });

  it('a malformed envelope is refused before any outcome is looked at', () => {
    setup();
    const before = recordNow();
    for (const outcomes of [undefined, 'not a list', { 0: {} }]) {
      const result: any = tournamentEngine.bulkMatchUpStatusUpdate({ outcomes });
      expect(result.error).toEqual(MISSING_VALUE);
      expect(result.results).toBeUndefined();
    }
    expect(recordNow()).toEqual(before);
  });

  const cases: [string, any, (s: ReturnType<typeof setup>) => any][] = [
    ['an unknown eventId', EVENT_NOT_FOUND, (s) => ({ ...s.valid(s.second.matchUpId), eventId: 'no-such-event' })],
    ['an unknown drawId', DRAW_DEFINITION_NOT_FOUND, (s) => ({ ...s.valid(s.second.matchUpId), drawId: 'no-draw' })],
    [
      "a drawId of another event's draw",
      DRAW_DEFINITION_NOT_FOUND,
      (s) => ({ ...s.valid(s.second.matchUpId), drawId: s.otherDrawId }),
    ],
    ['an unknown matchUpId', MATCHUP_NOT_FOUND, (s) => s.valid('no-such-matchUp')],
    ['no eventId', MISSING_EVENT, (s) => ({ ...s.valid(s.second.matchUpId), eventId: undefined })],
    ['no drawId', MISSING_DRAW_ID, (s) => ({ ...s.valid(s.second.matchUpId), drawId: undefined })],
    ['no matchUpId', MISSING_MATCHUP_ID, (s) => ({ ...s.valid(s.second.matchUpId), matchUpId: undefined })],
    [
      'an unknown tournamentId',
      MISSING_TOURNAMENT_RECORD,
      (s) => ({ ...s.valid(s.second.matchUpId), tournamentId: 'no-such-tournament' }),
    ],
    ['a later outcome refused by setMatchUpStatus', INVALID_MATCHUP_STATUS, (s) => s.valid(s.roundTwo.matchUpId)],
  ];

  for (const [name, error, bad] of cases) {
    it(`${name} is refused with its index; the valid outcome ahead of it is written`, () => {
      const s = setup();
      const result: any = tournamentEngine.bulkMatchUpStatusUpdate({
        outcomes: [s.valid(s.first.matchUpId), bad(s)],
      });
      expect(result.error).toEqual(error);
      expect(result.context).toMatchObject({ outcomeIndex: 1 });
      expect(result.results.map((entry: any) => entry.success ?? entry.error)).toEqual([true, error]);
      expect(winnerOf(s.first.matchUpId)).toEqual(1);
      expect(winnerOf(s.second.matchUpId)).toBeUndefined();
    });

    it(`${name}: valid, refused, valid writes both valid outcomes and nothing for the refused one`, () => {
      const s = setup();
      const badOutcome = bad(s);
      const result: any = tournamentEngine.bulkMatchUpStatusUpdate({
        outcomes: [s.valid(s.first.matchUpId), badOutcome, s.valid(s.third.matchUpId)],
      });
      expect(result.error).toEqual(error);
      expect(result.context).toMatchObject({ outcomeIndex: 1 });
      expect(result.results.map((entry: any) => [entry.outcomeIndex, entry.success ?? entry.error])).toEqual([
        [0, true],
        [1, error],
        [2, true],
      ]);
      expect([winnerOf(s.first.matchUpId), winnerOf(s.third.matchUpId)]).toEqual([1, 1]);
      expect(winnerOf(s.second.matchUpId)).toBeUndefined();
      expect(winnerOf(s.roundTwo.matchUpId)).toBeUndefined();
    });
  }

  it('a dependent outcome is planned against what the outcomes before it committed', () => {
    const s = setup();
    // round two is fed by the first two round-one matchUps: alone it has no participants and is refused
    const fed = tournamentEngine
      .allDrawMatchUps({ drawId: s.drawId, inContext: true })
      .matchUps.find((matchUp: any) => matchUp.matchUpId === s.roundTwo.matchUpId);
    const feeders = tournamentEngine
      .allDrawMatchUps({ drawId: s.drawId, inContext: true, matchUpFilters: { roundNumbers: [1] } })
      .matchUps.filter((matchUp: any) => matchUp.winnerMatchUpId === fed.matchUpId)
      .map((matchUp: any) => matchUp.matchUpId);
    expect(feeders).toHaveLength(2);
    const result: any = tournamentEngine.bulkMatchUpStatusUpdate({
      outcomes: [...feeders.map(s.valid), s.valid(s.roundTwo.matchUpId)],
    });
    expect(result.success).toEqual(true);
    expect(result.results.every((entry: any) => entry.success)).toEqual(true);
    expect(winnerOf(s.roundTwo.matchUpId)).toEqual(1);
  });

  it('a dependent outcome after a refused one is refused as the record then stands', () => {
    const s = setup();
    const fed = tournamentEngine
      .allDrawMatchUps({ drawId: s.drawId, inContext: true, matchUpFilters: { roundNumbers: [1] } })
      .matchUps.filter((matchUp: any) => matchUp.winnerMatchUpId === s.roundTwo.matchUpId)
      .map((matchUp: any) => matchUp.matchUpId);
    const result: any = tournamentEngine.bulkMatchUpStatusUpdate({
      outcomes: [s.valid(fed[0]), { ...s.valid(fed[1]), eventId: 'no-such-event' }, s.valid(s.roundTwo.matchUpId)],
    });
    expect(result.error).toEqual(EVENT_NOT_FOUND);
    expect(result.results.map((entry: any) => entry.success ?? entry.error)).toEqual([
      true,
      EVENT_NOT_FOUND,
      INVALID_MATCHUP_STATUS,
    ]);
    expect(winnerOf(fed[0])).toEqual(1);
    expect(winnerOf(s.roundTwo.matchUpId)).toBeUndefined();
  });

  it('committed outcomes are announced in order; a refused outcome is silent', () => {
    const s = setup();
    const notices: string[] = [];
    setSubscriptions({
      subscriptions: { modifyMatchUp: (payloads: any[]) => notices.push(...payloads.map((p) => p.matchUp.matchUpId)) },
    });
    const result: any = tournamentEngine.bulkMatchUpStatusUpdate({
      outcomes: [s.valid(s.first.matchUpId), s.valid('no-such-matchUp'), s.valid(s.third.matchUpId)],
    });
    expect(result.committed).toEqual(true);
    expect(notices).toContain(s.first.matchUpId);
    expect(notices).toContain(s.third.matchUpId);
    expect(notices.indexOf(s.first.matchUpId)).toBeLessThan(notices.indexOf(s.third.matchUpId));
    expect(notices).not.toContain('no-such-matchUp');
  });

  it('a call whose every outcome is refused commits nothing and announces nothing', () => {
    const s = setup();
    const before = recordNow();
    const notices: string[] = [];
    setSubscriptions({ subscriptions: { modifyMatchUp: (payloads: any[]) => notices.push(...payloads) } });
    const result: any = tournamentEngine.bulkMatchUpStatusUpdate({
      outcomes: [s.valid('no-such-matchUp'), s.valid(s.roundTwo.matchUpId)],
    });
    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
    expect(result.committed).toBeUndefined();
    expect(notices).toEqual([]);
    expect(recordNow()).toEqual(before);
  });

  // rollback requested on the call makes the whole call all or nothing, as it always has
  it('with rollbackOnError a refused outcome restores the whole call', () => {
    const s = setup();
    const before = recordNow();
    const result: any = tournamentEngine.bulkMatchUpStatusUpdate({
      outcomes: [s.valid(s.first.matchUpId), s.valid(s.roundTwo.matchUpId), s.valid(s.third.matchUpId)],
      rollbackOnError: true,
    });
    expect(result.error).toEqual(INVALID_MATCHUP_STATUS);
    expect(recordNow()).toEqual(before);
  });

  it('in a queue without rollback the bulk directive commits its valid outcomes; with rollback none', () => {
    for (const rollbackOnError of [false, true]) {
      const s = setup();
      const before = recordNow();
      const result: any = tournamentEngine.executionQueue(
        [
          {
            method: 'bulkMatchUpStatusUpdate',
            params: { outcomes: [s.valid(s.first.matchUpId), s.valid('no-such-matchUp'), s.valid(s.third.matchUpId)] },
          },
        ],
        rollbackOnError,
      );
      expect(result.error).toEqual(MATCHUP_NOT_FOUND);
      if (rollbackOnError) {
        expect(recordNow()).toEqual(before);
      } else {
        // the refused bulk directive is listed with its per-outcome results, as a direct call returns them
        expect(result.results.map((entry: any) => entry.methodName)).toEqual(['bulkMatchUpStatusUpdate']);
        expect(result.results[0].results.map((entry: any) => entry.success ?? entry.error)).toEqual([
          true,
          MATCHUP_NOT_FOUND,
          true,
        ]);
        expect([winnerOf(s.first.matchUpId), winnerOf(s.third.matchUpId)]).toEqual([1, 1]);
      }
    }
  });
});
