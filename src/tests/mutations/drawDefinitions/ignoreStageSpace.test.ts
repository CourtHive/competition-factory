import { getParticipantId } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { WILDCARD } from '@Constants/entryStatusConstants';

it('generateDrawDefinition handles all-wildcard entries', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, generate: false }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { event } = tournamentEngine.getEvent({ eventId });
  const participantIds = event.entries.map(getParticipantId);

  let result = tournamentEngine.modifyEntriesStatus({
    entryStatus: WILDCARD,
    participantIds,
    eventId,
  });
  expect(result.success).toEqual(true);

  const {
    flightProfile: {
      flights: [flight],
    },
  } = tournamentEngine.getFlightProfile({ eventId });

  // Without sanctioning constraints, all-wildcard draws are unconstrained and succeed
  result = tournamentEngine.generateDrawDefinition(flight);
  expect(result.success).toEqual(true);
  expect(result.drawDefinition.structures[0].positionAssignments.map(getParticipantId).filter(Boolean).length).toEqual(
    8,
  );

  // Without sanctioning constraints, wildcards are unconstrained and positioned normally
  result = tournamentEngine.generateDrawDefinition({ eventId });
  expect(result.drawDefinition).not.toBeUndefined();
  expect(result.success).toEqual(true);
  expect(result.drawDefinition.structures[0].positionAssignments.map(getParticipantId).filter(Boolean).length).toEqual(
    8,
  );
});
