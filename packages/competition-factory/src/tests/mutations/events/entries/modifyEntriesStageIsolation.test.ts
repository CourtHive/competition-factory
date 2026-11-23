import { getFlightProfile } from '@Query/event/getFlightProfile';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { ALTERNATE, DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';

it('a QUALIFYING source filter cannot alter the same participant unstaged MAIN entry', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    nonRandom: 1,
    setState: true,
    participantsProfile: { participantsCount: 2 },
    eventProfiles: [{}],
  });
  const event = tournamentRecord.events![0];
  const participantId = tournamentRecord.participants![0].participantId;
  event.entries = [
    { participantId, entryStatus: DIRECT_ACCEPTANCE },
    { participantId, entryStage: QUALIFYING, entryStatus: DIRECT_ACCEPTANCE },
  ];
  tournamentEngine.setState(tournamentRecord);
  let result: any = tournamentEngine.modifyEntriesStatus({
    eventId: event.eventId,
    participantIds: [participantId],
    stage: QUALIFYING,
    entryStage: QUALIFYING,
    entryStatus: ALTERNATE,
  });
  expect(result.success).toBe(true);
  const entries = tournamentEngine.getEvent({ eventId: event.eventId }).event.entries;
  expect(entries.filter((entry) => (entry.entryStage ?? MAIN) === MAIN)).toMatchObject([
    { entryStatus: DIRECT_ACCEPTANCE },
  ]);
  expect(entries.filter((entry) => entry.entryStage === QUALIFYING)).toMatchObject([{ entryStatus: ALTERNATE }]);
});

it('refuses a stage move into an existing participant-stage entry before writing', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    nonRandom: 1,
    setState: true,
    participantsProfile: { participantsCount: 2 },
    eventProfiles: [{}],
  });
  const event = tournamentRecord.events![0];
  const participantId = tournamentRecord.participants![0].participantId;
  event.entries = [
    { participantId, entryStatus: DIRECT_ACCEPTANCE },
    { participantId, entryStage: QUALIFYING, entryStatus: ALTERNATE },
  ];
  tournamentEngine.setState(tournamentRecord);
  const before = tournamentEngine.getState();
  let result: any = tournamentEngine.modifyEntriesStatus({
    eventId: event.eventId,
    participantIds: [participantId],
    stage: MAIN,
    entryStage: QUALIFYING,
    entryStatus: DIRECT_ACCEPTANCE,
  });
  expect(result.error).toBeDefined();
  expect(tournamentEngine.getState()).toEqual(before);
});

it('checks flight-only destination collisions before changing event or flight entries', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    nonRandom: 1,
    setState: false,
    drawProfiles: [{ drawSize: 4, generate: false }],
  });
  const event = tournamentRecord.events![0];
  const flight = getFlightProfile({ event }).flightProfile!.flights![0];
  const participantId = flight.drawEntries[0].participantId;
  flight.drawEntries.push({ participantId, entryStage: QUALIFYING, entryStatus: ALTERNATE });
  tournamentEngine.setState(tournamentRecord);
  const before = tournamentEngine.getState();
  let result: any = tournamentEngine.modifyEntriesStatus({
    eventId: event.eventId,
    participantIds: [participantId],
    stage: MAIN,
    entryStage: QUALIFYING,
    entryStatus: DIRECT_ACCEPTANCE,
  });
  expect(result.error).toBeDefined();
  expect(tournamentEngine.getState()).toEqual(before);
});

it('does not treat an untouched event entry as a collision for a flight-only stage change', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    nonRandom: 1,
    setState: false,
    drawProfiles: [{ drawSize: 4, generate: false }],
  });
  const event = tournamentRecord.events![0];
  const flight = getFlightProfile({ event }).flightProfile!.flights![0];
  const participantId = flight.drawEntries[0].participantId;
  event.entries!.push({ participantId, entryStage: QUALIFYING, entryStatus: DIRECT_ACCEPTANCE });
  tournamentEngine.setState(tournamentRecord);
  const beforeEntries = structuredClone(event.entries);
  let result: any = tournamentEngine.modifyEntriesStatus({
    eventId: event.eventId,
    drawId: flight.drawId,
    autoEntryPositions: false,
    participantIds: [participantId],
    stage: MAIN,
    entryStage: QUALIFYING,
    entryStatus: DIRECT_ACCEPTANCE,
  });
  expect(result.success).toBe(true);
  const updated = tournamentEngine.getEvent({ eventId: event.eventId }).event;
  expect(updated.entries).toEqual(beforeEntries);
  expect(
    tournamentEngine
      .getFlightProfile({ eventId: event.eventId })
      .flightProfile.flights[0].drawEntries.filter((entry) => entry.participantId === participantId),
  ).toMatchObject([{ entryStage: QUALIFYING }]);
});
