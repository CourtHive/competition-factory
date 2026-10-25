import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';
import { SCHEDULED_MATCHUPS } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

/*
 * The scheduling policy's `allowModificationWhenMatchUpsScheduled.{venues,courts}` lets a venue or court be deleted
 * while matchUps are scheduled on it, unscheduling them. The venue mutations read it under the scoring policy's key name
 * (`allowDeletionWithScoresPresent`), which no scheduling policy carries, so the flag the policy editor sets had no
 * effect and only `force` worked.
 */

const START_DATE = '2026-09-09';
const VENUE = 'venueId';

function scheduledTournament(allowed?: { venues?: boolean; courts?: boolean }) {
  const startDate = START_DATE;
  const policyDefinitions: any = structuredClone(POLICY_SCHEDULING_NO_DAILY_LIMITS);
  if (allowed) policyDefinitions[POLICY_TYPE_SCHEDULING].allowModificationWhenMatchUpsScheduled = allowed;
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId: VENUE, courtsCount: 4 }],
    drawProfiles: [{ drawId: 'd', drawSize: 8 }],
    schedulingProfile: [
      { scheduleDate: startDate, venues: [{ venueId: VENUE, rounds: [{ drawId: 'd', roundNumber: 1 }] }] },
    ],
    autoSchedule: true,
    policyDefinitions,
    setState: true,
    startDate,
  });
  const scheduled = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter((matchUp) => matchUp.schedule?.scheduledTime);
  expect(scheduled.length).toEqual(4);
}

/** a matchUp assigned to the venue's first court: the profile scheduler times matchUps without choosing courts */
function courtWithAMatchUp() {
  const { courts } = tournamentEngine.getVenuesAndCourts();
  const [matchUp] = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  const result = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: START_DATE, courtId: courts[0].courtId, venueId: VENUE },
    matchUpId: matchUp.matchUpId,
    drawId: matchUp.drawId,
  });
  expect(result.success).toEqual(true);
  const onCourt = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter((m) => m.schedule?.courtId === courts[0].courtId);
  expect(onCourt.length).toEqual(1);
  return courts[0].courtId;
}

describe('the scheduling policy decides whether a venue with scheduled matchUps may be changed', () => {
  it('refuses by default', () => {
    scheduledTournament();
    expect(tournamentEngine.deleteVenue({ venueId: VENUE }).error).toEqual(SCHEDULED_MATCHUPS);
  });

  it('allows deleting the venue when the policy allows it for venues', () => {
    scheduledTournament({ venues: true, courts: false });
    expect(tournamentEngine.deleteVenue({ venueId: VENUE }).success).toEqual(true);
  });

  it('allows deleting a court when the policy allows it for courts', () => {
    scheduledTournament({ venues: false, courts: true });
    expect(tournamentEngine.deleteCourt({ courtId: courtWithAMatchUp() }).success).toEqual(true);
  });

  it('refuses deleting a court with a matchUp when the policy allows venues only', () => {
    scheduledTournament({ venues: true, courts: false });
    expect(tournamentEngine.deleteCourt({ courtId: courtWithAMatchUp() }).error).toBeDefined();
  });
});
