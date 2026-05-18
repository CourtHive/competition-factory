import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';

// Regression for the "Explain why over capacity" enrichment. jinnScheduler
// historically returned only flat `overLimitMatchUpIds[date]: string[]` —
// operators had no way to see WHICH participant on a refused matchUp hit
// WHICH counter. The additive `overLimitMatchUpDetails[date]` payload
// surfaces that detail per attempt.
describe('overLimitMatchUpDetails', () => {
  it('populates participant + counter detail when a matchUp is refused for daily limits', () => {
    const startDate = '2024-06-15';
    const endDate = '2024-06-21';
    const venueId = 'venue-overlimit-detail';
    // 16-draw SE with SINGLES limit of 2/day. R1 + R2 = 12 matchUps. Once
    // R1+R2 are placed every R1 winner has SINGLES counter = 2 (their R1
    // result already advanced them; we'll seed that by pre-completing R1).
    // Then adding R3 to the Day Plan forces refusals.
    const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'CC', venueAbbreviation: 'CC', courtsCount: 4, venueId }],
      drawProfiles: [{ drawSize: 16 }],
      startDate,
      endDate,
    });

    tournamentEngine.setState(tournamentRecord);
    tournamentEngine.attachPolicies({ policyDefinitions: POLICY_SCHEDULING_DEFAULT });

    const drawId = drawIds[0];
    const { tournamentId } = tournamentRecord;
    const {
      event: { eventId },
      drawDefinition: {
        structures: [{ structureId }],
      },
    } = tournamentEngine.getEvent({ drawId });

    // Profile asks for all 4 rounds on the same day; SINGLES limit of 2
    // means by R3 most participants are over cap.
    for (const roundNumber of [1, 2, 3, 4]) {
      const addResult = tournamentEngine.addSchedulingProfileRound({
        round: { tournamentId, eventId, drawId, structureId, roundNumber },
        scheduleDate: startDate,
        venueId,
      });
      expect(addResult.success).toEqual(true);
    }

    const result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [startDate] });
    expect(result.success).toEqual(true);

    const overLimitIds: string[] = result.overLimitMatchUpIds[startDate] ?? [];
    expect(overLimitIds.length).toBeGreaterThan(0);

    // Additive payload is present and shape-correct.
    expect(result.overLimitMatchUpDetails).toBeDefined();
    const details: any[] = result.overLimitMatchUpDetails[startDate] ?? [];
    expect(details.length).toBeGreaterThan(0);

    for (const detail of details) {
      expect(typeof detail.matchUpId).toEqual('string');
      expect(typeof detail.attemptedTime).toEqual('string');
      expect(Array.isArray(detail.participants)).toEqual(true);
      expect(detail.participants.length).toBeGreaterThan(0);

      for (const p of detail.participants) {
        expect(typeof p.participantId).toEqual('string');
        expect(Array.isArray(p.atLimitCounters)).toEqual(true);
        // Every refused participant must have at least one counter at limit
        // (otherwise checkDailyLimits would not have rejected them).
        expect(p.atLimitCounters.length).toBeGreaterThan(0);
        for (const c of p.atLimitCounters) {
          expect(typeof c.counter).toEqual('string');
          expect(c.count).toBeGreaterThanOrEqual(c.limit);
          expect(c.limit).toBeGreaterThan(0);
        }
      }
    }

    // Every matchUpId in overLimitMatchUpIds must appear at least once
    // in the details payload (every refusal got an explanation).
    const detailIds = new Set(details.map((d) => d.matchUpId));
    for (const id of overLimitIds) {
      expect(detailIds.has(id)).toEqual(true);
    }
  });
});
