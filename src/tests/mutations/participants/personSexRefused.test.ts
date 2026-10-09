import { isUnrecognizedSex } from '@Helpers/coercedSex';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { ANY, FEMALE, MALE, MIXED, OTHER } from '@Constants/genderConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';

/**
 * `person.sex` is optional, but a value that is present must be FEMALE, MALE or OTHER (or F/M/O).
 *
 * An unrecognized sex used to be stored as given by add and merge, and skipped without a word by
 * modify. ANY and MIXED are valid event GENDERS, so they arrive plausibly; stored as a sex they make
 * the person unenterable in any FEMALE or MALE event, and nothing said so until the entry was refused
 * with `mismatchedGender`. Prod, 2026-09-25: four refused entries into a Women's Singles for a person
 * stored with sex ANY. Prod also holds ANY on 6,152 persons, MIXED on 1,579 and 'Unknown' on 277.
 */

const UNRECOGNIZED = [ANY, MIXED, 'X', 'A', 'Unknown', 'female', 7];

function individual(sex?: unknown) {
  return {
    participantType: INDIVIDUAL,
    participantRole: COMPETITOR,
    person: { standardGivenName: 'Charlie', standardFamilyName: 'Sexless', sex },
  };
}

function seed() {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 4 }, setState: true });
  return tournamentEngine.getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } }).participants;
}

function storedPerson(participantId: string) {
  return tournamentEngine.findParticipant({ participantId }).participant?.person;
}

describe('isUnrecognizedSex', () => {
  it('passes an absent sex and the clear request', () => {
    for (const sex of [undefined, null, '']) expect(isUnrecognizedSex(sex)).toEqual(false);
  });
  it('passes the sex vocabulary and its short codes', () => {
    for (const sex of [FEMALE, MALE, OTHER, 'F', 'M', 'O']) expect(isUnrecognizedSex(sex)).toEqual(false);
  });
  it('flags everything else, gender-only values included', () => {
    for (const sex of UNRECOGNIZED) expect(isUnrecognizedSex(sex)).toEqual(true);
  });
});

describe('addParticipants', () => {
  it('refuses an unrecognized sex and adds nothing', () => {
    const before = seed().length;
    for (const sex of UNRECOGNIZED) {
      const result: any = tournamentEngine.addParticipants({ participants: [individual(sex)] });
      expect(result.error).toEqual(INVALID_VALUES);
      expect(result.context.sex).toEqual(sex);
    }
    const after = tournamentEngine.getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } });
    expect(after.participants.length).toEqual(before);
  });

  it('accepts a person with no sex, and stores none for an empty one', () => {
    seed();
    for (const sex of [undefined, null, '']) {
      const participant = { ...individual(sex), participantId: `no-sex-${String(sex)}` };
      const result: any = tournamentEngine.addParticipants({ participants: [participant] });
      expect(result.success).toEqual(true);
      expect(storedPerson(participant.participantId).sex).toBeUndefined();
    }
  });
});

describe('modifyParticipant', () => {
  it('refuses an unrecognized sex and leaves the person untouched', () => {
    const [participant] = seed();
    const before = storedPerson(participant.participantId);
    for (const sex of UNRECOGNIZED) {
      const result: any = tournamentEngine.modifyParticipant({
        participant: { participantId: participant.participantId, person: { standardGivenName: 'Renamed', sex } },
      });
      expect(result.error).toEqual(INVALID_VALUES);
      expect(result.context.sex).toEqual(sex);
    }
    expect(storedPerson(participant.participantId)).toEqual(before);
  });

  it('clears sex on an empty string and leaves it on undefined', () => {
    const [participant] = seed();
    const { participantId } = participant;
    const sex = storedPerson(participantId).sex;
    expect([FEMALE, MALE]).toContain(sex);

    let result: any = tournamentEngine.modifyParticipant({ participant: { participantId, person: {} } });
    expect(result.success).toEqual(true);
    expect(storedPerson(participantId).sex).toEqual(sex);

    result = tournamentEngine.modifyParticipant({ participant: { participantId, person: { sex: '' } } });
    expect(result.success).toEqual(true);
    expect(storedPerson(participantId)).not.toHaveProperty('sex');

    result = tournamentEngine.modifyParticipant({ participant: { participantId, person: { sex: 'F' } } });
    expect(result.success).toEqual(true);
    expect(storedPerson(participantId).sex).toEqual(FEMALE);
  });
});

describe('mergeParticipants', () => {
  it('refuses the whole merge when any incoming person has an unrecognized sex', () => {
    const [first, second] = seed();
    const before = tournamentEngine.getParticipants().participants;
    const result: any = tournamentEngine.mergeParticipants({
      participants: [
        { ...first, person: { ...first.person, standardGivenName: 'Merged' } },
        { ...second, person: { ...second.person, sex: ANY } },
        { ...individual(FEMALE), participantId: 'merged-new' },
      ],
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context).toEqual({ participantId: second.participantId, sex: ANY });
    expect(tournamentEngine.getParticipants().participants).toEqual(before);
  });

  it('normalizes a short-code sex on merge', () => {
    const [participant] = seed();
    const result: any = tournamentEngine.mergeParticipants({
      participants: [{ participantId: participant.participantId, person: { sex: 'O' } }],
    });
    expect(result.success).toEqual(true);
    expect(storedPerson(participant.participantId).sex).toEqual(OTHER);
  });
});
