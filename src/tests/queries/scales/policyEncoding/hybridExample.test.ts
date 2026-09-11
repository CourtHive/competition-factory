import { POLICY_RANKING_POINTS_HYBRID_EXAMPLE } from '@Tests/fixtures/policies/POLICY_RANKING_POINTS_HYBRID_EXAMPLE';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { validateRankingPolicy } from './validatePolicy';
import { describe, expect, it } from 'vitest';

import { ATP, ITF_JUNIOR, TENNIS_EUROPE } from '@Constants/pointsAuthorityConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

describe('Federated Hybrid Example policy encoding', () => {
  const { policy, valid, errorsText } = validateRankingPolicy(POLICY_RANKING_POINTS_HYBRID_EXAMPLE);

  it('validates against rankingPolicy.schema.json (proves pointsAuthority is schema-allowed)', () => {
    if (!valid) console.error(errorsText);
    expect(valid).toEqual(true);
  });

  it('declares TENNIS_EUROPE as the policy-level authority default', () => {
    expect(policy.policyName).toEqual('Federated Hybrid Example');
    expect(policy.pointsAuthority).toEqual(TENNIS_EUROPE);
  });

  it('exposes three crossover profiles plus a TE-qualifying profile', () => {
    const names = policy.awardProfiles.map((p: any) => p.profileName);
    expect(names).toContain('TE Circuit 18&U (example)');
    expect(names).toContain('TE Circuit 18&U Qualifying (example)');
    expect(names).toContain('ITF Junior crossover (example)');
    expect(names).toContain('ATP crossover (example)');
  });

  it('overrides authority on ITF and ATP profiles; leaves TE profile unset to inherit', () => {
    const find = (name: string) => policy.awardProfiles.find((p: any) => p.profileName === name);
    expect(find('TE Circuit 18&U (example)').pointsAuthority).toBeUndefined();
    expect(find('ITF Junior crossover (example)').pointsAuthority).toEqual(ITF_JUNIOR);
    expect(find('ATP crossover (example)').pointsAuthority).toEqual(ATP);
  });
});

describe('Federated Hybrid Example profile selection at compute time', () => {
  function setupTournament(category: any, level: number | undefined) {
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION, category }],
      completeAllMatchUps: true,
      randomWinningSide: true,
    });
    tournamentEngine.setState(tournamentRecord);
    return tournamentEngine.getEventRankingPoints({
      eventId,
      policyDefinitions: POLICY_RANKING_POINTS_HYBRID_EXAMPLE,
      level,
    });
  }

  it('TE-circuit profile match → awards stamped TENNIS_EUROPE (inherited from policy)', () => {
    // 18U event, no level → matches teCircuit18U which has no `levels`.
    const result = setupTournament({ ageCategoryCode: '18U' }, undefined);
    expect(result.eventAwards.length).toBeGreaterThan(0);
    for (const award of result.eventAwards) {
      expect(award.pointsAuthority).toEqual(TENNIS_EUROPE);
    }
  });

  it('ITF Junior crossover match → awards stamped ITF_JUNIOR (profile override)', () => {
    // 18U event with level=5 → matches itfJuniorCrossover (levels: [4,5,6]).
    const result = setupTournament({ ageCategoryCode: '18U' }, 5);
    expect(result.eventAwards.length).toBeGreaterThan(0);
    for (const award of result.eventAwards) {
      expect(award.pointsAuthority).toEqual(ITF_JUNIOR);
    }
  });

  it('ATP crossover match → awards stamped ATP (profile override)', () => {
    // No 18U category + level=8 → matches atpCrossover (levels: [7,8,9,10,11]).
    const result = setupTournament(undefined, 8);
    expect(result.eventAwards.length).toBeGreaterThan(0);
    for (const award of result.eventAwards) {
      expect(award.pointsAuthority).toEqual(ATP);
    }
  });
});
