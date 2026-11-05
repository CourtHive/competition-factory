import { POLICY_RATINGS_ELO_538_NFL } from '@Fixtures/policies/POLICY_RATINGS_ELO_538_NFL';
import { POLICY_RATINGS_ELO_538_NBA } from '@Fixtures/policies/POLICY_RATINGS_ELO_538_NBA';
import { marginMultiplier } from '@Generators/scales/ratingsPolicyRules';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';

// FiveThirtyEight's NFL and NBA Elo, against the numbers their methodology pages publish

const NFL = POLICY_RATINGS_ELO_538_NFL[POLICY_TYPE_RATINGS];
const NBA = POLICY_RATINGS_ELO_538_NBA[POLICY_TYPE_RATINGS];

describe('the published examples', () => {
  it("NBA: the Warriors (218 Elo ahead with home court) win by 4, × ~0.54; the Rockets' upset by 4, × ~0.77", () => {
    // FiveThirtyEight, "How We Calculate NBA Elo Ratings": 4.74 / 8.81 and 4.74 / 6.19
    expect(marginMultiplier({ rule: NBA.margin, marginOfVictory: 4, winnerEloDiff: 218 })).toBeCloseTo(0.54, 2);
    expect(marginMultiplier({ rule: NBA.margin, marginOfVictory: 4, winnerEloDiff: -218 })).toBeCloseTo(0.77, 2);
  });

  it('NFL: a tie takes × 1.525 (2.2 ln 2), and a one-point win at even strength ln 2', () => {
    expect(marginMultiplier({ rule: NFL.margin, marginOfVictory: 0, draw: true })).toEqual(1.525);
    expect(marginMultiplier({ rule: NFL.margin, marginOfVictory: 1 })).toBeCloseTo(Math.log(2), 10);
  });
});

function rated(ratingsPolicy: any, sides: [number, number]) {
  const matchUpFormat = 'SET1A-S:T60P';
  // a round robin, where a level result may stand
  const drawProfiles = [{ drawSize: 3, drawType: ROUND_ROBIN, matchUpFormat }];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles });
  tournamentEngine.setState(tournamentRecord);
  const { matchUpId, drawId } = tournamentEngine.allTournamentMatchUps().matchUps[0];
  const [side1Score, side2Score] = sides;
  let winningSide: number | undefined;
  if (side1Score !== side2Score) winningSide = side1Score > side2Score ? 1 : 2;
  const outcome = {
    matchUpStatus: COMPLETED,
    score: { sets: [{ setNumber: 1, side1Score, side2Score }] },
    winningSide,
  };
  expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome }).success).toEqual(true);
  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId, inContext: true });
  const ids = matchUp.sides.map((side) => side.participantId);
  const result: any = scaleEngine.generateDynamicRatings({ matchUpIds: [matchUpId], ratingsPolicy });
  return ids.map((id) => result.modifiedScaleValues[id].scaleValue);
}

describe('the presets through generateDynamicRatings', () => {
  it('NBA: a 51-point win at even strength moves K × 54^0.8 / 7.5 × 0.5 ≈ 32.4', () => {
    expect(rated(NBA, [155, 104])).toEqual([1532, 1468]);
  });

  it('NFL: a 40-0 win at even strength moves K × ln 41 × 0.5 ≈ 37.1, and a 20-20 tie nothing', () => {
    expect(rated(NFL, [40, 0])).toEqual([1537, 1463]);
    expect(rated(NFL, [20, 20])).toEqual([1500, 1500]);
  });
});
