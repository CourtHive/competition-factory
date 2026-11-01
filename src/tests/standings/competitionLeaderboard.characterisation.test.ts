import { getCompetitionLeaderboard } from '@Query/drawDefinition/competition/getCompetitionLeaderboard';
import { POLICY_COMPETITION_PRESSURE } from '@Fixtures/policies/POLICY_COMPETITION_PRESSURE';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_COMPETITION } from '@Constants/policyConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

/**
 * The competition leaderboard's defects (Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 2), each pinned before the
 * leaderboard moved onto the derived standings core (S5) and flipped deliberately as it did: C1 and C2 by S5a (the state
 * derived from the results); C4 and C5 by S5b (the ordering through the standings core).
 */

const MATCH_UP_FORMAT = 'SET1-S:6/TB7';

function setup(policyDefinitions: any = POLICY_COMPETITION_PRESSURE) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P', participantsCount: 8 },
    drawProfiles: [
      { matchUpFormat: MATCH_UP_FORMAT, eventType: SINGLES_EVENT, automated: false, drawType: AD_HOC, drawSize: 8 },
    ],
    setState: true,
  });
  tournamentEngine.attachPolicies({ drawId, policyDefinitions });
  const participantIds = tournamentEngine.getParticipants().participants.map((p: any) => p.participantId);
  tournamentEngine.initializeCompetitionState({ drawId, participantIds });
  return { drawId, participantIds };
}

function firstRoundMatchUp(drawId: string) {
  let result: any = tournamentEngine.drawMatic({ drawId });
  const { structureId } = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0];
  tournamentEngine.addAdHocMatchUps({ matchUps: result.matchUps, structureId, drawId });
  return tournamentEngine.allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId] } }).matchUps[0];
}

function record(drawId: string, matchUp: any) {
  const states = tournamentEngine.getCompetitionState({ drawId }).competitionState.participantStates;
  return matchUp.sides.map(({ participantId }) => {
    const { wins, losses, roundsPlayed, ratingHistory } = states[participantId];
    return { wins, losses, roundsPlayed, history: ratingHistory.length };
  });
}

function score(drawId: string, matchUpId: string, winningSide: 1 | 2) {
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpFormat: MATCH_UP_FORMAT,
    scoreString: '6-1',
    winningSide,
  });
  return tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
}

describe('competition leaderboard characterisation (PER_MATCHUP)', () => {
  // C1 FIXED (S5, D6 option C): the state is derived from the results, so re-entering a result counts it once and a
  // correction replaces it. v1 folded every result it was given: 1-0, then 2-0, then 2-1.
  it('C1: re-entering a result counts it once, and a correction replaces it', () => {
    const { drawId } = setup();
    const matchUp = firstRoundMatchUp(drawId);

    expect(score(drawId, matchUp.matchUpId, 1).success).toBe(true);
    expect(record(drawId, matchUp)).toEqual([
      { wins: 1, losses: 0, roundsPlayed: 1, history: 1 },
      { wins: 0, losses: 1, roundsPlayed: 1, history: 1 },
    ]);

    expect(score(drawId, matchUp.matchUpId, 1).success).toBe(true);
    expect(record(drawId, matchUp)).toEqual([
      { wins: 1, losses: 0, roundsPlayed: 1, history: 1 },
      { wins: 0, losses: 1, roundsPlayed: 1, history: 1 },
    ]);

    expect(score(drawId, matchUp.matchUpId, 2).success).toBe(true);
    expect(record(drawId, matchUp)).toEqual([
      { wins: 0, losses: 1, roundsPlayed: 1, history: 1 },
      { wins: 1, losses: 0, roundsPlayed: 1, history: 1 },
    ]);
  });

  // C2 FIXED (S5): a removed result does not count; v1 left it in (1-0)
  it('C2: removing a result removes it from the state', () => {
    const { drawId } = setup();
    const matchUp = firstRoundMatchUp(drawId);
    score(drawId, matchUp.matchUpId, 1);
    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: TO_BE_PLAYED, score: undefined, winningSide: undefined },
      matchUpId: matchUp.matchUpId,
      drawId,
    });
    expect(result.success).toBe(true);
    expect(record(drawId, matchUp)).toEqual([
      { wins: 0, losses: 0, roundsPlayed: 0, history: 0 },
      { wins: 0, losses: 0, roundsPlayed: 0, history: 0 },
    ]);
  });

  it('C5 DEFECT: ranks are always index + 1, so identical participants never share a place', () => {
    const { drawId } = setup();
    const { leaderboard } = tournamentEngine.getCompetitionLeaderboard({ drawId });
    expect(leaderboard).toHaveLength(8);
    expect(new Set(leaderboard.map(({ wins, pressureRating }) => `${wins}:${pressureRating}`)).size).toBe(1);
    expect(leaderboard.map(({ rank }) => rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('competition leaderboard characterisation (tiebreaks)', () => {
  it('C4 DEFECT: BUCHHOLZ is accepted but has no effect on the order', () => {
    const competitionPolicy = POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION];
    const { drawId } = setup({
      [POLICY_TYPE_COMPETITION]: {
        ...competitionPolicy,
        victoryPolicy: { ...competitionPolicy.victoryPolicy, primaryRanking: 'WINS', tiebreakOrder: ['BUCHHOLZ'] },
      },
    });
    const drawDefinition = structuredClone(tournamentEngine.getEvent({ drawId }).drawDefinition);

    // P2 and P1 each have one win; P1 beat P3 (1 win), P2 beat P4 (0 wins): Buchholz P1 1, P2 0, so a working
    // BUCHHOLZ puts P1 first. P2 is inserted first; the leaderboard keeps insertion order.
    const state = (participantId: string, wins: number, opponents: string[]) => ({
      participantId,
      baselineRating: 1500,
      dynamicFormRating: 1500,
      pressureRating: 0,
      roundsPlayed: opponents.length,
      wins,
      losses: opponents.length - wins,
      draws: 0,
      totalPointsWon: 0,
      totalPointsLost: 0,
      ratingHistory: opponents.map((opponentParticipantId) => ({ opponentParticipantId, actualOutput: 0.5 })),
    });
    drawDefinition.competitionState = {
      ...drawDefinition.competitionState,
      participantStates: {
        P2: state('P2', 1, ['P4']),
        P1: state('P1', 1, ['P3']),
        P3: state('P3', 1, ['P1', 'P5']),
        P4: state('P4', 0, ['P2']),
      },
    };
    drawDefinition.extensions = drawDefinition.extensions?.filter(({ name }) => name !== 'competitionState');

    let result: any = getCompetitionLeaderboard({ drawDefinition });
    expect(result.leaderboard.slice(0, 3).map(({ participantId }) => participantId)).toEqual(['P2', 'P1', 'P3']);
  });
});
