import { rankCompetitionStates } from '@Query/drawDefinition/competition/getCompetitionLeaderboard';
import { POLICY_COMPETITION_PRESSURE } from '@Fixtures/policies/POLICY_COMPETITION_PRESSURE';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
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

  // C5 FIXED (S5b): v1 numbered the rows 1 to 8 whatever the ties
  it('C5: identical participants share a place', () => {
    const { drawId } = setup();
    const { leaderboard } = tournamentEngine.getCompetitionLeaderboard({ drawId });
    expect(leaderboard).toHaveLength(8);
    expect(new Set(leaderboard.map(({ wins, pressureRating }) => `${wins}:${pressureRating}`)).size).toBe(1);
    expect(leaderboard.map(({ rank }) => rank)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(leaderboard[0].ties).toEqual(8);
  });
});

describe('competition leaderboard characterisation (tiebreaks)', () => {
  // C3 FIXED (S5b): v1 ran HEAD_TO_HEAD as a pairwise comparator inside Array.sort, which a circle (A beat B, B beat
  // C, C beat A) makes intransitive: the order depended on the sort's visiting order. The mini-league among the three
  // is 1-1 each, so they share a place, however they are listed.
  it('C3: a head-to-head circle shares a place whatever order the participants are listed in', () => {
    const state = (participantId: string, beat: string, lostTo: string) => ({
      participantId,
      baselineRating: 1500,
      dynamicFormRating: 1500,
      pressureRating: 0,
      roundsPlayed: 2,
      wins: 1,
      losses: 1,
      draws: 0,
      totalPointsWon: 0,
      totalPointsLost: 0,
      ratingHistory: [
        { opponentParticipantId: beat, actualOutput: 1 },
        { opponentParticipantId: lostTo, actualOutput: 0 },
      ] as any,
    });
    const states: Record<string, any> = { A: state('A', 'B', 'C'), B: state('B', 'C', 'A'), C: state('C', 'A', 'B') };
    const competitionPolicy = { victoryPolicy: { primaryRanking: 'WINS', tiebreakOrder: ['HEAD_TO_HEAD'] } } as any;
    for (const listed of [
      ['A', 'B', 'C'],
      ['C', 'B', 'A'],
      ['B', 'A', 'C'],
    ]) {
      const participantStates = Object.fromEntries(listed.map((id) => [id, states[id]]));
      let result: any = rankCompetitionStates({ competitionPolicy, participantStates });
      expect(result.leaderboard.map(({ rank }) => rank)).toEqual([1, 1, 1]);
    }
  });

  // C4 FIXED (S5b): v1 accepted BUCHHOLZ and returned 0 for it, keeping insertion order (P2, P1, P3)
  it('C4: BUCHHOLZ orders participants level on wins by the scores of their opponents', () => {
    // P2, P1, P3 one win each. Opponents: P1 met P3 (1 win); P3 met P1 (1) and P5 (none); P2 met P4 (0 wins).
    // Buchholz P1 1, P3 1, P2 0: P1 and P3 share first, P2 third. P2 is listed first and does not stay there.
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
      ratingHistory: opponents.map((opponentParticipantId) => ({ opponentParticipantId, actualOutput: 0.5 })) as any,
    });
    let result: any = rankCompetitionStates({
      competitionPolicy: { victoryPolicy: { primaryRanking: 'WINS', tiebreakOrder: ['BUCHHOLZ'] } } as any,
      participantStates: {
        P2: state('P2', 1, ['P4']),
        P1: state('P1', 1, ['P3']),
        P3: state('P3', 1, ['P1', 'P5']),
        P4: state('P4', 0, ['P2']),
      },
    });
    expect(result.leaderboard.map(({ participantId, rank }) => [participantId, rank])).toEqual([
      ['P1', 1],
      ['P3', 1],
      ['P2', 3],
      ['P4', 4],
    ]);
  });
});
