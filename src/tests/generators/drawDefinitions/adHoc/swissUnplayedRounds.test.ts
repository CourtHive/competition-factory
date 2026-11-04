import { computeTiebreakers } from '@Generators/drawDefinitions/drawTypes/adHoc/swiss/computeTiebreakers';
import { computeScoreGroups } from '@Generators/drawDefinitions/drawTypes/adHoc/swiss/computeScoreGroups';
import { generateOutcomeFromScoreString } from '@Generators/simulation/generateOutcomeFromScoreString';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, test } from 'vitest';

// constants and types
import { BUCHHOLZ, MEDIAN_BUCHHOLZ, SONNEBORN_BERGER } from '@Constants/swissConstants';
import { COMPLETED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SWISS } from '@Constants/drawDefinitionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import type { MatchUp } from '@Types/tournamentTypes';

/*
 * FIDE C.07 Art. 16 (Unplayed Rounds Management in Swiss Tournaments), as revised from 1 March 2026. Worked by hand.
 * The 2026 revision caps the dummy an unplayed round is scored against (16.4.1, 16.4.2); without the caps the values
 * below would be the 2024 edition's, which each test also names.
 */

const meeting = (roundNumber: number, a: string, b: string, winningSide?: 1 | 2, matchUpStatus = COMPLETED) =>
  ({
    matchUpId: `${roundNumber}-${a}-${b}`,
    sides: [{ participantId: a }, { participantId: b }],
    matchUpStatus,
    winningSide,
    roundNumber,
  }) as unknown as MatchUp;

const standingsOf = (matchUps: MatchUp[], participantIds: string[], totalRounds?: number, byePoints?: number) => {
  const { records } = computeScoreGroups({ participantIds, matchUps, allowDraws: true, byePoints });
  const standings = computeTiebreakers({
    tiebreakMethods: [BUCHHOLZ, SONNEBORN_BERGER, MEDIAN_BUCHHOLZ],
    totalRounds,
    records,
  });
  return { standings, byId: Object.fromEntries(standings.map((s) => [s.participantId, s])), records };
};

