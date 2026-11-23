import { POLICY_TYPE_COMPETITIVE_BANDS } from '@Constants/policyConstants';
import { getContextContent } from '@Query/hierarchical/getContextContent';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

describe('getContextContent', () => {
  it('returns empty policies when no contextProfile', () => {
    const result = getContextContent({});

    expect(result).toEqual({ policies: {} });
  });

  it('returns empty policies when contextProfile has no withCompetitiveness', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = getContextContent({
      tournamentRecord,
      contextProfile: {},
    });

    expect(result).toEqual({ policies: {} });
  });

  it('returns competitive bands policy when withCompetitiveness is true', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = getContextContent({
      tournamentRecord,
      contextProfile: { withCompetitiveness: true },
    });

    expect(result.policies[POLICY_TYPE_COMPETITIVE_BANDS]).toBeDefined();
  });

  it('uses policyDefinitions when provided', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const customPolicy = {
      [POLICY_TYPE_COMPETITIVE_BANDS]: {
        bandings: [{ min: 0, max: 100 }],
      },
    };

    const result = getContextContent({
      tournamentRecord,
      policyDefinitions: customPolicy,
      contextProfile: { withCompetitiveness: true },
    });

    expect(result.policies[POLICY_TYPE_COMPETITIVE_BANDS]).toEqual(customPolicy[POLICY_TYPE_COMPETITIVE_BANDS]);
  });

  it('falls back to tournament policy when policyDefinitions not provided', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = getContextContent({
      tournamentRecord,
      contextProfile: { withCompetitiveness: true },
    });

    // Should get some policy (either from tournament or default)
    expect(result.policies[POLICY_TYPE_COMPETITIVE_BANDS]).toBeDefined();
  });

  it('handles drawDefinition parameter', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const result = getContextContent({
      tournamentRecord,
      drawDefinition: tournamentRecord.events[0].drawDefinitions[0],
      contextProfile: { withCompetitiveness: true },
    });

    expect(result.policies[POLICY_TYPE_COMPETITIVE_BANDS]).toBeDefined();
  });

  it('handles event parameter', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const result = getContextContent({
      tournamentRecord,
      event: tournamentRecord.events[0],
      contextProfile: { withCompetitiveness: true },
    });

    expect(result.policies[POLICY_TYPE_COMPETITIVE_BANDS]).toBeDefined();
  });

  it('handles all parameters together', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const result = getContextContent({
      tournamentRecord,
      drawDefinition: tournamentRecord.events[0].drawDefinitions[0],
      event: tournamentRecord.events[0],
      contextProfile: { withCompetitiveness: true },
    });

    expect(result.policies[POLICY_TYPE_COMPETITIVE_BANDS]).toBeDefined();
  });

  it('handles missing tournamentRecord', () => {
    const result = getContextContent({
      contextProfile: { withCompetitiveness: true },
    });

    // Should still return default policy
    expect(result.policies[POLICY_TYPE_COMPETITIVE_BANDS]).toBeDefined();
  });

  it('handles null contextProfile', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = getContextContent({
      tournamentRecord,
      contextProfile: null,
    });

    expect(result).toEqual({ policies: {} });
  });

  it('handles undefined contextProfile', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = getContextContent({
      tournamentRecord,
      contextProfile: undefined,
    });

    expect(result).toEqual({ policies: {} });
  });

  it('only adds competitive bands when specifically requested', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = getContextContent({
      tournamentRecord,
      contextProfile: {
        withCompetitiveness: false,
        // Some other profile option
        someOtherOption: true,
      } as any,
    });

    expect(result.policies[POLICY_TYPE_COMPETITIVE_BANDS]).toBeUndefined();
  });

  it('uses default policy when no policies found', () => {
    // Create tournament with no policies
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    delete tournamentRecord.policyDefinitions;

    const result = getContextContent({
      tournamentRecord,
      contextProfile: { withCompetitiveness: true },
    });

    // Should fall back to default competitive bands policy
    expect(result.policies[POLICY_TYPE_COMPETITIVE_BANDS]).toBeDefined();
  });
});
