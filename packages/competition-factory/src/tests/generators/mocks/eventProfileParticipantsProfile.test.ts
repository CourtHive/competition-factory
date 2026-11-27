import { getParticipantId } from '@Functions/global/extractors';
import { defined } from '@Tests/helpers/defined';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { DOUBLES } from '@Constants/eventConstants';

/**
 * An eventProfile's own participantsProfile is merged over the top-level participantsProfile, the event's
 * setting winning, wherever the event's participants are generated. Before, only its participantsCount was
 * read (and only for an event without drawProfiles): its sex, nationalityCodes and every other attribute
 * were ignored, and an event without a category or gender drew from the tournament pool instead.
 */

const EVENT_PROFILE = { participantsCount: 10, sex: FEMALE, nationalityCodes: ['FRA'] };

function eventPersons(tournamentRecord) {
  const participants = tournamentRecord.participants;
  const byId = new Map<string, any>(participants.map((participant) => [participant.participantId, participant]));
  const enteredIds = tournamentRecord.events[0].entries.map(getParticipantId);
  const entered = enteredIds.map((id) => byId.get(id));
  const persons = entered.flatMap((participant) =>
    participant.participantType === PAIR
      ? participant.individualParticipantIds.map((id) => byId.get(id).person)
      : [participant.person],
  );
  return { entered, persons };
}

function generate(params) {
  const result = mocksEngine.generateTournamentRecord({ nonRandom: 3, ...params });
  expect(result.error).toBeUndefined();
  return eventPersons(result.tournamentRecord);
}

const allFemale = (persons) => persons.every(({ sex }) => sex === FEMALE);
const allFrom = (persons, code) => persons.every(({ nationalityCode }) => nationalityCode === code);

describe('eventProfile participantsProfile', () => {
  it('is honoured for an event without drawProfiles', () => {
    const { entered, persons } = generate({ eventProfiles: [{ participantsProfile: EVENT_PROFILE }] });
    expect(entered.length).toEqual(10);
    expect(allFemale(persons)).toEqual(true);
    expect(allFrom(persons, 'FRA')).toEqual(true);
  });

  it('is honoured for an event with drawProfiles and no category or gender', () => {
    const { entered, persons } = generate({
      eventProfiles: [{ participantsProfile: EVENT_PROFILE, drawProfiles: [{ drawSize: 8 }] }],
    });
    // the draw sizes the event, not participantsCount
    expect(entered.length).toEqual(8);
    expect(allFemale(persons)).toEqual(true);
    expect(allFrom(persons, 'FRA')).toEqual(true);
  });

  it('is honoured for an event with drawProfiles and a category', () => {
    const { entered, persons } = generate({
      eventProfiles: [
        { participantsProfile: EVENT_PROFILE, category: { ageCategoryCode: 'U18' }, drawProfiles: [{ drawSize: 8 }] },
      ],
    });
    expect(entered.length).toEqual(8);
    expect(allFemale(persons)).toEqual(true);
    expect(allFrom(persons, 'FRA')).toEqual(true);
  });

  it('is merged over the top-level participantsProfile, the event winning', () => {
    const { persons } = generate({
      participantsProfile: { nationalityCodes: ['USA'], sex: MALE },
      eventProfiles: [{ participantsProfile: { sex: FEMALE }, drawProfiles: [{ drawSize: 8 }] }],
    });
    expect(persons.length).toEqual(8);
    expect(allFemale(persons)).toEqual(true);
    expect(allFrom(persons, 'USA')).toEqual(true);
  });

  it('yields to the event gender, which its entries must match', () => {
    const { persons } = generate({
      eventProfiles: [{ gender: MALE, participantsProfile: { sex: FEMALE }, drawProfiles: [{ drawSize: 8 }] }],
    });
    expect(persons.length).toEqual(8);
    expect(persons.every(({ sex }) => sex === MALE)).toEqual(true);
  });

  it('is honoured for a DOUBLES event', () => {
    const { entered, persons } = generate({
      eventProfiles: [
        { eventType: DOUBLES, participantsProfile: { nationalityCodes: ['FRA'] }, drawProfiles: [{ drawSize: 4 }] },
      ],
    });
    expect(entered.length).toEqual(4);
    expect(entered.every(({ participantType }) => participantType === PAIR)).toEqual(true);
    expect(persons.length).toEqual(8);
    expect(allFrom(persons, 'FRA')).toEqual(true);
  });

  it('with only a participantsCount still draws an event with drawProfiles from the tournament pool', () => {
    const result = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ participantsProfile: { participantsCount: 10 }, drawProfiles: [{ drawSize: 8 }] }],
    });
    expect(result.error).toBeUndefined();
    const individuals = defined(result.tournamentRecord.participants, 'participants').filter(
      ({ participantType }) => participantType === INDIVIDUAL,
    );
    // no event pool on top of the tournament pool the draw is sized from
    expect(individuals.length).toEqual(8);
    expect(defined(defined(result.tournamentRecord.events, 'events')[0].entries, 'entries').length).toEqual(8);
  });
});