describe('Swiss unplayed rounds: byes and forfeits', () => {
  /*
   * Five players, three rounds, draws allowed:
   *   R1  A beat B, C beat D, E bye
   *   R2  A beat C, E beat D, B bye
   *   R3  A beat E by walkover, B drew C, D bye
   * Points: A 3, E 2, B 1.5, C 1.5, D 1. Nobody has a requested bye, so adjusted scores are the points (16.3.1).
   */
  const matchUps = [
    meeting(1, 'A', 'B', 1),
    meeting(1, 'C', 'D', 1),
    meeting(2, 'A', 'C', 1),
    meeting(2, 'E', 'D', 1),
    meeting(3, 'A', 'E', 1, WALKOVER),
    meeting(3, 'B', 'C'),
  ];
  const { standings, byId, records } = standingsOf(matchUps, ['A', 'B', 'C', 'D', 'E'], 3);

  test('a lone sit-out is the pairing bye and scores a win; a walkover scores but is not an opponent', () => {
    expect(standings.map((s) => [s.participantId, s.points])).toEqual([
      ['A', 3],
      ['E', 2],
      ['B', 1.5],
      ['C', 1.5],
      ['D', 1],
    ]);
    expect(records.get('E')?.rounds.map((r) => r.unplayed)).toEqual(['BYE', undefined, 'FORFEIT_LOSS']);
    expect(byId.A.opponentIds).toEqual(['B', 'C']);
    expect(byId.E.opponentIds).toEqual(['D']);
  });

  test('a forfeit counts against a dummy capped at the scheduled opponent (16.4.1)', () => {
    // A: B 1.5 + C 1.5 + dummy min(own 3, E 2) = 5; the 2024 dummy was A's own 3, so 6
    expect(byId.A.buchholz).toEqual(5);
    expect(byId.A.sonnebornBerger).toEqual(5);
  });

  test('a bye counts against a dummy capped at a draw per round (16.4.2)', () => {
    // E: bye dummy min(own 2, 0.5 x 3) = 1.5 + D 1 + forfeit loss dummy min(2, A 3) = 2; uncapped, 5.5
    expect(byId.E.buchholz).toEqual(4.5);
    // SB scores each by the result: bye a win, D a win, the forfeit a loss
    expect(byId.E.sonnebornBerger).toEqual(2.5);
    // B: A 3 + bye dummy min(1.5, 1.5) + C 1.5, a draw
    expect(byId.B.buchholz).toEqual(6);
    expect(byId.B.sonnebornBerger).toEqual(2.25);
    // D: C 1.5 + E 2 + bye dummy min(1, 1.5)
    expect(byId.D.buchholz).toEqual(4.5);
    expect(byId.D.sonnebornBerger).toEqual(1);
  });

  test('Median-1 cuts a voluntary unplayed round first (16.5.1)', () => {
    // E's contributions are 1.5 (bye), 1 (D) and 2 (forfeit loss, voluntary). The low cut takes the forfeit's 2, not D's
    // 1, then the high cut takes 1.5: 1 remains. Cutting the plain least and most would leave 1.5.
    expect(byId.E.medianBuchholz).toEqual(1);
    // A has no voluntary round: cut 1.5 and 2
    expect(byId.A.medianBuchholz).toEqual(1.5);
  });

  test('the bye scores what the policy says', () => {
    const { byId: half } = standingsOf(matchUps, ['A', 'B', 'C', 'D', 'E'], 3, 0.5);
    expect([half.E.points, half.E.draws, half.D.points]).toEqual([1.5, 1, 0.5]);
    const { byId: none } = standingsOf(matchUps, ['A', 'B', 'C', 'D', 'E'], 3, 0);
    expect([none.E.points, none.E.losses, none.D.points]).toEqual([1, 2, 0]);
  });

  test('a pending matchUp pairs its sides: they have no bye', () => {
    const pending = [meeting(1, 'A', 'B', undefined, TO_BE_PLAYED), meeting(1, 'C', 'D', 1)];
    const { records } = computeScoreGroups({ participantIds: ['A', 'B', 'C', 'D', 'E'], matchUps: pending });
    expect(records.get('A')?.rounds).toEqual([]);
    expect(records.get('E')?.rounds).toEqual([{ roundNumber: 1, points: 1, unplayed: 'BYE' }]);
  });
});

describe('Swiss unplayed rounds: requested byes', () => {
  /*
   * Six players. R1: W beat X, Y beat Z, U beat V. R2: W beat Y, X beat Z; U and V both sit out, so neither can be told
   * to have had the pairing bye: each round is unplayed for 0 points, the factory's nearest record of a requested bye.
   */
  const ids = ['W', 'X', 'Y', 'Z', 'U', 'V'];
  const twoRounds = [
    meeting(1, 'W', 'X', 1),
    meeting(1, 'Y', 'Z', 1),
    meeting(1, 'U', 'V', 1),
    meeting(2, 'W', 'Y', 1),
    meeting(2, 'X', 'Z', 1),
  ];

  test('a requested bye in the last round is a draw for the opponents (16.2.5, 16.3.2)', () => {
    const { byId, records } = standingsOf(twoRounds, ids, 2);
    expect(records.get('U')?.rounds.map((r) => r.unplayed)).toEqual([undefined, 'ABSENT']);
    expect([byId.U.points, byId.V.points]).toEqual([1, 0]);
    // U: V counts at 0 + 0.5 = 0.5; U's own dummy min(1, 0.5 x 2) = 1. Unadjusted, V would count 0.
    expect(byId.U.buchholz).toEqual(1.5);
    // V: U counts at 1 + 0.5 = 1.5; V's dummy min(0, 1) = 0
    expect(byId.V.buchholz).toEqual(1.5);
  });

  test('a requested bye followed by a round played counts as awarded (16.2.3, 16.3.1)', () => {
    const threeRounds = [...twoRounds, meeting(3, 'U', 'V', 1), meeting(3, 'W', 'Z', 1), meeting(3, 'X', 'Y', 1)];
    const { byId } = standingsOf(threeRounds, ids, 3);
    // U: V 0 (R1), dummy min(2, 1.5) = 1.5 (R2), V 0 (R3); V's R2 is followed by R3, so V stays at 0
    expect(byId.U.buchholz).toEqual(1.5);
    // V: U 2 + dummy 0 + U 2
    expect(byId.V.buchholz).toEqual(4);
  });
});

