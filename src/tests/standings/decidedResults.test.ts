import { getParticipantResults } from '@Query/matchUps/roundRobinTally/getParticipantResults';
import { validateTallyPolicy } from '@Validators/validateTallyPolicy';
import { validateScore } from '@Validators/validateScore';
import { setOutcomePipeline } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants and types
import { OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';
import { INVALID_SCORE, UNDECIDED_LEVEL_RESULT } from '@Constants/errorConditionConstants';
import { ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { INTENNSE_2026 } from '@Constants/tieFormatConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

/*
 * Standings phase 2 § 1.1, slice 2 (CA 2026-11-04). A level result where a winner must advance is decided outside the
 * score: the level sporting score is kept, the winner is named, and `score.overtime` records how it was decided
 * (`decidedIn: 'EXTERNAL'`, `decidedBy`, the overtime workstream's record). Without that record it is refused with a
 * specific error, and no status is added for a result awaiting a decision. Elimination accepts a format that can end
 * level ("allow, decider required"), and a standings rule may condition on how a result was decided.
 */

afterEach(() => setOutcomePipeline());

const SOCCER = 'HAL2A-S:T45';
const halves = (...goals: [number, number][]) =>
  goals.map(([side1Score, side2Score], index) => ({ setNumber: index + 1, side1Score, side2Score }));
const LEVEL = halves([1, 0], [0, 1]);
const decided = (decidedBy: Record<string, unknown>, sets = LEVEL) => ({
  sets,
  overtime: { decidedIn: 'EXTERNAL', decidedBy },
});
const SHOOTOUT = { method: 'SHOOTOUT', tally: [4, 3] };

function eliminationFirstMatchUp(matchUpFormat = SOCCER) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, drawType: SINGLE_ELIMINATION, matchUpFormat }],
    setState: true,
  });
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, matchUpFilters: { roundNumbers: [1] } });
  return { drawId, matchUpId: matchUps[0].matchUpId };
}

function score(drawId: string, matchUpId: string, outcome: Record<string, unknown>) {
  const result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId, inContext: true });
  return { result, matchUp };
}

describe.each<OutcomePipelineMode>([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_DIFFERENTIAL])(
  'decided results, pipeline %s',
  (pipeline) => {
    it('elimination refuses a level result with no decision, with its own error', () => {
      setOutcomePipeline(pipeline);
      const { drawId, matchUpId } = eliminationFirstMatchUp();
      const { result, matchUp } = score(drawId, matchUpId, { matchUpStatus: COMPLETED, score: { sets: LEVEL } });
      expect(result.error).toEqual(UNDECIDED_LEVEL_RESULT);
      expect(matchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
      expect(matchUp.score?.sets ?? []).toEqual([]);
    });

    it('a shootout decides a level knockout tie: the score is kept and the winner advances', () => {
      setOutcomePipeline(pipeline);
      const { drawId, matchUpId } = eliminationFirstMatchUp();
      const { result, matchUp } = score(drawId, matchUpId, {
        matchUpStatus: COMPLETED,
        score: decided(SHOOTOUT),
        winningSide: 1,
      });
      expect(result.success).toEqual(true);
      expect(matchUp.matchUpStatus).toEqual(COMPLETED);
      expect(matchUp.winningSide).toEqual(1);
      expect(matchUp.score.sets.map((set) => [set.side1Score, set.side2Score])).toEqual([
        [1, 0],
        [0, 1],
      ]);
      expect(matchUp.score.overtime).toEqual({ decidedIn: 'EXTERNAL', decidedBy: SHOOTOUT });

      const winnerId = matchUp.sides.find((side) => side.sideNumber === 1).participantId;
      const final = tournamentEngine
        .allDrawMatchUps({ drawId, inContext: true, matchUpFilters: { roundNumbers: [2] } })
        .matchUps[0].sides.map((side) => side.participantId);
      expect(final).toContain(winnerId);
    });

    it.each([
      { method: 'COMPETITION_RULE', rule: 'higher placed advances' },
      { method: 'LOTS' },
      { method: 'OFFICIAL_DECISION', note: 'decided by the referee' },
    ])('$method decides a level result', (decidedBy) => {
      setOutcomePipeline(pipeline);
      const { drawId, matchUpId } = eliminationFirstMatchUp();
      const { result, matchUp } = score(drawId, matchUpId, {
        matchUpStatus: COMPLETED,
        score: decided(decidedBy),
        winningSide: 2,
      });
      expect(result.success).toEqual(true);
      expect(matchUp.winningSide).toEqual(2);
      expect(matchUp.score.overtime.decidedBy).toEqual(decidedBy);
    });

    it('a level count of timed sets and a level aggregate of exactly two are decided the same way', () => {
      setOutcomePipeline(pipeline);
      for (const [matchUpFormat, sets] of [
        ['SET3-S:T10', [...halves([2, 1], [1, 2], [1, 1])]],
        ['SET2XA-S:T10', halves([3, 1], [0, 2])],
      ] as const) {
        const { drawId, matchUpId } = eliminationFirstMatchUp(matchUpFormat);
        const level = score(drawId, matchUpId, { matchUpStatus: COMPLETED, score: { sets } });
        expect(level.result.error).toEqual(UNDECIDED_LEVEL_RESULT);
        const { result } = score(drawId, matchUpId, {
          matchUpStatus: COMPLETED,
          score: decided({ method: 'LOTS' }, [...sets]),
          winningSide: 1,
        });
        expect(result.success).toEqual(true);
      }
    });

    it('a format that cannot end level keeps its own refusal', () => {
      setOutcomePipeline(pipeline);
      const { drawId, matchUpId } = eliminationFirstMatchUp('SET3-S:6/TB7');
      const sets = [
        { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
        { setNumber: 2, side1Score: 3, side2Score: 6, winningSide: 2 },
      ];
      const { result } = score(drawId, matchUpId, { matchUpStatus: COMPLETED, score: { sets } });
      expect(result.error).toEqual(INVALID_SCORE);
      expect(result.info).toEqual('completed elimination results require a winningSide');
    });

    it('a round robin counts a decided result as the winner’s win, not a draw', () => {
      setOutcomePipeline(pipeline);
      const {
        drawIds: [drawId],
      } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN, matchUpFormat: SOCCER }],
        setState: true,
      });
      const [{ matchUpId }] = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
      const { result, matchUp } = score(drawId, matchUpId, {
        matchUpStatus: COMPLETED,
        score: decided(SHOOTOUT),
        winningSide: 1,
      });
      expect(result.success).toEqual(true);
      const tally: any = getParticipantResults({ matchUps: [matchUp] });
      const [winner, loser] = [1, 2].map(
        (sideNumber) => matchUp.sides.find((side) => side.sideNumber === sideNumber).participantId,
      );
      expect(tally.participantResults[winner]).toMatchObject({ matchUpsWon: 1, matchUpsDrawn: 0, gamesWon: 1 });
      expect(tally.participantResults[loser]).toMatchObject({ matchUpsLost: 1, matchUpsDrawn: 0, gamesWon: 1 });
    });
  },
);

