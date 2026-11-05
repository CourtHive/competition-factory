import { initializeCompetitionState } from '@Mutate/drawDefinitions/competition/initializeCompetitionState';
import { formRatingsPolicy } from '@Generators/scales/competition/formRatingsPolicy';
import { deriveCompetitionState } from '@Query/drawDefinition/competition/deriveCompetitionState';
import { POLICY_RATINGS_COMPETITION_FORM } from '@Fixtures/policies/POLICY_RATINGS_COMPETITION_FORM';
import { POLICY_COMPETITION_STANDARD } from '@Fixtures/policies/POLICY_COMPETITION_STANDARD';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_COMPETITION, POLICY_TYPE_RATINGS } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * A competition's dynamic form rating may name a ratings policy (CA 2026-11-05); without one it is rated as today, from
 * the policy's own kFactor and logisticScale, else POLICY_RATINGS_COMPETITION_FORM's 24 and 400, with the share of the
 * points (else games) won as the actual result.
 */

const STANDARD = POLICY_COMPETITION_STANDARD[POLICY_TYPE_COMPETITION];
const withForm = (dynamicFormRating: Record<string, unknown>) => ({
  ...STANDARD,
  processingGranularity: 'PER_MATCHUP',
  ratingPolicy: { ...STANDARD.ratingPolicy, dynamicFormRating: { enabled: true, ...dynamicFormRating } },
});

const baseline = (participantId: string) => ({
  participantId,
  baselineRating: 1500,
  dynamicFormRating: 1500,
  pressureRating: 0,
  roundsPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  totalPointsWon: 0,
  totalPointsLost: 0,
  ratingHistory: [],
});

function formOfA(competitionPolicy: any, games: [number, number][]) {
  const matchUp = {
    sides: [
      { sideNumber: 1, participantId: 'A' },
      { sideNumber: 2, participantId: 'B' },
    ],
    score: { sets: games.map(([side1Score, side2Score], i) => ({ setNumber: i + 1, side1Score, side2Score })) },
    matchUpFormat: 'SET3-S:6/TB7',
    matchUpId: 'ab',
    roundNumber: 1,
    winningSide: 1,
  };
  const competitionState = deriveCompetitionState({
    competitionState: {
      participantStates: { A: baseline('A'), B: baseline('B') },
      roundStates: { 1: { roundNumber: 1, processed: true } },
    },
    drawDefinition: { drawId: 'd', structures: [{ structureId: 's', matchUps: [matchUp] }] } as any,
    competitionPolicy,
  });
  return competitionState.participantStates.A.dynamicFormRating;
}

const SHUTOUT: [number, number][] = [
  [6, 0],
  [6, 0],
];
const CLOSE: [number, number][] = [
  [6, 4],
  [6, 4],
];

describe('the competition form rating and its ratings policy', () => {
  it('rates as today with nothing set: K 24, spread 400, the share of games won', () => {
    expect(formOfA(withForm({}), SHUTOUT)).toBeCloseTo(1512, 10); // 24 × (1 − 0.5)
    expect(formOfA(withForm({}), CLOSE)).toBeCloseTo(1502.4, 10); // 24 × (0.6 − 0.5)
    expect(formOfA(withForm({ kFactor: 24, logisticScale: 400 }), CLOSE)).toBeCloseTo(1502.4, 10);
  });

  it("keeps a policy's own kFactor", () => {
    expect(formOfA(withForm({ kFactor: 32, logisticScale: 400 }), SHUTOUT)).toBeCloseTo(1516, 10);
  });

  it('rates by the same numbers when the policy names POLICY_RATINGS_COMPETITION_FORM', () => {
    expect(formOfA(withForm({ ratingsPolicy: 'POLICY_RATINGS_COMPETITION_FORM' }), CLOSE)).toBeCloseTo(1502.4, 10);
  });

  it("rates by a named policy's K and actual rule: World Football Elo's K 30 and a plain win", () => {
    const policy = withForm({ ratingsPolicy: 'POLICY_RATINGS_ELO_WORLD_FOOTBALL' });
    expect(formOfA(policy, CLOSE)).toBeCloseTo(1515, 10); // 30 × (1 − 0.5)
  });

  it('refuses an unknown name and a K by career matches, which a competition cannot count', () => {
    expect(formRatingsPolicy(withForm({ ratingsPolicy: 'POLICY_RATINGS_NONE' }) as any).error).toEqual(INVALID_VALUES);
    const careerK = formRatingsPolicy(withForm({ ratingsPolicy: 'POLICY_RATINGS_ELO_538_TENNIS' }) as any);
    expect(careerK.error).toEqual(INVALID_VALUES);
    expect(careerK.info).toMatch(/CONSTANT K/);
  });

  it('refuses to start competition state under an invalid reference', () => {
    const competition = withForm({ ratingsPolicy: 'POLICY_RATINGS_ELO_538_TENNIS' });
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      policyDefinitions: { [POLICY_TYPE_COMPETITION]: competition },
      drawProfiles: [{ drawSize: 4 }],
    });
    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions.find((draw) => draw.drawId === drawId);
    const participantIds = tournamentRecord.participants.map(({ participantId }) => participantId);
    const result: any = initializeCompetitionState({ tournamentRecord, drawDefinition, participantIds, event });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

describe('generateDynamicRatings and the score share', () => {
  function rate(params: any) {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawSize: 2, outcomes: [{ roundNumber: 1, roundPosition: 1, scoreString: '6-4 6-4', winningSide: 1 }] },
      ],
    });
    tournamentEngine.setState(tournamentRecord);
    const matchUp = tournamentEngine.allTournamentMatchUps().matchUps[0];
    const ids = matchUp.sides.map((side) => side.participantId);
    const result: any = scaleEngine.generateDynamicRatings({ matchUpIds: [matchUp.matchUpId], ...params });
    return { result, values: ids.map((id) => result.modifiedScaleValues[id].scaleValue) };
  }

  it('rates a win by the share of the games won under the competition form preset', () => {
    const { values, result } = rate({ ratingsPolicy: POLICY_RATINGS_COMPETITION_FORM[POLICY_TYPE_RATINGS] });
    expect(values).toEqual([1502, 1498]); // 24 × (0.6 − 0.5) = 2.4
    expect(result.ratingsPolicyNames).toEqual(['Competition form rating']);
  });

  it('names the policies a run rated by', () => {
    expect(rate({}).result.ratingsPolicyNames).toEqual(['Elo, Huang 2014 (flat K)']);
  });
});
