import { normalizeGender } from '@Helpers/coercedGender';
import tournamentEngine from '@Engines/syncEngine';
import { coercedSex } from '@Helpers/coercedSex';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants and types
import { ANY, FEMALE, MALE, MIXED, OTHER } from '@Constants/genderConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { SUCCESS } from '@Constants/resultConstants';

// TODS Standard Codes accept short codes (M/F/X/A) alongside the extended forms.
// Policy: accept short codes as input, normalize to the extended form on write so
// records stay canonical at rest. sex vocab = FEMALE/MALE/OTHER (no ANY/MIXED);
// gender vocab = MALE/FEMALE/MIXED/ANY (no OTHER).

describe('coercedSex — sex vocabulary (FEMALE/MALE/OTHER, no ANY/MIXED)', () => {
  it('maps recognized short + extended codes to the extended form', () => {
    expect(coercedSex('F')).toEqual(FEMALE);
    expect(coercedSex('M')).toEqual(MALE);
    expect(coercedSex('O')).toEqual(OTHER);
    expect(coercedSex(FEMALE)).toEqual(FEMALE);
    expect(coercedSex(MALE)).toEqual(MALE);
    expect(coercedSex(OTHER)).toEqual(OTHER);
  });
  it('returns undefined for gender-only or unrecognized values (so callers skip them)', () => {
    expect(coercedSex('X')).toBeUndefined(); // MIXED is gender-only
    expect(coercedSex('A')).toBeUndefined(); // ANY is gender-only
    expect(coercedSex(MIXED)).toBeUndefined();
    expect(coercedSex(ANY)).toBeUndefined();
    expect(coercedSex('banana')).toBeUndefined();
    expect(coercedSex(undefined)).toBeUndefined();
  });
});

describe('normalizeGender — gender vocabulary (MALE/FEMALE/MIXED/ANY, no OTHER)', () => {
  it('maps recognized short + extended codes to the extended form', () => {
    expect(normalizeGender('M')).toEqual(MALE);
    expect(normalizeGender('F')).toEqual(FEMALE);
    expect(normalizeGender('X')).toEqual(MIXED);
    expect(normalizeGender('A')).toEqual(ANY);
    expect(normalizeGender(MIXED)).toEqual(MIXED);
    expect(normalizeGender(ANY)).toEqual(ANY);
  });
  it('passes unrecognized values through unchanged (never coerces to OTHER)', () => {
    expect(normalizeGender('OTHER')).toEqual('OTHER');
    expect(normalizeGender('banana')).toEqual('banana');
    expect(normalizeGender(undefined)).toBeUndefined();
  });
});

it('addEvent normalizes a short-code gender to the extended form at rest', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 8 } });
  tournamentEngine.setState(tournamentRecord);

  const result = tournamentEngine.addEvent({ event: { eventName: 'Short-code M', gender: 'M' } });
  expect(result.success).toEqual(true);
  expect(result.event.gender).toEqual(MALE); // stored canonical, not 'M'
});

it('modifyEvent normalizes a short-code gender to the extended form at rest', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 8 } });
  tournamentEngine.setState(tournamentRecord);
  const { event } = tournamentEngine.addEvent({ event: { eventName: 'To modify', gender: MALE } }) as any;

  const result = tournamentEngine.modifyEvent({ eventId: event.eventId, eventUpdates: { gender: 'F' } });
  expect(result.success).toEqual(true);
  const stored = tournamentEngine.getEvent({ eventId: event.eventId }).event;
  expect(stored.gender).toEqual(FEMALE); // stored canonical, not 'F'
});

it('addParticipants normalizes a person short-code sex to the extended form at rest', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  tournamentEngine.setState(tournamentRecord);

  const participant = {
    participantType: INDIVIDUAL,
    participantRole: COMPETITOR,
    person: { standardGivenName: 'Casey', standardFamilyName: 'Short', sex: 'F' },
  };
  const result = tournamentEngine.addParticipants({ participants: [participant] });
  expect(result).toMatchObject(SUCCESS);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const added = participants.find((p: any) => p.person?.standardFamilyName === 'Short');
  expect(added.person.sex).toEqual(FEMALE); // stored canonical, not 'F'
});