describe('the decided record is refused when it does not describe a decision', () => {
  it.each([
    ['no method', { matchUpStatus: COMPLETED, score: decided({}), winningSide: 1 }, 'decidedBy.method must be one of'],
    [
      'an unknown method',
      { matchUpStatus: COMPLETED, score: decided({ method: 'COIN' }), winningSide: 1 },
      'decidedBy.method must be one of',
    ],
    [
      'a tally that is not a shootout’s',
      { matchUpStatus: COMPLETED, score: decided({ method: 'LOTS', tally: [1, 0] }), winningSide: 1 },
      'a tally is a shootout’s',
    ],
    [
      'a level tally',
      { matchUpStatus: COMPLETED, score: decided({ method: 'SHOOTOUT', tally: [3, 3] }), winningSide: 1 },
      'decidedBy.tally is two unequal counts, side 1 first',
    ],
    [
      'a tally the other side won',
      { matchUpStatus: COMPLETED, score: decided(SHOOTOUT), winningSide: 2 },
      'decidedBy.tally is won by the winningSide',
    ],
    [
      'a rule that is not text',
      { matchUpStatus: COMPLETED, score: decided({ method: 'COMPETITION_RULE', rule: 3 }), winningSide: 1 },
      'decidedBy.rule must be a string',
    ],
    [
      'a score that decides the match',
      { matchUpStatus: COMPLETED, score: decided(SHOOTOUT, halves([2, 0], [0, 1])), winningSide: 1 },
      'only a level score is decided outside it',
    ],
    [
      'a score that is not complete',
      { matchUpStatus: COMPLETED, score: decided(SHOOTOUT, halves([1, 1])), winningSide: 1 },
      'only a level score is decided outside it',
    ],
  ])('%s', (_, outcome, info) => {
    const { drawId, matchUpId } = eliminationFirstMatchUp();
    const { result, matchUp } = score(drawId, matchUpId, outcome);
    expect(result.error).toEqual(INVALID_SCORE);
    expect(result.info.startsWith(info)).toEqual(true);
    expect(matchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  // the outcome pipelines refuse these before the score is read (a level result with no winner in elimination, a winner
  // on a live status), so the record's own refusal is asked of validateScore
  it.each([
    ['no winner', { matchUpStatus: COMPLETED }],
    ['a result still in progress', { matchUpStatus: IN_PROGRESS, winningSide: 1 }],
    ['no status but no winner', {}],
  ])('%s', (_, outcome) => {
    const result: any = validateScore({ matchUpFormat: SOCCER, score: decided(SHOOTOUT) as any, ...outcome });
    expect(result.error).toEqual(INVALID_SCORE);
    expect(result.info).toEqual('a result decided outside its score is COMPLETED and names its winner');
  });

  it('a combined total that may tie is decided outside it too', () => {
    const { drawId, matchUpId } = eliminationFirstMatchUp('SET1-S:P16');
    const sets = [{ setNumber: 1, side1Score: 8, side2Score: 8 }];
    expect(score(drawId, matchUpId, { matchUpStatus: COMPLETED, score: { sets } }).result.error).toEqual(
      UNDECIDED_LEVEL_RESULT,
    );
    const { result } = score(drawId, matchUpId, {
      matchUpStatus: COMPLETED,
      score: decided({ method: 'LOTS' }, sets),
      winningSide: 2,
    });
    expect(result.success).toEqual(true);
  });
});

describe('TEAM: a dual is decided by its tieFormat', () => {
  it('a level tieMatchUp inside an elimination draw needs no decision', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawSize: 4, eventType: TEAM_EVENT, drawType: SINGLE_ELIMINATION, tieFormatName: INTENNSE_2026 },
      ],
      setState: true,
    });
    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
    const tieMatchUp = matchUps.find(
      (matchUp) => matchUp.collectionId && matchUp.matchUpFormat === 'SET2XA-S:T10' && matchUp.roundNumber === 1,
    );
    const { result, matchUp } = score(drawId, tieMatchUp.matchUpId, {
      matchUpStatus: COMPLETED,
      score: { sets: halves([3, 1], [0, 2]) },
    });
    expect(result.success).toEqual(true);
    expect(matchUp.matchUpStatus).toEqual(COMPLETED);
    expect(matchUp.winningSide).toBeUndefined();
  });
});

