import { POLICY_RATINGS_ELO_538_TENNIS } from '@Fixtures/policies/POLICY_RATINGS_ELO_538_TENNIS';
import { POLICY_RATINGS_DEFAULT } from '@Fixtures/policies/POLICY_RATINGS_DEFAULT';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { expect, it } from 'vitest';

// constants
import { MISSING_VALUE } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';

// the ratings policy (Mentat planning/RATINGS_POLICY_PLAN.md; CA 2026-11-05): the default is Huang 2014's flat-K Elo,
// K = 25 for both players, the actual result by sets played; FiveThirtyEight's K needs the caller's career counts

function rate({
  matchUpFormat = 'SET3-S:6/TB7',
  scoreString,
  matchUpStatus,
  policyDefinitions,
  params = {},
}: {
  matchUpFormat?: string;
  scoreString?: string;
  matchUpStatus?: string;
  policyDefinitions?: any;
  params?: any;
}) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 2,
        matchUpFormat,
        outcomes: [{ roundNumber: 1, roundPosition: 1, scoreString, matchUpStatus, winningSide: 1 }],
      },
    ],
    policyDefinitions,
  });
  tournamentEngine.setState(tournamentRecord);
  const matchUp = tournamentEngine.allTournamentMatchUps().matchUps[0];
  const ids = matchUp.sides.map((side) => side.participantId);
  const result: any = scaleEngine.generateDynamicRatings({ matchUpIds: [matchUp.matchUpId], ...params });
  const ratings = ids.map((id) => result.modifiedScaleValues?.[id]?.scaleValue);
  return { result, ratings, ids };
}

it.each([
  ['SET3-S:6/TB7', '6-1 6-2', [1513, 1488]], // 25 × (1 − 0.5)
  ['SET3-S:6/TB7', '6-4 4-6 6-4', [1504, 1496]], // 25 × (2/3 − 0.5)
  ['SET5-S:6/TB7', '6-4 6-4 6-4', [1513, 1488]], // 25 × (1 − 0.5)
  ['SET5-S:6/TB7', '6-4 4-6 6-4 6-4', [1508, 1493]], // 25 × (0.8 − 0.5)
  ['SET5-S:6/TB7', '6-4 4-6 6-4 4-6 6-4', [1503, 1498]], // 25 × (0.6 − 0.5)
])('rates %s %s by sets played under the default', (matchUpFormat, scoreString, expected) => {
  const { ratings } = rate({ matchUpFormat, scoreString });
  expect(ratings).toEqual(expected);
});

it('rates a format Huang does not grade as a plain win', () => {
  const { ratings } = rate({ matchUpFormat: 'SET1-S:6/TB7', scoreString: '6-4' });
  expect(ratings).toEqual([1513, 1488]);
});

it('rates a walkover as a win under the default, and not at all where the policy excludes walkovers', () => {
  expect(rate({ matchUpStatus: 'WALKOVER' }).ratings).toEqual([1513, 1488]);

  const ratingsPolicy = { ...POLICY_RATINGS_DEFAULT[POLICY_TYPE_RATINGS], walkovers: 'EXCLUDE' };
  const { result, ratings } = rate({ matchUpStatus: 'WALKOVER', params: { ratingsPolicy } });
  expect(result.processedMatchUpIds).toEqual([]);
  expect(ratings).toEqual([undefined, undefined]);
});

it("reads a ratings policy attached to the tournament, and refuses FiveThirtyEight's K without career counts", () => {
  const { result } = rate({ scoreString: '6-1 6-2', policyDefinitions: POLICY_RATINGS_ELO_538_TENNIS });
  expect(result.error).toEqual(MISSING_VALUE);
  expect(result.info).toMatch(/matchesPlayed/);
});

it("gives each player FiveThirtyEight's K from the career count the caller passes", () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawSize: 2, outcomes: [{ roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-2', winningSide: 1 }] },
    ],
  });
  tournamentEngine.setState(tournamentRecord);
  const matchUp = tournamentEngine.allTournamentMatchUps().matchUps[0];
  const [winnerId, loserId] = matchUp.sides.map((side) => side.participantId);

  const result: any = scaleEngine.generateDynamicRatings({
    ratingsPolicy: POLICY_RATINGS_ELO_538_TENNIS[POLICY_TYPE_RATINGS],
    matchesPlayed: { [winnerId]: 0, [loserId]: 95 },
    matchUpIds: [matchUp.matchUpId],
  });

  // K = 250 / 5^0.4 ≈ 131.3 for the newcomer and 250 / 100^0.4 ≈ 39.6 for the veteran: not zero-sum
  expect(result.modifiedScaleValues[winnerId].scaleValue).toEqual(Math.round(1500 + 0.5 * (250 / Math.pow(5, 0.4))));
  expect(result.modifiedScaleValues[loserId].scaleValue).toEqual(Math.round(1500 - 0.5 * (250 / Math.pow(100, 0.4))));
});

it('takes a policy passed by the caller ahead of one attached to the tournament', () => {
  const { ratings } = rate({
    params: { ratingsPolicy: POLICY_RATINGS_DEFAULT[POLICY_TYPE_RATINGS] },
    policyDefinitions: POLICY_RATINGS_ELO_538_TENNIS,
    scoreString: '6-1 6-2',
  });
  expect(ratings).toEqual([1513, 1488]);
});
