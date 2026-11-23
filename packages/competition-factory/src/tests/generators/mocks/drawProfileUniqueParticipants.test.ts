import { getParticipantId } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

test('with uniqueParticipants: false draw entries will overlap', () => {
  const drawProfiles = [
    { drawSize: 16, uniqueParticipants: false },
    { drawSize: 16, uniqueParticipants: false },
  ];
  const { tournamentRecord, eventIds, error } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  expect(error).toBeUndefined();
  expect(eventIds.length).toEqual(2);

  const eventEnteredParticipantIds = tournamentRecord.events.map(({ entries }) =>
    entries.filter(({ entryStatus }) => entryStatus === DIRECT_ACCEPTANCE).map(getParticipantId),
  );
  const overlap = eventEnteredParticipantIds[0].find((participantId) =>
    eventEnteredParticipantIds[1].includes(participantId),
  );
  expect(overlap).not.toBeUndefined();
});

test('drawProfiles can specify unique participants', () => {
  const drawProfiles = [
    { drawSize: 16, uniqueParticipants: false },
    { drawSize: 16, uniqueParticipants: true },
  ];
  const { tournamentRecord, eventIds, error } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  expect(error).toBeUndefined();
  expect(eventIds.length).toEqual(2);

  const eventEnteredParticipantIds = tournamentRecord.events.map(({ entries }) =>
    entries.filter(({ entryStatus }) => entryStatus === DIRECT_ACCEPTANCE).map(getParticipantId),
  );
  const overlap = eventEnteredParticipantIds[0].find((participantId) =>
    eventEnteredParticipantIds[1].includes(participantId),
  );
  expect(overlap).toBeUndefined();
});

test('event entries will overlap if uniqueParticipants is not true', () => {
  const eventProfiles = [
    {
      eventName: 'Event One',
      drawProfiles: [
        {
          drawSize: 16,
          drawType: ROUND_ROBIN,
        },
      ],
    },
    {
      eventName: 'Event Two',
      drawProfiles: [
        {
          drawSize: 16,
          drawType: ROUND_ROBIN,
        },
      ],
    },
  ];
  const { tournamentRecord, eventIds, error } = mocksEngine.generateTournamentRecord({
    eventProfiles,
  });
  expect(error).toBeUndefined();
  expect(eventIds.length).toEqual(2);

  const eventEnteredParticipantIds = tournamentRecord.events.map(({ entries }) =>
    entries.filter(({ entryStatus }) => entryStatus === DIRECT_ACCEPTANCE).map(getParticipantId),
  );
  const overlap = eventEnteredParticipantIds[0].find((participantId) =>
    eventEnteredParticipantIds[1].includes(participantId),
  );
  expect(overlap).not.toBeUndefined();
});

test('drawProfiles within eventProfiles can specify unique participants', () => {
  const eventProfiles = [
    {
      eventName: 'Event One',
      drawProfiles: [
        {
          drawSize: 16,
          drawType: ROUND_ROBIN,
        },
      ],
    },
    {
      eventName: 'Event Two',
      drawProfiles: [
        {
          drawSize: 16,
          drawType: ROUND_ROBIN,
          uniqueParticipants: true,
        },
      ],
    },
  ];
  const { tournamentRecord, eventIds, error } = mocksEngine.generateTournamentRecord({
    eventProfiles,
  });
  expect(error).toBeUndefined();
  expect(eventIds.length).toEqual(2);

  const eventEnteredParticipantIds = tournamentRecord.events.map(({ entries }) =>
    entries.filter(({ entryStatus }) => entryStatus === DIRECT_ACCEPTANCE).map(getParticipantId),
  );
  const overlap = eventEnteredParticipantIds[0].find((participantId) =>
    eventEnteredParticipantIds[1].includes(participantId),
  );
  expect(overlap).toBeUndefined();
});