describe('standings: a rule conditioned on how a result was decided', () => {
  // IIHF's 3-2-1-0: 3 for a win in regulation, 2 for a win decided by a shootout, 1 for its loss
  const IIHF = {
    groupOrderKey: 'classificationPoints',
    resultPoints: {
      rules: [
        { id: 'shootout', decidedBy: ['SHOOTOUT'], winner: 2, loser: 1 },
        { id: 'regulation', decidedIn: ['REGULATION'], winner: 3, loser: 0 },
      ],
    },
  };

  it('a shootout win earns 2 and its loss 1; a regulation win earns 3', () => {
    expect(validateTallyPolicy({ tallyPolicy: IIHF as any }).error).toBeUndefined();
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 3, drawType: ROUND_ROBIN, matchUpFormat: SOCCER }],
      setState: true,
    });
    const matchUps = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
    const outcomes = [
      { matchUpStatus: COMPLETED, score: decided(SHOOTOUT), winningSide: 1 },
      { matchUpStatus: COMPLETED, score: { sets: halves([2, 0], [0, 1]) }, winningSide: 1 },
      { matchUpStatus: COMPLETED, score: decided({ method: 'LOTS' }), winningSide: 2 },
    ];
    const scored = matchUps.map(({ matchUpId }, index) => score(drawId, matchUpId, outcomes[index]));
    for (const { result } of scored) expect(result.success).toEqual(true);

    const all = scored.map(({ matchUp }) => matchUp);
    const result: any = getParticipantResults({ matchUps: all, tallyPolicy: IIHF as any });
    const sideId = (index: number, sideNumber: number) =>
      all[index].sides.find((side) => side.sideNumber === sideNumber).participantId;
    const awards = (index: number) =>
      [1, 2].map((sideNumber) =>
        result.participantResults[sideId(index, sideNumber)].classificationContributions.find(
          (contribution) => contribution.matchUpId === all[index].matchUpId,
        ),
      );
    expect(awards(0).map(({ ruleId, points }) => [ruleId, points])).toEqual([
      ['shootout', 2],
      ['shootout', 1],
    ]);
    expect(awards(1).map(({ ruleId, points }) => [ruleId, points])).toEqual([
      ['regulation', 3],
      ['regulation', 0],
    ]);
    // decided by lots: neither rule names it, so it is listed unmatched rather than counted as nothing
    for (const sideNumber of [1, 2]) {
      expect(result.participantResults[sideId(2, sideNumber)].classificationUnmatched).toEqual([all[2].matchUpId]);
    }
  });

  it('decidedIn EXTERNAL matches every result decided outside the score', () => {
    const policy = { resultPoints: { rules: [{ id: 'external', decidedIn: ['EXTERNAL'], winner: 2, loser: 1 }] } };
    const { drawId, matchUpId } = eliminationFirstMatchUp();
    const { matchUp } = score(drawId, matchUpId, {
      matchUpStatus: COMPLETED,
      score: decided({ method: 'OFFICIAL_DECISION' }),
      winningSide: 1,
    });
    const result: any = getParticipantResults({ matchUps: [matchUp], tallyPolicy: policy as any });
    const points = [1, 2].map(
      (sideNumber) =>
        result.participantResults[matchUp.sides.find((side) => side.sideNumber === sideNumber).participantId]
          .classificationPoints,
    );
    expect(points).toEqual([2, 1]);
  });
});
