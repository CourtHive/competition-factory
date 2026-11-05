import { POLICY_RATINGS_ELO_WORLD_FOOTBALL } from '@Fixtures/policies/POLICY_RATINGS_ELO_WORLD_FOOTBALL';
import { POLICY_RATINGS_ELO_WELO_TENNIS } from '@Fixtures/policies/POLICY_RATINGS_ELO_WELO_TENNIS';
import { POLICY_RATINGS_ELO_538_NHL } from '@Fixtures/policies/POLICY_RATINGS_ELO_538_NHL';
import { POLICY_RATINGS_FIFA_SUM } from '@Fixtures/policies/POLICY_RATINGS_FIFA_SUM';
import { ratedResultOf } from '@Generators/scales/ratedResult';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { expect, it } from 'vitest';

// constants
import { ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { RATING } from '@Constants/scaleConstants';
import { ELO } from '@Constants/ratingConstants';

// ratings policy S2 (Mentat planning/RATINGS_POLICY_PLAN.md): margin, overtime and shootout, draws, knock-out loss
// protection and K by tier, each from a published method; every expected value is worked from the source's formula

const HOCKEY = 'PER3XA-S:T20P-O:1SD/T5P-F:SO5';
const SOCCER = 'HAL2A-S:T45';
const periods = (...goals: [number, number][]) =>
  goals.map(([side1Score, side2Score], index) => ({ setNumber: index + 1, side1Score, side2Score }));

const WORLD_FOOTBALL = POLICY_RATINGS_ELO_WORLD_FOOTBALL[POLICY_TYPE_RATINGS];
const NHL = POLICY_RATINGS_ELO_538_NHL[POLICY_TYPE_RATINGS];
const FIFA = POLICY_RATINGS_FIFA_SUM[POLICY_TYPE_RATINGS];

function rated({
  drawType = ROUND_ROBIN,
  matchUpFormat,
  ratingsPolicy,
  winningSide,
  ratings,
  outcome,
  tier,
}: {
  ratings?: [number, number];
  ratingsPolicy: any;
  matchUpFormat: string;
  winningSide?: number;
  drawType?: string;
  outcome: any;
  tier?: any;
}) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: drawType === ROUND_ROBIN ? 3 : 2, drawType, matchUpFormat }],
  });
  if (tier) tournamentRecord.tournamentTier = tier;
  tournamentEngine.setState(tournamentRecord);
  const { matchUpId, drawId } = tournamentEngine.allTournamentMatchUps().matchUps[0];
  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: COMPLETED, score: { sets: outcome }, winningSide },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId, inContext: true });
  const ids = matchUp.sides.map((side) => side.participantId);
  ratings?.forEach((scaleValue, index) =>
    tournamentEngine.setParticipantScaleItem({
      scaleItem: { scaleType: RATING, eventType: SINGLES_EVENT, scaleName: ELO, scaleValue },
      participantId: ids[index],
    }),
  );
  const generated: any = scaleEngine.generateDynamicRatings({ matchUpIds: [matchUpId], ratingsPolicy });
  expect(generated.success).toEqual(true);
  return { values: ids.map((id) => generated.modifiedScaleValues[id]?.scaleValue), matchUp };
}

it('World Football Elo raises K with the goal difference: a 3-0 win is × 1.75', () => {
  const { values } = rated({
    outcome: periods([2, 0], [1, 0]),
    ratingsPolicy: WORLD_FOOTBALL,
    matchUpFormat: SOCCER,
    winningSide: 1,
  });
  expect(values).toEqual([1526, 1474]); // 30 × 1.75 × 0.5 = 26.25
});

it('rates a draw 0.5 each: the stronger side loses what it was expected to win', () => {
  const { values } = rated({
    outcome: periods([1, 0], [0, 1]),
    ratingsPolicy: WORLD_FOOTBALL,
    matchUpFormat: SOCCER,
    ratings: [1600, 1400],
  });
  expect(values).toEqual([1592, 1408]); // 30 × (0.5 − 0.7597) = −7.79
});

it('FiveThirtyEight NHL: a regulation 4-1 win scales K by the log margin', () => {
  const { values, matchUp } = rated({
    outcome: periods([2, 0], [1, 1], [1, 0]),
    matchUpFormat: HOCKEY,
    ratingsPolicy: NHL,
    winningSide: 1,
  });
  expect(matchUp.score.overtime.decidedIn).toEqual('REGULATION');
  expect(values).toEqual([1505, 1495]); // 6 × (0.6686 ln 3 + 0.8048) × 0.5 = 4.62
});

