import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

// constants
import { BYE, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';

/**
 * A CARRY RECORDED BESIDE A BYE IS ANNOUNCED (F2, #5574; NOTE 2026-10-18 "unannounced carry writes").
 *
 * RULE 1 of `progressExitStatus` records the carry on the BYE-held matchUp it passes through
 * (`recordCarryBesideBye`). The matchUp stays a BYE, so no state write announces it, and it was changed with no
 * MODIFY_MATCHUP: a notice-driven save (a server projection, an embedding client) never saw the entry. Measured on
 * `exitBeforeArrivalCensus.test.ts` under `NOTICE_COVERAGE=1`: 63 uncovered `setMatchUpStatus` calls before the
 * announcement, 0 after.
 *
 * COMPASS 8/8, the scenario `aCarryPastAnEarlierRoundByeIsRecordedInEitherOrder` pins: `East|1|1` is a double walkover,
 * which places a BYE on side 1 of `West|1|1`; then `East|1|2` is a walkover won by side 1, whose loser carries the
 * WALKOVER through that BYE. Falsified without the announcement: `West|1|1` is absent from the notices.
 */
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (drawId: string, coordinates: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);

afterEach(() => setSubscriptions({}));

it('the BYE-held matchUp a carry is recorded on is announced in the call that records it', () => {
  setSubscriptions({});
  const drawId = 'carry-beside-a-bye-is-announced';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: COMPASS, drawSize: 8, participantsCount: 8 }],
  });
  tournamentEngine.setState(tournamentRecord);

  const setStatus = (coordinates: string, outcome: any) => {
    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: find(drawId, coordinates).matchUpId,
      propagateExitStatus: true,
      outcome,
      drawId,
    });
    expect(result.error, coordinates).toBeUndefined();
  };

  setStatus('East|1|1', { matchUpStatus: DOUBLE_WALKOVER });

  // CONTROL: the BYE stands on West|1|1 and no carry is recorded there yet
  const before = find(drawId, 'West|1|1');
  expect(before.matchUpStatus).toEqual(BYE);
  expect(before.sideExitProvenance?.[2]).toBeUndefined();

  const announced: any[] = [];
  setSubscriptions({
    subscriptions: { [MODIFY_MATCHUP]: (notices: any[]) => notices.forEach((notice) => announced.push(notice)) },
  });
  setStatus('East|1|2', { matchUpStatus: WALKOVER, winningSide: 1 });

  // the carry is recorded beside the BYE (what #5574 writes)...
  const holder = find(drawId, 'West|1|1');
  expect(holder.matchUpStatus).toEqual(BYE);
  expect(holder.sideExitProvenance?.[2]).toEqual({
    sourceMatchUpId: find(drawId, 'East|1|2').matchUpId,
    previousMatchUpStatus: WALKOVER,
    matchUpStatus: WALKOVER,
  });

  // ...and the matchUp it is written on is announced, carrying the entry
  const notice = announced.find((candidate) => candidate.matchUp?.matchUpId === holder.matchUpId);
  expect(notice).toBeDefined();
  expect(notice.matchUp.sideExitProvenance?.[2]).toEqual(holder.sideExitProvenance[2]);
});
