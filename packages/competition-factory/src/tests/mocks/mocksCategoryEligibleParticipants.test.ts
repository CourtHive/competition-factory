import { getParticipantEligibility } from '@Query/entries/getParticipantEligibility';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { DUPR } from '@Constants/ratingConstants';
import { DOUBLES } from '@Constants/eventConstants';
import { MALE } from '@Constants/genderConstants';

/**
 * Participants mocksEngine generates for an event's category are eligible for it, by the factory's
 * own eligibility check — the one addEventEntries enforces.
 *
 * Two ways they were not:
 * - Birth dates were drawn from whole calendar years around the category's limits, then any day of
 *   them. "U18" at 2026-11-20 means born on or after 2008-11-21, but every day of 2008 was drawn, so
 *   most of a year's worth of generated players were 18. The check is at both event ends, so the
 *   window must hold on the last day too.
 * - Ratings were filed under the category's name (`SCALE.RATING.SINGLES.<categoryName>`) when it had
 *   one, but a rating category is checked, and DrawMatic rates, by its ratingType: a rating category
 *   with a name of its own generated players with "Missing DUPR rating".
 */
function ineligibleEntries(tournamentRecord: any): string[] {
  tournamentEngine.setState(tournamentRecord);
  const participants: any[] = tournamentEngine.getParticipants().participants ?? [];
  const byId = new Map(participants.map((p) => [p.participantId, p]));
  const ineligible: string[] = [];
  for (const event of tournamentRecord.events ?? []) {
    for (const { participantId } of event.entries ?? []) {
      const entered = byId.get(participantId);
      const individuals =
        entered?.participantType === 'INDIVIDUAL'
          ? [entered]
          : (entered?.individualParticipantIds ?? []).map((id: string) => byId.get(id));
      for (const participant of individuals) {
        const result: any = getParticipantEligibility({ participant, event, tournamentRecord });
        if (!result.eligible)
          ineligible.push(`${event.eventName}: ${result.rejectionReasons?.map((r: any) => r.reason).join('; ')}`);
      }
    }
  }
  return ineligible;
}

it.each([
  ['U18', 'under 18'],
  ['18U', '18 and under'],
  ['U16', 'under 16'],
  ['18O', '18 and over'],
])('generates players eligible for an age category %s (%s), at both ends of a week-long event', (ageCategoryCode) => {
  // several seeds, each a different draw of birth days, so a window that only usually holds is caught
  for (const seed of [1, 2, 3, 4, 5]) {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ category: { categoryName: ageCategoryCode, ageCategoryCode }, drawSize: 32 }],
      startDate: '2026-11-20',
      endDate: '2026-11-27',
      nonRandom: seed,
    });
    expect(ineligibleEntries(tournamentRecord)).toEqual([]);
  }
});

it('files ratings under the ratingType, so a named rating category is rated and its players eligible', () => {
  const category = { categoryName: 'DUPR 3.0-4.49', ratingType: DUPR, ratingMin: 3, ratingMax: 4.49 };
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ category, drawSize: 16 }],
    startDate: '2026-11-20',
  });
  expect(ineligibleEntries(tournamentRecord)).toEqual([]);

  tournamentEngine.setState(tournamentRecord);
  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: ['INDIVIDUAL'] },
  });
  const itemTypes = new Set(participants?.flatMap((p: any) => p.timeItems?.map((t: any) => t.itemType) ?? []));
  expect(itemTypes).toContain('SCALE.RATING.SINGLES.DUPR');
  expect(itemTypes).not.toContain('SCALE.RATING.SINGLES.DUPR 3.0-4.49');
});

it('generates eligible members of a gendered age-category doubles event', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { category: { categoryName: 'U18', ageCategoryCode: 'U18' }, eventType: DOUBLES, gender: MALE, drawSize: 16 },
    ],
    startDate: '2026-11-20',
    endDate: '2026-11-22',
  });
  expect(ineligibleEntries(tournamentRecord)).toEqual([]);
});
