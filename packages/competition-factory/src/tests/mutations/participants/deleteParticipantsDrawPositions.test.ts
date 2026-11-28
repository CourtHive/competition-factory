import { resolveTieFormat, tieFormatConstants } from '@courthive/competition-catalogue';
import { getAssignedParticipantIds } from '@Query/drawDefinition/getAssignedParticipantIds';
import * as participantsQuery from '@Query/participants/getParticipants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it, vi } from 'vitest';

// constants and types
import { EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT } from '@Constants/errorConditionConstants';
import { MAIN, QUALIFYING, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DrawDefinition, StageTypeUnion } from '@Types/tournamentTypes';
import { DOUBLES, SINGLES, TEAM } from '@Constants/eventConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';

const { DOMINANT_DUO } = tieFormatConstants;

/**
 * `deleteParticipants` refuses to delete a participant who holds a drawPosition, and decides it before any write.
 * The check reads the draw definitions' own `positionAssignments`. It used to read `positionAssignments` on each
 * hydrated participant's `draws` item as well, a field hydration does not write, so that read never refused and
 * only cost a hydration of the participants on every call.
 */

function positioned(drawProfile: Record<string, unknown>, stages?: StageTypeUnion[]) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile] });
  tournamentEngine.setState(tournamentRecord);
  const drawDefinition: DrawDefinition = tournamentEngine.getTournament().tournamentRecord.events[0].drawDefinitions[0];
  const participantId = getAssignedParticipantIds({ drawDefinition, stages }).assignedParticipantIds?.[0];
  expect(participantId).toBeDefined();
  return participantId as string;
}

function expectRefusedUnchanged(participantIds: string[]) {
  const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
  const result = tournamentEngine.deleteParticipants({ participantIds });
  expect(result.error).toEqual(EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT);
  expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toEqual(before);
}

describe('deleteParticipants refuses a participant holding a drawPosition', () => {
  it.each([
    ['a SINGLES main structure', { drawSize: 8, eventType: SINGLES }, [MAIN]],
    ['a ROUND_ROBIN container', { drawSize: 8, drawType: ROUND_ROBIN }, undefined],
    [
      'a qualifying structure',
      { drawSize: 8, qualifyingProfiles: [{ structureProfiles: [{ drawSize: 8, qualifyingPositions: 2 }] }] },
      [QUALIFYING],
    ],
    ['a DOUBLES draw (the PAIR itself)', { drawSize: 8, eventType: DOUBLES }, undefined],
  ])('positioned in %s', (_label, drawProfile, stages) => {
    const participantId = positioned(drawProfile, stages as StageTypeUnion[] | undefined);
    expectRefusedUnchanged([participantId]);
  });

  it('an INDIVIDUAL whose PAIR is positioned in a DOUBLES draw', () => {
    const pairId = positioned({ drawSize: 8, eventType: DOUBLES });
    const pair = tournamentEngine.getParticipants({ participantFilters: { participantIds: [pairId] } }).participants[0];
    expectRefusedUnchanged([pair.individualParticipantIds[0]]);
  });

  it('decides the refusal from the draw definitions, without hydrating participants', () => {
    const participantId = positioned({ drawSize: 8, eventType: SINGLES });
    const hydrate = vi.spyOn(participantsQuery, 'getParticipants');
    try {
      expectRefusedUnchanged([participantId]);
      expect(hydrate).not.toHaveBeenCalled();
    } finally {
      hydrate.mockRestore();
    }
  });
});

describe('deleteParticipants deletes a participant holding no drawPosition', () => {
  it('an ALTERNATE entered after the draw was generated', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, eventType: SINGLES }],
      participantsProfile: { participantsCount: 10 },
    });
    tournamentEngine.setState(tournamentRecord);
    const entered = new Set(tournamentEngine.getEvent({ eventId }).event.entries.map((e) => e.participantId));
    const participantId = tournamentEngine
      .getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } })
      .participants.map((p) => p.participantId)
      .find((id) => !entered.has(id));
    expect(participantId).toBeDefined();
    const added = tournamentEngine.addEventEntries({
      participantIds: [participantId],
      eventId,
      entryStatus: ALTERNATE,
    });
    expect(added.success).toEqual(true);

    const result = tournamentEngine.deleteParticipants({ participantIds: [participantId] });
    expect(result.success).toEqual(true);
    const entries = tournamentEngine.getEvent({ eventId }).event.entries;
    expect(entries.some((e) => e.participantId === participantId)).toEqual(false);
  });

  it('an INDIVIDUAL member of a TEAM positioned in a TEAM draw', () => {
    const teamId = positioned({ drawSize: 4, eventType: TEAM, tieFormat: resolveTieFormat(DOMINANT_DUO) });
    const team = tournamentEngine.getParticipants({ participantFilters: { participantIds: [teamId] } }).participants[0];
    const memberId = team.individualParticipantIds[0];

    const result = tournamentEngine.deleteParticipants({ participantIds: [memberId] });
    expect(result.success).toEqual(true);
    const after = tournamentEngine.getParticipants({ participantFilters: { participantIds: [teamId] } })
      .participants[0];
    expect(after.individualParticipantIds).not.toContain(memberId);
  });
});
