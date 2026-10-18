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
} from '@Constants/errorConditionConstants';

/**
 * A bulk call that names something not there is refused, and changes nothing.
 *
 * CA, 2026-10-18: "bulkMatchUpStatusUpdate should throw an error if an eventId or drawId is passed and matches nothing.
 * Should be considered a fix. There should be no state change if the check for drawId and eventId presence runs
 * first." An outcome whose event or draw was not found used to be skipped while the call reported SUCCESS. Every
 * outcome is now located before any is applied, so the bad one is refused with its index in `context` and the valid
 * outcome AHEAD of it is not written. The matchUp is located too: refused from `setMatchUpStatus`, a matchUp not in
 * the draw came back only after the outcomes ahead of it were written.
 *
 * Each case puts a valid outcome first and the bad one second, and is called without `rollbackOnError`, so nothing
 * but the up-front check can keep the first outcome from being written.
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
  const [first, second] = tournamentEngine.allDrawMatchUps({ drawId, matchUpFilters: { roundNumbers: [1] } }).matchUps;
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  const { tournamentId } = tournamentRecord;
  const valid = (matchUpId: string) => ({ tournamentId, eventId, drawId, matchUpId, ...outcome });
  return { tournamentId, eventId, otherEventId, drawId, otherDrawId, first, second, valid };
}

const recordNow = () => structuredClone(tournamentEngine.getTournament().tournamentRecord);

describe('bulkMatchUpStatusUpdate locates every outcome before applying any', () => {
  useEngineCatch();

  it('positive control: two valid outcomes are both written', () => {
    const { first, second, valid } = setup();
    const result = tournamentEngine.bulkMatchUpStatusUpdate({
      outcomes: [valid(first.matchUpId), valid(second.matchUpId)],
    });
    expect(result.success).toEqual(true);
    const winners = tournamentEngine
      .allTournamentMatchUps({ matchUpFilters: { matchUpIds: [first.matchUpId, second.matchUpId] } })
      .matchUps.map((matchUp: any) => matchUp.winningSide);
    expect(winners).toEqual([1, 1]);
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
  ];

  for (const [name, error, bad] of cases) {
    it(`${name} is refused with its index, and the valid outcome ahead of it is not written`, () => {
      const s = setup();
      const before = recordNow();
      const badOutcome = bad(s);
      const result: any = tournamentEngine.bulkMatchUpStatusUpdate({
        outcomes: [s.valid(s.first.matchUpId), badOutcome],
      });
      expect(result.error).toEqual(error);
      expect(result.context).toMatchObject({ outcomeIndex: 1 });
      expect(recordNow()).toEqual(before);
    });
  }

  // what the up-front check cannot know: a refusal setMatchUpStatus raises for a LATER outcome. A round-2 matchUp has
  // no participants yet, so a winner for it is refused, after the round-1 outcome ahead of it was applied
  for (const rollbackOnError of [true, false]) {
    it(`a later outcome refused by setMatchUpStatus, rollbackOnError ${rollbackOnError}`, () => {
      const s = setup();
      const before = recordNow();
      const [roundTwo] = tournamentEngine.allDrawMatchUps({
        drawId: s.drawId,
        matchUpFilters: { roundNumbers: [2] },
      }).matchUps;
      const result: any = tournamentEngine.bulkMatchUpStatusUpdate({
        outcomes: [s.valid(s.first.matchUpId), s.valid(roundTwo.matchUpId)],
        rollbackOnError,
      });
      expect(result.error).toEqual(INVALID_MATCHUP_STATUS); // no participants in a round-2 matchUp yet
      const firstWinner = tournamentEngine.findMatchUp({ matchUpId: s.first.matchUpId, inContext: false }).matchUp
        ?.winningSide;
      if (rollbackOnError) {
        expect(recordNow()).toEqual(before);
      } else {
        expect(firstWinner).toEqual(1);
      }
    });
  }
});