it.each([
  ['overtime', periods([1, 0], [0, 1], [0, 0], [1, 0]), 'OVERTIME'],
  ['a shootout', periods([1, 0], [0, 1], [0, 0], [0, 0], [3, 2]), 'DECIDER'],
])('FiveThirtyEight NHL rates a win in %s as a full win by one goal', (_, outcome, decidedIn) => {
  const { values, matchUp } = rated({ ratingsPolicy: NHL, matchUpFormat: HOCKEY, winningSide: 1, outcome });
  expect(matchUp.score.overtime.decidedIn).toEqual(decidedIn);
  expect(values).toEqual([1502, 1498]); // 6 × 0.8048 × 0.5 = 2.41
});

it('FIFA SUM scores a shootout 0.75 and 0.5: the loser keeps its rating at equal strength', () => {
  const { values } = rated({
    outcome: periods([1, 0], [0, 1], [0, 0], [0, 0], [3, 2]),
    matchUpFormat: HOCKEY,
    ratingsPolicy: FIFA,
    winningSide: 1,
  });
  expect(values).toEqual([1503, 1500]); // 10 × (0.75 − 0.5) = 2.5; 10 × (0.5 − 0.5) = 0
});

it('FIFA SUM protects a knock-out loser, and not a group-stage one', () => {
  const outcome = periods([1, 0], [0, 0]);
  const knockout = rated({
    drawType: SINGLE_ELIMINATION,
    matchUpFormat: SOCCER,
    ratingsPolicy: FIFA,
    winningSide: 1,
    outcome,
  });
  expect(knockout.values).toEqual([1505, 1500]);
  const group = rated({ matchUpFormat: SOCCER, ratingsPolicy: FIFA, winningSide: 1, outcome });
  expect(group.values).toEqual([1505, 1495]);
});

it("takes K from the tournament's tier when the policy keys one", () => {
  const { values } = rated({
    ratingsPolicy: { ...FIFA, kByTier: { 'FIFA:WORLD_CUP': 60 } },
    tier: { system: 'FIFA', value: 'WORLD_CUP' },
    outcome: periods([1, 0], [0, 0]),
    matchUpFormat: SOCCER,
    winningSide: 1,
  });
  expect(values).toEqual([1530, 1470]); // I = 60
});

it("WElo scales both updates by the winner's share of the games", () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawSize: 2, outcomes: [{ roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-2', winningSide: 1 }] },
    ],
  });
  tournamentEngine.setState(tournamentRecord);
  const matchUp = tournamentEngine.allTournamentMatchUps().matchUps[0];
  const ids = matchUp.sides.map((side) => side.participantId);
  const result: any = scaleEngine.generateDynamicRatings({
    ratingsPolicy: POLICY_RATINGS_ELO_WELO_TENNIS[POLICY_TYPE_RATINGS],
    matchesPlayed: { [ids[0]]: 95, [ids[1]]: 95 },
    matchUpIds: [matchUp.matchUpId],
  });
  // K = 250 / 100^0.4 ≈ 39.62; 12 of 15 games: × 0.8; 39.62 × 0.5 × 0.8 ≈ 15.85
  expect(ids.map((id) => result.modifiedScaleValues[id].scaleValue)).toEqual([1516, 1484]);
});

it('counts a match tiebreak as one game to its winner in the game share', () => {
  const matchUp: any = {
    matchUpFormat: 'SET3-S:6/TB7-F:TB10',
    matchUpStatus: COMPLETED,
    winningSide: 1,
    score: {
      sets: [
        { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
        { setNumber: 2, side1Score: 4, side2Score: 6, winningSide: 2 },
        { setNumber: 3, side1Score: 0, side2Score: 0, side1TiebreakScore: 10, side2TiebreakScore: 7, winningSide: 1 },
      ],
    },
  };
  const result = ratedResultOf(matchUp, POLICY_RATINGS_ELO_WELO_TENNIS[POLICY_TYPE_RATINGS]);
  expect(result?.margin.winnerGameShare).toEqual(11 / 21);
});
