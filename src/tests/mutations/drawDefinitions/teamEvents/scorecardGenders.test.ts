import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOMINANT_DUO, DOMINANT_DUO_MIXED } from '@Constants/tieFormatConstants';
import { INVALID_TIE_FORMAT } from '@Constants/errorConditionConstants';
import { MALE } from '@Constants/genderConstants';
import { TEAM } from '@Constants/eventConstants';

it('will throw errors if gendered tieFormat not aligned with event gender', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { gender: MALE },
    eventProfiles: [
      {
        drawProfiles: [{ drawSize: 16, generate: false }],
        eventType: TEAM,
        gender: MALE,
      },
    ],
  });

  const result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.gender).toEqual(MALE);

  const d1 = tournamentEngine.generateDrawDefinition({
    tieFormatName: DOMINANT_DUO,
    eventId,
  });
  expect(d1.success).toEqual(true);

  const d2 = tournamentEngine.generateDrawDefinition({
    tieFormatName: DOMINANT_DUO_MIXED,
    eventId,
  });
  expect(d2.error).toEqual(INVALID_TIE_FORMAT);
});
