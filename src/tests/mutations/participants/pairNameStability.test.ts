import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, it, expect } from 'vitest';

// constants
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { COMPETITOR } from '@Constants/participantRoles';

const individual = (participantId: string, standardFamilyName: string, sex: string) => ({
  person: { standardFamilyName, standardGivenName: 'Test', sex },
  participantRole: COMPETITOR,
  participantType: INDIVIDUAL,
  participantId,
});

function setup(members: any[]) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ setState: true });
  tournamentEngine.setState(tournamentRecord);

  const result = tournamentEngine.addParticipants({ participants: members });
  expect(result.success).toEqual(true);

  return { tournamentId: tournamentRecord.tournamentId };
}

function pairNameFor(individualParticipantIds: string[]) {
  const added = tournamentEngine.addParticipants({
    participants: [{ participantType: PAIR, participantRole: COMPETITOR, individualParticipantIds }],
  });
  expect(added.success).toEqual(true);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  });
  const pair = participants.find((p: any) => p.individualParticipantIds?.length === 2);

  return { pair, participantId: pair.participantId };
}

describe('a PAIR name does not reorder after an unrelated edit', () => {
  it('creation and modification agree, even when array order is not alphabetical', () => {
    // Added deliberately out of alphabetical order. Creation used to name the
    // pair from the tournament participants ARRAY order while modification
    // sorted, so these two paths disagreed and the name flipped on any edit.
    setup([individual('p1', 'Zeballos', MALE), individual('p2', 'Granollers', MALE)]);

    const { pair, participantId } = pairNameFor(['p1', 'p2']);
    const nameAtCreation = pair.participantName;

    expect(nameAtCreation).toEqual('Granollers/Zeballos');

    // an edit that says nothing about the members
    const modified = tournamentEngine.modifyParticipant({
      participant: { participantId, participantType: PAIR, individualParticipantIds: ['p1', 'p2'] },
    });
    expect(modified.success).toEqual(true);

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [PAIR] },
    });
    const after = participants.find((p: any) => p.participantId === participantId);

    expect(after.participantName).toEqual(nameAtCreation);
  });

  it('holds for a mixed pair, where the convention is woman-first rather than alphabetical', () => {
    setup([individual('p1', 'Ruud', MALE), individual('p2', 'Swiatek', FEMALE)]);

    const { pair, participantId } = pairNameFor(['p1', 'p2']);

    // alphabetical would be Ruud/Swiatek — the mixed convention inverts it
    expect(pair.participantName).toEqual('Swiatek/Ruud');

    const modified = tournamentEngine.modifyParticipant({
      participant: { participantId, participantType: PAIR, individualParticipantIds: ['p1', 'p2'] },
    });
    expect(modified.success).toEqual(true);

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [PAIR] },
    });
    const after = participants.find((p: any) => p.participantId === participantId);

    expect(after.participantName).toEqual('Swiatek/Ruud');
  });
});
