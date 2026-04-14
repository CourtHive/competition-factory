import { POLICY_RANKING_POINTS_ATP } from '@Fixtures/policies/POLICY_RANKING_POINTS_ATP';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { mocksEngine } from '../../..';
import { describe, expect, it } from 'vitest';

import { MISSING_POLICY_DEFINITION } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { ROUND_ROBIN_WITH_PLAYOFF, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';

const policyDefinitions = POLICY_RANKING_POINTS_ATP;

describe('getApplicableAwardProfileLevels', () => {
  it('returns error without ranking points policy', () => {
    const drawProfiles = [{ drawSize: 32 }];
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);

    let result: any = scaleEngine.getApplicableAwardProfileLevels();
    expect(result.error).toEqual(MISSING_POLICY_DEFINITION);
  });

  it('excludes ATP Finals (L2) for SINGLE_ELIMINATION draw', () => {
    const drawProfiles = [{ drawSize: 32 }];
    const {
      tournamentRecord,
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);
    tournamentEngine.attachPolicies({ policyDefinitions });

    let result: any = scaleEngine.getApplicableAwardProfileLevels({ drawId, eventId });
    expect(result.success).toEqual(true);
    expect(result.levels).not.toContain(2);

    // Levels that have SE-compatible profiles should be present
    expect(result.levels).toContain(1);
    expect(result.levels).toContain(3);
    expect(result.levels).toContain(8);
    expect(result.levels).toContain(15);

    // Verify levels are sorted numerically
    const sorted = [...result.levels].sort((a, b) => a - b);
    expect(result.levels).toEqual(sorted);
  });

  it('includes ATP Finals (L2) for ROUND_ROBIN_WITH_PLAYOFF draw', () => {
    const drawProfiles = [{ drawSize: 8, drawType: ROUND_ROBIN_WITH_PLAYOFF }];
    const {
      tournamentRecord,
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);
    tournamentEngine.attachPolicies({ policyDefinitions });

    let result: any = scaleEngine.getApplicableAwardProfileLevels({ drawId, eventId });
    expect(result.success).toEqual(true);
    expect(result.levels).toContain(2);
  });

  it('returns all levels when no draw/event context provided', () => {
    const drawProfiles = [{ drawSize: 32 }];
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);
    tournamentEngine.attachPolicies({ policyDefinitions });

    // No eventId or drawId — should return all levels from the policy
    let result: any = scaleEngine.getApplicableAwardProfileLevels();
    expect(result.success).toEqual(true);
    expect(result.levels).toContain(1);
    expect(result.levels).toContain(2);
    expect(result.levels).toContain(15);
  });

  it('filters by event type when scoped to DOUBLES event', () => {
    const drawProfiles = [{ drawSize: 16, eventType: DOUBLES, drawType: SINGLE_ELIMINATION }];
    const {
      tournamentRecord,
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);
    tournamentEngine.attachPolicies({ policyDefinitions });

    let result: any = scaleEngine.getApplicableAwardProfileLevels({ drawId, eventId });
    expect(result.success).toEqual(true);

    // L2 excluded (requires RRWPO) even for doubles
    expect(result.levels).not.toContain(2);

    // Doubles profiles exist for L1, L3-15
    expect(result.levels).toContain(1);
    expect(result.levels).toContain(5);
  });

  it('respects maxLevel constraint in custom policy', () => {
    const customPolicy = {
      [POLICY_TYPE_RANKING_POINTS]: {
        policyName: 'Test with maxLevel',
        awardProfiles: [
          {
            profileName: 'Capped profile',
            eventTypes: [SINGLES],
            maxLevel: 5,
            finishingPositionRanges: {
              1: { level: { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20 } },
              2: { level: { 1: 50, 2: 40, 3: 30, 4: 20, 5: 10 } },
            },
          },
        ],
      },
    };

    const drawProfiles = [{ drawSize: 32 }];
    const {
      tournamentRecord,
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);

    let result: any = scaleEngine.getApplicableAwardProfileLevels({
      policyDefinitions: customPolicy,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.levels).toEqual([1, 2, 3, 4, 5]);

    // Level 6 and above should not be present
    expect(result.levels).not.toContain(6);
    expect(result.levels).not.toContain(10);
  });

  it('accepts policyDefinitions as parameter override', () => {
    const drawProfiles = [{ drawSize: 32 }];
    const {
      tournamentRecord,
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);

    // No attached policy — pass directly
    let result: any = scaleEngine.getApplicableAwardProfileLevels({
      policyDefinitions,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.levels).not.toContain(2);
    expect(result.levels).toContain(1);
  });
});
