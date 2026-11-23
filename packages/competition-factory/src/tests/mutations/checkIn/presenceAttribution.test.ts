import { getCheckedInParticipantIds } from '@Query/matchUp/getCheckedInParticipantIds';
import { getMatchUpParticipantIds } from '@Query/matchUp/getMatchUpParticipantIds';
import { writeModeMatrix } from '@Tests/testHarness/writeModeMatrix';
import { legacyMode } from '@Tests/testHarness/legacyMode';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import { DECLARED_ATTRIBUTION, PARTICIPANT_ATTRIBUTION } from '@Constants/presenceConstants';
import { UNSUPPORTED_IN_LEGACY_MODE } from '@Constants/errorConditionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { ContactRelationshipEnum } from '@Types/tournamentTypes';
import { CHECK_IN } from '@Constants/timeItemConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { DOUBLES } from '@Constants/matchUpTypes';

function doublesFixture() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: DOUBLES, matchUpFormat: FORMAT_STANDARD }],
  });
  tournamentEngine.setState(tournamentRecord, false);
  const matchUp = tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps[0];
  const { individualParticipantIds } = getMatchUpParticipantIds({ matchUp });
  return { drawId, matchUpId: matchUp.matchUpId, individualParticipantIds };
}

const readMatchUp = (matchUpId: string) => tournamentEngine.findMatchUp({ inContext: true, matchUpId }).matchUp;

/**
 * The STORED matchUp, read straight off the record.
 *
 * A hydrated matchUp no longer carries `attributedTo` — D-PRIV strips it at the emission boundary, so
 * a test asserting that the attester was STORED has to look at storage. Asserting it through
 * `findMatchUp` would now be asserting the privacy behaviour by accident, and would go green again
 * the day that behaviour regressed.
 */
function storedMatchUp(matchUpId: string): any {
  const { tournamentRecord } = tournamentEngine.getTournament();
  return (tournamentRecord.events ?? [])
    .flatMap((event: any) => event.drawDefinitions ?? [])
    .flatMap((drawDefinition: any) => drawDefinition.structures ?? [])
    .flatMap((structure: any) => structure.matchUps ?? [])
    .find((matchUp: any) => matchUp.matchUpId === matchUpId);
}

it('records a PARENT who is not a participant as the attester of a minor check-in', () => {
  const { drawId, matchUpId, individualParticipantIds } = doublesFixture();
  const participantId = individualParticipantIds?.[0];

  const result: any = tournamentEngine.checkInParticipant({
    attributedTo: {
      attributionType: DECLARED_ATTRIBUTION,
      relationship: ContactRelationshipEnum.PARENT,
      telephone: '+1 555 0100',
      name: 'A. Guardian',
    },
    participantId,
    matchUpId,
    drawId,
  });
  expect(result).toMatchObject(SUCCESS);

  const [attestation] = storedMatchUp(matchUpId).checkIns;

  // the SUBJECT is the player; the ATTESTER is the parent. Conflating them is what this shape prevents
  expect(attestation.participantId).toEqual(participantId);
  expect(attestation.attributedTo.attributionType).toEqual(DECLARED_ATTRIBUTION);
  expect(attestation.attributedTo.relationship).toEqual(ContactRelationshipEnum.PARENT);
  expect(attestation.attributedTo.name).toEqual('A. Guardian');

  // ...and it is WITHHELD from the hydrated emission (D-PRIV), which is a different assertion
  expect(readMatchUp(matchUpId).checkIns[0].attributedTo).toBeUndefined();

  // the parent is NOT a participant and must not have become one
  const participantIds = tournamentEngine
    .getTournament()
    .tournamentRecord.participants.map((p: any) => p.participantId);
  expect(participantIds).not.toContain('A. Guardian');
});

it('honours a supplied occurredAt without letting it become the write time', () => {
  const { drawId, matchUpId, individualParticipantIds } = doublesFixture();
  const OCCURRED = '2026-09-19T09:05:00.000Z';

  tournamentEngine.checkInParticipant({
    participantId: individualParticipantIds?.[0],
    occurredAt: OCCURRED,
    matchUpId,
    drawId,
  });

  const [attestation] = readMatchUp(matchUpId).checkIns;
  expect(attestation.occurredAt).toEqual(OCCURRED);
  // recordedAt is this instance's clock — the sync gap the two fields exist to express
  expect(attestation.recordedAt).not.toEqual(OCCURRED);
});

it('appends once when the same attestationId is replayed', () => {
  const { drawId, matchUpId, individualParticipantIds } = doublesFixture();
  const attestationId = 'attestation-replayed-after-sync';
  const participantId = individualParticipantIds?.[0];

  tournamentEngine.checkInParticipant({ attestationId, participantId, matchUpId, drawId });
  // a replayed mutation carries the id minted at the origin; the second delivery must not double-write
  tournamentEngine.checkOutParticipant({ attestationId, participantId, matchUpId, drawId });
  tournamentEngine.checkInParticipant({ attestationId, participantId, matchUpId, drawId });

  expect(readMatchUp(matchUpId).checkIns.length).toEqual(1);
});

legacyMode('attribution cannot be represented by a timeItem', () => {
  it('refuses an attributed check-in rather than dropping the attester', () => {
    const { drawId, matchUpId, individualParticipantIds } = doublesFixture();

    const result: any = tournamentEngine.checkInParticipant({
      attributedTo: { attributionType: PARTICIPANT_ATTRIBUTION, participantId: individualParticipantIds?.[1] },
      participantId: individualParticipantIds?.[0],
      matchUpId,
      drawId,
    });

    // a silently discarded attester is the fail-quiet shape the architectural standards forbid
    expect(result.error).toEqual(UNSUPPORTED_IN_LEGACY_MODE);
  });

  it('still writes an unattributed check-in as a legacy timeItem', () => {
    const { drawId, matchUpId, individualParticipantIds } = doublesFixture();

    const result: any = tournamentEngine.checkInParticipant({
      participantId: individualParticipantIds?.[0],
      matchUpId,
      drawId,
    });
    expect(result).toMatchObject(SUCCESS);

    const matchUp = readMatchUp(matchUpId);
    expect(matchUp.timeItems.length).toEqual(1);
    expect(matchUp.timeItems[0].itemType).toEqual(CHECK_IN);
    expect(matchUp.timeItems[0].itemValue).toEqual(individualParticipantIds?.[0]);
  });
});

writeModeMatrix((mode) => {
  it(`resolves check-in state identically in every write mode (${mode})`, () => {
    const { drawId, matchUpId, individualParticipantIds } = doublesFixture();

    tournamentEngine.checkInParticipant({ participantId: individualParticipantIds?.[0], matchUpId, drawId });
    tournamentEngine.checkInParticipant({ participantId: individualParticipantIds?.[1], matchUpId, drawId });

    // behavioural, so asserted through the query rather than against either storage shape
    const state: any = getCheckedInParticipantIds({ matchUp: readMatchUp(matchUpId) });
    expect(state.allParticipantsCheckedIn).toEqual(false);
    expect(state.checkedInParticipantIds).toContain(individualParticipantIds?.[0]);
    expect(state.checkedInParticipantIds).toContain(individualParticipantIds?.[1]);

    tournamentEngine.checkOutParticipant({ participantId: individualParticipantIds?.[0], matchUpId, drawId });

    const after: any = getCheckedInParticipantIds({ matchUp: readMatchUp(matchUpId) });
    expect(after.checkedInParticipantIds).not.toContain(individualParticipantIds?.[0]);
    expect(after.checkedInParticipantIds).toContain(individualParticipantIds?.[1]);
  });
});
