/**
 * Verifies the Phase 1 policyRegistry indirection: getEventRankingPoints /
 * getTournamentPoints fall back to policyRegistry.lookup when policyDefinitions
 * (and tournament-attached policies) are absent and policyName is provided.
 */
import { expect, it, describe, beforeEach, afterEach } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

import { policyRegistry } from '@Global/policyRegistry';

// constants and fixtures
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { POLICY_RANKING_POINTS_BASIC } from '@Fixtures/policies/POLICY_RANKING_POINTS_BASIC';
import { MISSING_POLICY_DEFINITION } from '@Constants/errorConditionConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { SINGLES } from '@Constants/eventConstants';

let eventId: string;

beforeEach(() => {
  const result = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, drawType: SINGLE_ELIMINATION, eventType: SINGLES }],
    completeAllMatchUps: true,
    randomWinningSide: true,
  });
  eventId = result.eventIds[0];
  tournamentEngine.setState(result.tournamentRecord);
});

afterEach(() => policyRegistry.clear());

describe('policyRegistry resolution in scale queries', () => {
  it('returns MISSING_POLICY_DEFINITION when no policy source is available', () => {
    const result = tournamentEngine.getEventRankingPoints({ eventId });
    expect(result.error).toEqual(MISSING_POLICY_DEFINITION);
  });

  it('returns MISSING_POLICY_DEFINITION when policyName is unknown to the registry', () => {
    const result = tournamentEngine.getEventRankingPoints({ eventId, policyName: 'UNREGISTERED' });
    expect(result.error).toEqual(MISSING_POLICY_DEFINITION);
  });

  it('resolves via the registry when policyName matches a registered policy', () => {
    policyRegistry.register({
      policyType: POLICY_TYPE_RANKING_POINTS,
      definition: POLICY_RANKING_POINTS_BASIC[POLICY_TYPE_RANKING_POINTS],
      name: 'BASIC',
    });

    const viaRegistry: any = tournamentEngine.getEventRankingPoints({ eventId, policyName: 'BASIC' });
    const viaExplicit: any = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_BASIC,
      eventId,
    });

    expect(viaRegistry.success).toBe(true);
    expect(viaRegistry.eventAwards.length).toEqual(viaExplicit.eventAwards.length);
    expect(viaRegistry.eventAwards[0].positionPoints).toEqual(viaExplicit.eventAwards[0].positionPoints);
  });

  it('prefers explicit policyDefinitions over registry when both are present', () => {
    const wrongDefinition = { awardProfiles: [] };
    policyRegistry.register({
      policyType: POLICY_TYPE_RANKING_POINTS,
      definition: wrongDefinition,
      name: 'BASIC',
    });

    const result: any = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_BASIC,
      policyName: 'BASIC',
      eventId,
    });

    expect(result.success).toBe(true);
    expect(result.eventAwards.length).toBeGreaterThan(0);
  });

  it('resolves through getTournamentPoints with policyName when called directly', () => {
    policyRegistry.register({
      policyType: POLICY_TYPE_RANKING_POINTS,
      definition: POLICY_RANKING_POINTS_BASIC[POLICY_TYPE_RANKING_POINTS],
      name: 'BASIC',
    });

    const tournamentRecord = tournamentEngine.getTournament().tournamentRecord;
    const result: any = tournamentEngine.getTournamentPoints({
      tournamentRecord,
      policyName: 'BASIC',
    });

    expect(result.success).toBe(true);
    expect(Object.keys(result.personPoints ?? {}).length).toBeGreaterThan(0);
  });
});
