import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { INVALID_DATE } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { SINGLES } from '@Constants/eventConstants';
import { RATING } from '@Constants/scaleConstants';

describe('scaleDate validation', () => {
  it('rejects invalid scaleDate format', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
    });
    tournamentEngine.setState(tournamentRecord);

    const { participants } = tournamentRecord;
    const { participantId } = participants[0];

    let result: any = tournamentEngine.setParticipantScaleItem({
      participantId,
      scaleItem: {
        eventType: SINGLES,
        scaleType: RATING,
        scaleName: 'WTN',
        scaleValue: 8.3,
        scaleDate: 'not-a-date',
      },
    });
    expect(result.error).toEqual(INVALID_DATE);
  });

  it('rejects malformed date strings as scaleDate', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
    });
    tournamentEngine.setState(tournamentRecord);

    const { participants } = tournamentRecord;
    const { participantId } = participants[0];

    let result: any = tournamentEngine.setParticipantScaleItem({
      participantId,
      scaleItem: {
        eventType: SINGLES,
        scaleType: RATING,
        scaleName: 'WTN',
        scaleValue: 7.5,
        scaleDate: '2024-13-45',
      },
    });
    expect(result.error).toEqual(INVALID_DATE);
  });

  it('accepts valid scaleDate format', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
    });
    tournamentEngine.setState(tournamentRecord);

    const { participants } = tournamentRecord;
    const { participantId } = participants[0];

    let result: any = tournamentEngine.setParticipantScaleItem({
      participantId,
      scaleItem: {
        eventType: SINGLES,
        scaleType: RATING,
        scaleName: 'WTN',
        scaleValue: 8.3,
        scaleDate: '2024-06-15',
      },
    });
    expect(result).toMatchObject(SUCCESS);
  });

  it('accepts undefined scaleDate (optional field)', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
    });
    tournamentEngine.setState(tournamentRecord);

    const { participants } = tournamentRecord;
    const { participantId } = participants[0];

    let result: any = tournamentEngine.setParticipantScaleItem({
      participantId,
      scaleItem: {
        eventType: SINGLES,
        scaleType: RATING,
        scaleName: 'WTN',
        scaleValue: 9.1,
      },
    });
    expect(result).toMatchObject(SUCCESS);
  });
});

describe('birthdate validation', () => {
  it('rejects invalid birthdate format', () => {
    mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
      setState: true,
    });

    const participants = tournamentEngine.getParticipants().participants;
    const participant = participants[0];

    let result: any = tournamentEngine.modifyParticipant({
      participant: {
        ...participant,
        person: { ...participant.person, birthDate: 'garbage' },
      },
    });
    expect(result.error).toEqual(INVALID_DATE);
  });

  it('rejects future birthdate', () => {
    mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
      setState: true,
    });

    const participants = tournamentEngine.getParticipants().participants;
    const participant = participants[0];

    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const futureDateString = futureDate.toISOString().slice(0, 10);

    let result: any = tournamentEngine.modifyParticipant({
      participant: {
        ...participant,
        person: { ...participant.person, birthDate: futureDateString },
      },
    });
    expect(result.error).toEqual(INVALID_DATE);
  });

  it('rejects birthdate before 1900', () => {
    mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
      setState: true,
    });

    const participants = tournamentEngine.getParticipants().participants;
    const participant = participants[0];

    let result: any = tournamentEngine.modifyParticipant({
      participant: {
        ...participant,
        person: { ...participant.person, birthDate: '1899-12-31' },
      },
    });
    expect(result.error).toEqual(INVALID_DATE);
  });

  it('accepts valid past birthdate', () => {
    mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
      setState: true,
    });

    const participants = tournamentEngine.getParticipants().participants;
    const participant = participants[0];

    let result: any = tournamentEngine.modifyParticipant({
      participant: {
        ...participant,
        person: { ...participant.person, birthDate: '2000-06-15' },
      },
    });
    expect(result.success).toEqual(true);

    // Verify it was stored under the canonical field
    const { participant: updated } = tournamentEngine.findParticipant({
      participantId: participant.participantId,
    });
    expect(updated.person.birthDate).toEqual('2000-06-15');
  });
});

describe('timeItem itemDate validation', () => {
  it('rejects invalid itemDate on tournament timeItem', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.addTournamentTimeItem({
      timeItem: {
        itemType: 'test.dates',
        itemValue: 'value',
        itemDate: 'not-a-date',
      },
    });
    expect(result.error).toEqual(INVALID_DATE);
  });

  it('rejects malformed itemDate', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.addTournamentTimeItem({
      timeItem: {
        itemType: 'test.dates',
        itemValue: 'value',
        itemDate: '2024-99-99',
      },
    });
    expect(result.error).toEqual(INVALID_DATE);
  });

  it('accepts valid itemDate', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.addTournamentTimeItem({
      timeItem: {
        itemType: 'test.dates',
        itemValue: 'value',
        itemDate: '2024-06-15',
      },
    });
    expect(result.success).toEqual(true);
  });

  it('accepts timeItem without itemDate (optional field)', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.addTournamentTimeItem({
      timeItem: {
        itemType: 'test.nodate',
        itemValue: 'value',
      },
    });
    expect(result.success).toEqual(true);
  });

  it('accepts Date object as itemDate (not validated as string)', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.addTournamentTimeItem({
      timeItem: {
        itemType: 'test.dateobj',
        itemValue: 'value',
        itemDate: new Date('2024-06-15'),
      },
    });
    expect(result.success).toEqual(true);
  });

  it('rejects invalid itemDate on participant timeItem', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
    });
    tournamentEngine.setState(tournamentRecord);

    const { participants } = tournamentRecord;
    const { participantId } = participants[0];

    let result: any = tournamentEngine.addParticipantTimeItem({
      participantId,
      timeItem: {
        itemType: 'test.participant.date',
        itemValue: 'value',
        itemDate: 'invalid',
      },
    });
    expect(result.error).toEqual(INVALID_DATE);
  });
});
