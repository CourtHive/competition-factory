import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and types
import { PARTICIPANT_NAME_DERIVED_FROM_PERSON } from '@Constants/infoConstants';

/**
 * `modifyParticipant` derives `participantName` from `person` for an INDIVIDUAL when person names are
 * supplied and `updateParticipantName` is left at its default of true. That precedence is intended —
 * the derived name is canonical.
 *
 * What was not intended is the SILENCE. A caller passing both a `person` block and an explicit
 * `participantName` got `success: true` and no indication that its name had been discarded, so a
 * partial no-op was indistinguishable from a full success. This was mistaken for a stamp defect while
 * building the participantsVersion handshake — the mutation had simply not done what it appeared to.
 */
describe('modifyParticipant — participantName precedence is surfaced', () => {
  function loadParticipant() {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      participantsProfile: { nonRandom: 1 },
      setState: true,
    });
    const participant = (tournamentRecord.participants ?? []).find((p: any) => p.participantType === 'INDIVIDUAL');
    return { participant, tournamentRecord };
  }

  function currentName(participantId: string) {
    const state: any = tournamentEngine.getState();
    const record = state.tournamentRecords ? Object.values(state.tournamentRecords)[0] : state.tournamentRecord;
    return (record as any).participants.find((p: any) => p.participantId === participantId)?.participantName;
  }

  it('reports info when a supplied participantName is superseded by the person-derived name', () => {
    const { participant } = loadParticipant();

    const result: any = tournamentEngine.modifyParticipant({
      participant: { ...participant, participantName: 'SUPPLIED NAME' },
      participantId: participant.participantId,
    });

    expect(result.success).toEqual(true);
    // the precedence itself is unchanged — the derived name still wins
    expect(currentName(participant.participantId)).not.toEqual('SUPPLIED NAME');
    // ...but it is no longer silent
    expect(result.info).toEqual(PARTICIPANT_NAME_DERIVED_FROM_PERSON);
  });

  it('applies a supplied participantName when no person block competes with it', () => {
    // Guards the direction: this must stay a report of a real supersede, not a blanket warning.
    const { participant } = loadParticipant();

    const result: any = tournamentEngine.modifyParticipant({
      participant: {
        participantId: participant.participantId,
        participantType: participant.participantType,
        participantRole: participant.participantRole,
        participantName: 'ACCEPTED NAME',
      },
      participantId: participant.participantId,
    });

    expect(result.success).toEqual(true);
    expect(currentName(participant.participantId)).toEqual('ACCEPTED NAME');
    expect(result.info).toBeUndefined();
  });

  it('adds nothing to the response when no participantName was supplied at all', () => {
    // The ordinary case must keep the exact shape it has always had.
    const { participant } = loadParticipant();

    const result: any = tournamentEngine.modifyParticipant({
      participant: { ...participant },
      participantId: participant.participantId,
    });

    expect(result.success).toEqual(true);
    expect(Object.keys(result).sort()).toEqual(['participant', 'success']);
  });

  it('updateParticipantName: false lets a supplied name win — the documented opt-out', () => {
    const { participant } = loadParticipant();

    const result: any = tournamentEngine.modifyParticipant({
      participant: { ...participant, participantName: 'EXPLICIT WINS' },
      participantId: participant.participantId,
      updateParticipantName: false,
    });

    expect(result.success).toEqual(true);
    expect(currentName(participant.participantId)).toEqual('EXPLICIT WINS');
    expect(result.info).toBeUndefined();
  });
});
