import { POLICY_RANKING_POINTS_BASIC } from '@Fixtures/policies/POLICY_RANKING_POINTS_BASIC';
import { POLICY_RANKING_POINTS_ATP } from '@Fixtures/policies/POLICY_RANKING_POINTS_ATP';
import { POLICY_RANKING_POINTS_ITF_WTT } from '@Fixtures/policies/POLICY_RANKING_POINTS_ITF_WTT';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { ATP, ITF, TENNIS_EUROPE, UNSPECIFIED } from '@Constants/pointsAuthorityConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

describe('pointsAuthority round-trips from policy to award', () => {
  it('stamps ATP on every award emitted from the ATP policy', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32, drawType: SINGLE_ELIMINATION }],
      completeAllMatchUps: true,
      randomWinningSide: true,
    });
    tournamentEngine.setState(tournamentRecord);

    // ATP 250, 32-draw is level 8 — chosen because it's the most common ATP main-tour size.
    const result = tournamentEngine.getEventRankingPoints({
      eventId,
      policyDefinitions: POLICY_RANKING_POINTS_ATP,
      level: 8,
    });

    expect(result.eventAwards.length).toBeGreaterThan(0);
    for (const award of result.eventAwards) {
      expect(award.pointsAuthority).toEqual(ATP);
    }
  });

  it('stamps ITF on every award emitted from the ITF WTT policy', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32, drawType: SINGLE_ELIMINATION }],
      completeAllMatchUps: true,
      randomWinningSide: true,
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getEventRankingPoints({
      eventId,
      policyDefinitions: POLICY_RANKING_POINTS_ITF_WTT,
      level: 1,
    });

    if (result.eventAwards?.length > 0) {
      for (const award of result.eventAwards) {
        expect(award.pointsAuthority).toEqual(ITF);
      }
    }
  });

  it('leaves pointsAuthority undefined when the policy does not declare one (Basic)', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
      completeAllMatchUps: true,
      randomWinningSide: true,
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getEventRankingPoints({
      eventId,
      policyDefinitions: POLICY_RANKING_POINTS_BASIC,
    });

    expect(result.eventAwards.length).toBeGreaterThan(0);
    for (const award of result.eventAwards) {
      expect(award.pointsAuthority).toBeUndefined();
    }
  });

  it('persists an explicit pointsAuthority verbatim from an inline custom policy', () => {
    const customPolicy = {
      [POLICY_TYPE_RANKING_POINTS]: {
        policyName: 'Custom Federation Points',
        pointsAuthority: UNSPECIFIED,
        awardProfiles: POLICY_RANKING_POINTS_BASIC[POLICY_TYPE_RANKING_POINTS].awardProfiles,
      },
    };

    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
      completeAllMatchUps: true,
      randomWinningSide: true,
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getEventRankingPoints({ eventId, policyDefinitions: customPolicy });

    expect(result.eventAwards.length).toBeGreaterThan(0);
    for (const award of result.eventAwards) {
      expect(award.pointsAuthority).toEqual(UNSPECIFIED);
    }
  });
});

describe('AwardProfile.pointsAuthority overrides RankingPolicy.pointsAuthority', () => {
  // Use BASIC's profile shape and inject per-profile authority on top.
  // BASIC has a single award profile, so every emitted award flows
  // through that profile and we can observe the override directly.
  const basicProfiles = POLICY_RANKING_POINTS_BASIC[POLICY_TYPE_RANKING_POINTS].awardProfiles;

  it('stamps the profile authority on awards when the profile declares one', () => {
    const customPolicy = {
      [POLICY_TYPE_RANKING_POINTS]: {
        policyName: 'TE Hybrid 2026',
        pointsAuthority: TENNIS_EUROPE, // policy default
        awardProfiles: basicProfiles.map((p) => ({ ...p, pointsAuthority: ITF })), // profile override
      },
    };

    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
      completeAllMatchUps: true,
      randomWinningSide: true,
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getEventRankingPoints({ eventId, policyDefinitions: customPolicy });

    expect(result.eventAwards.length).toBeGreaterThan(0);
    for (const award of result.eventAwards) {
      // Profile-level ITF wins over policy-level TENNIS_EUROPE.
      expect(award.pointsAuthority).toEqual(ITF);
    }
  });

  it('falls back to policy authority when the matched profile leaves it unset', () => {
    const customPolicy = {
      [POLICY_TYPE_RANKING_POINTS]: {
        policyName: 'TE Hybrid 2026',
        pointsAuthority: TENNIS_EUROPE, // policy default
        awardProfiles: basicProfiles, // no per-profile override
      },
    };

    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
      completeAllMatchUps: true,
      randomWinningSide: true,
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getEventRankingPoints({ eventId, policyDefinitions: customPolicy });

    expect(result.eventAwards.length).toBeGreaterThan(0);
    for (const award of result.eventAwards) {
      expect(award.pointsAuthority).toEqual(TENNIS_EUROPE);
    }
  });

  it('emits awards stamped only with the profile authority when policy authority is unset', () => {
    const customPolicy = {
      [POLICY_TYPE_RANKING_POINTS]: {
        policyName: 'Profile-Only Authority',
        // no policy-level pointsAuthority
        awardProfiles: basicProfiles.map((p) => ({ ...p, pointsAuthority: ATP })),
      },
    };

    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
      completeAllMatchUps: true,
      randomWinningSide: true,
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getEventRankingPoints({ eventId, policyDefinitions: customPolicy });

    expect(result.eventAwards.length).toBeGreaterThan(0);
    for (const award of result.eventAwards) {
      expect(award.pointsAuthority).toEqual(ATP);
    }
  });
});
