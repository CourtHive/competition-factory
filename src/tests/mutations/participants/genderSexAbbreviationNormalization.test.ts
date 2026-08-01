import { normalizeGender } from '@Helpers/coercedGender';
import tournamentEngine from '@Engines/syncEngine';
import { coercedSex } from '@Helpers/coercedSex';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants and types
import { ANY, FEMALE, FEMALE_ABBR, MALE, MALE_ABBR, MIXED, OTHER } from '@Constants/genderConstants';
import { INDIVIDUAL, TEAM } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { SINGLES } from '@Constants/eventConstants';
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

it('normalizes a team participant short-code gender to the extended form at rest', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 4 } });
  tournamentEngine.setState(tournamentRecord);

  const team = { participantType: TEAM, participantRole: COMPETITOR, participantName: 'Team Short', gender: 'M' };
  const result = tournamentEngine.addParticipants({ participants: [team] });
  expect(result).toMatchObject(SUCCESS);

  const { participants } = tournamentEngine.getParticipants({ participantFilters: { participantTypes: [TEAM] } });
  const added = participants.find((p: any) => p.participantName === 'Team Short');
  expect(added.gender).toEqual(MALE); // stored canonical, not 'M'
});

// The following exercise the READ paths against a tournamentRecord constructed OUTSIDE
// the factory that already stores the abbreviated TODS short codes. setState performs no
// normalization, so these prove the read-side coercion — not write-side normalization —
// handles abbreviated values at rest.

describe('reading an externally-constructed record with abbreviated gender/sex at rest', () => {
  // build a canonical mocks record, then rewrite it to the short codes as an external
  // (non-factory) producer would, WITHOUT re-adding through the factory
  function externalAbbreviatedRecord(participantsCount = 20) {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount } });
    const individuals = tournamentRecord.participants.filter((p: any) => p.participantType === INDIVIDUAL);
    individuals.forEach((p: any) => {
      if (p.person?.sex === MALE) p.person.sex = MALE_ABBR;
      else if (p.person?.sex === FEMALE) p.person.sex = FEMALE_ABBR;
    });
    const maleCount = individuals.filter((p: any) => p.person?.sex === MALE_ABBR).length;
    const femaleCount = individuals.filter((p: any) => p.person?.sex === FEMALE_ABBR).length;
    return { tournamentRecord, maleCount, femaleCount };
  }

  it('filters participants by canonical gender against abbreviated stored sex', () => {
    const { tournamentRecord, maleCount } = externalAbbreviatedRecord();
    expect(maleCount).toBeGreaterThan(0);
    tournamentEngine.setState(tournamentRecord); // no normalization

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { genders: [MALE], participantTypes: [INDIVIDUAL] },
    });
    expect(participants.length).toEqual(maleCount);
    // the stored value is untouched — still abbreviated (read did not rewrite it)
    expect(participants.every((p: any) => p.person?.sex === MALE_ABBR)).toEqual(true);
  });

  it('applies entry gender eligibility against an abbreviated stored event gender + person sex', () => {
    const { tournamentRecord } = externalAbbreviatedRecord(16);
    tournamentRecord.events = tournamentRecord.events ?? [];
    tournamentRecord.events.push({
      eventId: 'ext-male-event',
      eventName: 'External Male (abbr)',
      eventType: SINGLES,
      gender: MALE_ABBR, // 'M' stored directly, never normalized
      entries: [],
      drawDefinitions: [],
    });
    tournamentEngine.setState(tournamentRecord);

    const maleIds = tournamentEngine
      .getParticipants({ participantFilters: { genders: [MALE], participantTypes: [INDIVIDUAL] } })
      .participants.map((p: any) => p.participantId);
    const femaleIds = tournamentEngine
      .getParticipants({ participantFilters: { genders: [FEMALE], participantTypes: [INDIVIDUAL] } })
      .participants.map((p: any) => p.participantId);
    expect(maleIds.length).toBeGreaterThan(0);
    expect(femaleIds.length).toBeGreaterThan(0);

    // male participants (stored sex 'M') are eligible for the 'M' event
    let result = tournamentEngine.addEventEntries({ eventId: 'ext-male-event', participantIds: maleIds });
    expect(result.success).toEqual(true);

    // a female participant (stored sex 'F') is rejected from the 'M' event
    result = tournamentEngine.addEventEntries({ eventId: 'ext-male-event', participantIds: [femaleIds[0]] });
    expect(result.success).not.toEqual(true);
  });
});
