import { getCheckedInParticipantIds } from '@Query/matchUp/getCheckedInParticipantIds';
import { getMatchUpParticipantIds } from '@Query/matchUp/getMatchUpParticipantIds';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import { INVALID_ATTESTATION_SUBJECT } from '@Constants/errorConditionConstants';
import { CHECKED_IN, CHECKED_OUT } from '@Constants/presenceConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { CHECK_IN, CHECK_OUT } from '@Constants/timeItemConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { DOUBLES } from '@Constants/matchUpTypes';

/**
 * Seeded DOUBLES on purpose. A singles-seeded check-in test passes against an implementation that
 * stores a plain boolean on the matchUp and would tell you nothing — the nested-participant path IS
 * the mechanism, so the probe has to exercise it, and a partial check-in has to be asserted before a
 * complete one means anything.
 */
function doublesFixture() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, eventType: DOUBLES, matchUpFormat: FORMAT_STANDARD }],
  });
  tournamentEngine.setState(tournamentRecord, false);

  const matchUp = tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps[0];
  const ids = getMatchUpParticipantIds({ matchUp });
  return { drawId, matchUpId: matchUp.matchUpId, ...ids };
}

function readMatchUp(matchUpId: string) {
  return tournamentEngine.findMatchUp({ inContext: true, matchUpId }).matchUp;
}

it('stores check-in as a first-class attestation, not a timeItem', () => {
  const { drawId, matchUpId, individualParticipantIds } = doublesFixture();

  let result: any = tournamentEngine.checkInParticipant({
    participantId: individualParticipantIds?.[0],
    matchUpId,
    drawId,
  });
  expect(result).toMatchObject(SUCCESS);

  const matchUp = readMatchUp(matchUpId);

  // NATIVE holds the log on the first-class collection and writes no legacy timeItem
  expect(matchUp.checkIns.length).toEqual(1);
  expect(matchUp.timeItems ?? []).toEqual([]);

  const [attestation] = matchUp.checkIns;
  expect(attestation.participantId).toEqual(individualParticipantIds?.[0]);
  expect(attestation.state).toEqual(CHECKED_IN);
  expect(attestation.attestationId).toBeTruthy();

  // occurredAt and recordedAt are separate fields, which is the point of the promotion
  expect(attestation.occurredAt).toBeTruthy();
  expect(attestation.recordedAt).toBeTruthy();

  // nobody attested it, and that is recorded honestly as absent rather than synthesised
  expect(attestation.attributedTo).toBeUndefined();
});

it('reports a PARTIAL doubles check-in before it reports a complete one', () => {
  const { drawId, matchUpId, individualParticipantIds, sideParticipantIds } = doublesFixture();

  tournamentEngine.checkInParticipant({ participantId: individualParticipantIds?.[0], matchUpId, drawId });

  let state: any = getCheckedInParticipantIds({ matchUp: readMatchUp(matchUpId) });
  expect(state.allParticipantsCheckedIn).toEqual(false);
  expect(state.checkedInParticipantIds).toEqual([individualParticipantIds?.[0]]);
  // one of two partners is standing at the desk — the side is NOT yet present
  expect(state.checkedInParticipantIds).not.toContain(sideParticipantIds?.[0]);

  tournamentEngine.checkInParticipant({ participantId: individualParticipantIds?.[1], matchUpId, drawId });

  state = getCheckedInParticipantIds({ matchUp: readMatchUp(matchUpId) });
  expect(state.allParticipantsCheckedIn).toEqual(false);
  // both members in ⇒ the PAIR is DERIVED as checked in, without ever being written
  expect(state.checkedInParticipantIds).toContain(sideParticipantIds?.[0]);
  expect(state.checkedInParticipantIds?.length).toEqual(3);
});

it('refuses a PAIR as the subject of a check-in', () => {
  const { drawId, matchUpId, sideParticipantIds } = doublesFixture();

  const result: any = tournamentEngine.checkInParticipant({
    participantId: sideParticipantIds?.[0],
    matchUpId,
    drawId,
  });

  expect(result.error).toEqual(INVALID_ATTESTATION_SUBJECT);
  expect(readMatchUp(matchUpId).checkIns ?? []).toEqual([]);
});

it('keeps check-out as an appended fact, leaving the log intact', () => {
  const { drawId, matchUpId, individualParticipantIds, sideParticipantIds } = doublesFixture();

  for (const participantId of individualParticipantIds ?? []) {
    expect(tournamentEngine.checkInParticipant({ participantId, matchUpId, drawId })).toMatchObject(SUCCESS);
  }

  let state: any = getCheckedInParticipantIds({ matchUp: readMatchUp(matchUpId) });
  expect(state.allParticipantsCheckedIn).toEqual(true);
  expect(state.checkedInParticipantIds?.length).toEqual(6);

  const result: any = tournamentEngine.checkOutParticipant({
    participantId: individualParticipantIds?.[0],
    matchUpId,
    drawId,
  });
  expect(result).toMatchObject(SUCCESS);

  const matchUp = readMatchUp(matchUpId);

  // five facts, not four — the check-out is APPENDED. A log that overwrote would lose the arrival time
  expect(matchUp.checkIns.length).toEqual(5);
  expect(matchUp.checkIns.at(-1).state).toEqual(CHECKED_OUT);
  expect(matchUp.checkIns.filter((a: any) => a.state === CHECKED_IN).length).toEqual(4);

  state = getCheckedInParticipantIds({ matchUp });
  expect(state.allParticipantsCheckedIn).toEqual(false);
  expect(state.checkedInParticipantIds).not.toContain(individualParticipantIds?.[0]);
  expect(state.checkedInParticipantIds).not.toContain(sideParticipantIds?.[0]);
  expect(state.checkedInParticipantIds).toContain(sideParticipantIds?.[1]);
});

it('reads a pre-promotion record whose check-ins are still legacy timeItems', () => {
  const { matchUpId, individualParticipantIds } = doublesFixture();

  // A record as it was stored before 7.0.0: CHECK_IN / CHECK_OUT timeItems, participantId as itemValue.
  // `CHECK_IN` appears in real archived tournament records, so this fallback is not hypothetical.
  const matchUp = readMatchUp(matchUpId);
  matchUp.timeItems = [
    { itemType: CHECK_IN, itemValue: individualParticipantIds?.[0], createdAt: '2023-09-29T16:47:00.398Z' },
    { itemType: CHECK_IN, itemValue: individualParticipantIds?.[1], createdAt: '2023-09-29T16:48:00.000Z' },
    { itemType: CHECK_OUT, itemValue: individualParticipantIds?.[0], createdAt: '2023-09-29T17:10:00.000Z' },
  ];

  const state: any = getCheckedInParticipantIds({ matchUp });
  expect(state.checkedInParticipantIds).toEqual([individualParticipantIds?.[1]]);
  expect(state.allParticipantsCheckedIn).toEqual(false);
});
