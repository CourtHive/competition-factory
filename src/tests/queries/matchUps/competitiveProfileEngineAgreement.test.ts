import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and fixtures
import POLICY_COMPETITIVE_BANDS_DEFAULT from '@Fixtures/policies/POLICY_COMPETITIVE_BANDS_DEFAULT';
import { COMPETITIVE, DECISIVE, RETIRED, ROUTINE, WALKOVER } from '@Constants/statsConstants';
import { POLICY_TYPE_COMPETITIVE_BANDS } from '@Constants/policyConstants';
import { WTN } from '@Constants/ratingConstants';

const CONTEXT_PROFILE = { withCompetitiveness: true, withScaleValues: true };

function seededMatchUps() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, category: { ratingType: WTN } }],
    completeAllMatchUps: true,
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps({ contextProfile: CONTEXT_PROFILE, inContext: true });
  return matchUps ?? [];
}

describe('getCompetitiveProfile agrees with the existing realized-band surfaces', () => {
  it('reproduces the per-matchUp bands that allTournamentMatchUps already attaches', () => {
    const matchUps = seededMatchUps();

    // The pre-existing path: competitiveProfile attached during enrichment.
    const attachedTally: any = { [DECISIVE]: 0, [ROUTINE]: 0, [COMPETITIVE]: 0 };
    for (const matchUp of matchUps) {
      if (!matchUp.winningSide) continue;
      const band = matchUp.competitiveProfile?.competitiveness;
      attachedTally[band] = (attachedTally[band] ?? 0) + 1;
    }

    // Tripwire: a vacuous comparison (all zeros, or every matchUp in one band)
    // would let a broken aggregate pass.
    const nonZeroBands = Object.values(attachedTally).filter((count: any) => count > 0).length;
    expect(nonZeroBands).toBeGreaterThan(1);

    const profile: any = tournamentEngine.getCompetitiveProfile({ matchUps });

    expect(profile.realized.counts).toEqual(attachedTally);
    expect(profile.realized.completed).toEqual(matchUps.filter(({ winningSide }) => winningSide).length);
  });

  it('reproduces getMatchUpsStats percentages', () => {
    const matchUps = seededMatchUps();

    const stats: any = tournamentEngine.getMatchUpsStats({ matchUps });
    // The comparison is only apples-to-apples with no walkovers/retirements,
    // which getMatchUpsStats counts on a different denominator basis.
    expect(stats.competitiveBands[WALKOVER]).toEqual(0);
    expect(stats.competitiveBands[RETIRED]).toEqual(0);

    const profile: any = tournamentEngine.getCompetitiveProfile({ matchUps });

    for (const band of [DECISIVE, ROUTINE, COMPETITIVE]) {
      expect(profile.realized.ratios[band]).toBeCloseTo(stats.competitiveBands[band], 1);
    }
  });
});

describe('the signed exposure axis resolves through the engine and hydrated participants', () => {
  it('bands every rated matchUp for a participant', () => {
    const matchUps = seededMatchUps();

    const participantId = matchUps.find(({ sides }) => sides?.[0]?.participant?.participantId)?.sides?.[0]?.participant
      ?.participantId;
    expect(participantId).toBeDefined();

    const profile: any = tournamentEngine.getCompetitiveProfile({
      policyDefinitions: POLICY_COMPETITIVE_BANDS_DEFAULT,
      scaleName: WTN,
      participantId,
      matchUps,
    });

    expect(profile.matchUpsCount).toBeGreaterThan(0);
    // WTN ratings were seeded, so the mock participants resolve on this scale.
    expect(profile.exposure.rated).toBeGreaterThan(0);
    expect(profile.exposure.deltaBandsApplied).toEqual(true);

    // Every rated matchUp landed in exactly one band, and the default policy's
    // five keys are all present (zero-filled when unused).
    const counted: number = Object.values(profile.exposure.counts).reduce((a: any, b: any) => a + b, 0);
    expect(counted).toEqual(profile.exposure.rated);
    expect(Object.keys(profile.exposure.counts)).toHaveLength(5);

    // Ratios are percentages of the rated subset.
    const ratioTotal: number = Object.values(profile.exposure.ratios).reduce((a: any, b: any) => a + b, 0);
    expect(ratioTotal).toBeCloseTo(100, 1);
  });

  it('exposes the signed delta on a single matchUp through the engine', () => {
    const matchUps = seededMatchUps();
    const matchUp = matchUps.find(({ winningSide, sides }) => winningSide && sides?.length === 2);

    const withoutScale: any = tournamentEngine.getMatchUpCompetitiveProfile({ matchUp });
    const withScale: any = tournamentEngine.getMatchUpCompetitiveProfile({
      policyDefinitions: POLICY_COMPETITIVE_BANDS_DEFAULT,
      scaleName: WTN,
      matchUp,
    });

    // Realized output is unchanged by the presence of the signed axis.
    expect(withScale.competitiveness).toEqual(withoutScale.competitiveness);
    expect(withScale.pctSpread).toEqual(withoutScale.pctSpread);
    expect(withoutScale.signedDelta).toBeUndefined();

    expect(typeof withScale.signedDelta).toEqual('number');

    const bandKeys = POLICY_COMPETITIVE_BANDS_DEFAULT[POLICY_TYPE_COMPETITIVE_BANDS].deltaBands.map(({ key }) => key);
    expect(bandKeys).toContain(withScale.deltaBand);
  });
});
