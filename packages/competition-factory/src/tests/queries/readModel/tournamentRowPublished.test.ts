import { tournamentRow } from '@Query/readModel/readModelRows';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

/**
 * `tournamentRow().published` is the factory's tournament roll-up, not a subset of it.
 *
 * It used to read `orderOfPlay || participants` only, so a tournament whose only published component
 * was an event's draw projected as unpublished while the provider calendar — which reads
 * `getPublishState(...).tournament.status.published` — listed it as public. Every case below compares
 * the row against that roll-up, so the two cannot drift apart again without a failure here.
 */

function rollUp(): boolean {
  return tournamentEngine.getPublishState().publishState?.tournament?.status?.published === true;
}

function rowPublished(): boolean {
  return tournamentRow(tournamentEngine.getTournament().tournamentRecord).published;
}

function seed() {
  return mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 16 },
    drawProfiles: [{ drawSize: 4 }],
    setState: true,
  });
}

describe('tournamentRow published — the tournament roll-up', () => {
  it('is published when the ONLY published component is an event draw', () => {
    const {
      eventIds: [eventId],
    } = seed();

    expect(rowPublished()).toBe(false);
    tournamentEngine.publishEvent({ eventId });

    expect(rollUp()).toBe(true);
    expect(rowPublished()).toBe(true);
  });

  it('returns to unpublished when that event is unpublished', () => {
    const {
      eventIds: [eventId],
    } = seed();

    tournamentEngine.publishEvent({ eventId });
    expect(rowPublished()).toBe(true);
    tournamentEngine.unPublishEvent({ eventId });

    expect(rollUp()).toBe(false);
    expect(rowPublished()).toBe(false);
  });

  it('agrees with the roll-up for every publishable component, and the cases are not degenerate', () => {
    const outcomes: boolean[] = [];
    const cases: Array<(eventId: string) => void> = [
      () => undefined,
      () => tournamentEngine.publishOrderOfPlay(),
      () => tournamentEngine.publishParticipants(),
      (eventId) => tournamentEngine.publishEvent({ eventId }),
    ];

    for (const publish of cases) {
      const {
        eventIds: [eventId],
      } = seed();
      publish(eventId);
      expect(rowPublished()).toBe(rollUp());
      outcomes.push(rowPublished());
    }

    // Control: the comparison above is only meaningful if both answers actually occurred.
    expect(outcomes).toEqual([false, true, true, true]);
  });
});