describe('Swiss unplayed rounds through the engine', () => {
  const MATCH_UP_FORMAT = 'SET1-S:6/TB7';

  const setup = (byePoints?: number) => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { idPrefix: 'P' },
      drawProfiles: [
        { matchUpFormat: MATCH_UP_FORMAT, drawType: SWISS, automated: false, eventType: SINGLES_EVENT, drawSize: 5 },
      ],
      setState: true,
    });
    if (byePoints !== undefined) {
      const result = tournamentEngine.addDrawDefinitionExtension({
        extension: { name: 'swissPolicy', value: { totalRounds: 3, byePoints } },
        drawId,
      });
      expect(result.success).toEqual(true);
    }
    return drawId;
  };

  const playRound = (drawId: string) => {
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;
    const round = tournamentEngine.generateSwissRound({ drawId });
    expect(round.success).toEqual(true);
    expect(tournamentEngine.addAdHocMatchUps({ matchUps: round.matchUps, structureId, drawId }).success).toEqual(true);
    const { outcome } = generateOutcomeFromScoreString({
      matchUpFormat: MATCH_UP_FORMAT,
      winningSide: 1,
      scoreString: '6-3',
    });
    for (const { matchUpId } of round.matchUps) {
      expect(tournamentEngine.setMatchUpStatus({ matchUpId, outcome, drawId }).success).toEqual(true);
    }
    return round.byeParticipantId;
  };

  test('the bye the pairing gives scores a point by default', () => {
    const drawId = setup();
    const byeParticipantId = playRound(drawId);
    const { standings } = tournamentEngine.getSwissStandings({ drawId });
    expect(standings.find((s) => s.participantId === byeParticipantId).points).toEqual(1);
    expect(standings.map((s) => s.points).sort()).toEqual([0, 0, 1, 1, 1]);
  });

  test('swissPolicy.byePoints sets it', () => {
    const drawId = setup(0);
    const byeParticipantId = playRound(drawId);
    const { standings } = tournamentEngine.getSwissStandings({ drawId });
    expect(standings.find((s) => s.participantId === byeParticipantId).points).toEqual(0);
  });

  test('a byePoints that is not a win, a draw or a loss is refused before a round is paired', () => {
    const drawId = setup(2);
    expect(tournamentEngine.generateSwissRound({ drawId }).error).toEqual(INVALID_VALUES);
    expect(tournamentEngine.getSwissStandings({ drawId }).error).toEqual(INVALID_VALUES);
    expect(tournamentEngine.getSwissChart({ drawId }).error).toEqual(INVALID_VALUES);
  });

  test('a walkover in a Swiss round scores for its winner', () => {
    const drawId = setup();
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;
    const round = tournamentEngine.generateSwissRound({ drawId });
    tournamentEngine.addAdHocMatchUps({ matchUps: round.matchUps, structureId, drawId });
    const [{ matchUpId }] = round.matchUps;
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    const { matchUp } = tournamentEngine.findMatchUp({ matchUpId, drawId });
    const winnerId = matchUp.sides.find((side) => side.sideNumber === 1).participantId;
    const { standings } = tournamentEngine.getSwissStandings({ drawId });
    const winner = standings.find((s) => s.participantId === winnerId);
    expect([winner.points, winner.opponentIds]).toEqual([1, []]);
  });
});
