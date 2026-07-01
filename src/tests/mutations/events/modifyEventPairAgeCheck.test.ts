import { modifyEvent } from '@Mutate/events/modifyEvent';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { CATEGORY_MISMATCH } from '@Constants/errorConditionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { DOUBLES } from '@Constants/eventConstants';

// Regression: checkParticipantAges expanded PAIR/TEAM entries to their members via
// the misspelled `p.individualParticpants` (always undefined), so doubles/team
// members were skipped in category age validation and an age-ineligible pair
// passed silently. The corrected `p.individualParticipants` age-checks the members.
it('modifyEvent age-checks the individual members of PAIR entries', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: DOUBLES, drawSize: 8 }],
  });

  // make every pair member too old for U12 (born 2010, checked in 2024)
  for (const participant of tournamentRecord.participants) {
    if (participant.participantType === INDIVIDUAL) {
      participant.person = { ...participant.person, birthDate: '2010-01-01' };
    }
  }
  tournamentEngine.setState(tournamentRecord);

  const event = tournamentRecord.events[0];
  event.startDate = '2024-01-01';
  event.endDate = '2024-01-07';

  const result: any = modifyEvent({
    tournamentRecord,
    eventId: event.eventId,
    event,
    eventUpdates: {
      category: { categoryName: 'U12', ageCategoryCode: 'U12' },
    },
  });

  // buggy code skipped pair members and returned success; the fix flags the mismatch
  expect(result.error).toEqual(CATEGORY_MISMATCH);
});
