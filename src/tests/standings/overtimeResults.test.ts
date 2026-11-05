import { getParticipantResults } from '@Query/matchUps/roundRobinTally/getParticipantResults';
import { overtimeResultString } from '@Helpers/matchUpFormatCode/overtimeContext';
import { validateTallyPolicy } from '@Validators/validateTallyPolicy';
import { setOutcomePipeline } from '@Global/state/globalState';
import { validateScore } from '@Validators/validateScore';
import { afterEach, describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants and types
import { OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';
import { INVALID_SCORE, UNDECIDED_LEVEL_RESULT } from '@Constants/errorConditionConstants';
import { ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';

/*
 * Standings phase 2, once overtime opened for new use (activation S6, factory #6185; CA 2026-11-05):
 * - a period of an aggregate format that finished 0-0 is recorded, not dropped as an empty set;
 * - hockey's 3-2-1-0 is scored from the result's own record of how it was decided (`decidedIn`);
 * - a result decided outside its score in an overtime format is refused where the score already decides the match;
 * - a result decided outside its score in a format without overtime gets the same legible `score.overtime.scoreString`.
 */

afterEach(() => setOutcomePipeline());

// IIHF: three 20-minute periods, five minutes of sudden-death overtime, then a shootout
const HOCKEY = 'PER3XA-S:T20P-O:1SD/T5P-F:SO5';
const SOCCER = 'HAL2A-S:T45';
const periods = (...goals: [number, number][]) =>
  goals.map(([side1Score, side2Score], index) => ({ setNumber: index + 1, side1Score, side2Score }));
const decided = (decidedBy: Record<string, unknown>, sets: ReturnType<typeof periods>) => ({
  sets,
  overtime: { decidedIn: 'EXTERNAL', decidedBy },
});

function firstMatchUp(matchUpFormat: string, drawType = ROUND_ROBIN, drawSize = 4) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, drawType, matchUpFormat }],
    setState: true,
  });
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, matchUpFilters: { roundNumbers: [1] } });
  return { drawId, matchUpIds: matchUps.map(({ matchUpId }) => matchUpId) };
}

function score(drawId: string, matchUpId: string, outcome: Record<string, unknown>) {
  const result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId, inContext: true });
  return { result, matchUp };
}

const stored = (matchUp: any) => matchUp.score?.sets?.map(({ side1Score, side2Score }) => [side1Score, side2Score]);

describe.each<OutcomePipelineMode>([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_DIFFERENTIAL])(
  'a goalless period is recorded, pipeline %s',
  (pipeline) => {
    it('a 0-0 half or period of a complete result is kept, in a format with or without overtime', () => {
      setOutcomePipeline(pipeline);
      for (const [matchUpFormat, sets] of [
        [SOCCER, periods([1, 0], [0, 0])],
        ['PER3A-S:T20', periods([1, 0], [0, 0], [1, 0])],
        [HOCKEY, periods([1, 0], [0, 0], [1, 0])],
      ] as const) {
        const { drawId, matchUpIds } = firstMatchUp(matchUpFormat);
        const { result, matchUp } = score(drawId, matchUpIds[0], {
          matchUpStatus: COMPLETED,
          score: { sets },
          winningSide: 1,
        });
        expect({ matchUpFormat, success: result.success }).toEqual({ matchUpFormat, success: true });
        expect(stored(matchUp)).toEqual(sets.map(({ side1Score, side2Score }) => [side1Score, side2Score]));
      }
    });

    it('in a match in progress, a 0-0 period is kept once play follows it; a trailing one is a placeholder', () => {
      setOutcomePipeline(pipeline);
      const { drawId, matchUpIds } = firstMatchUp('SET3XA-S:T10');
      const followed = score(drawId, matchUpIds[0], {
        matchUpStatus: IN_PROGRESS,
        score: { sets: periods([0, 0], [1, 0]) },
      });
      expect(followed.result.success).toEqual(true);
      expect(stored(followed.matchUp)).toEqual([
        [0, 0],
        [1, 0],
      ]);
      const trailing = score(drawId, matchUpIds[1], {
        matchUpStatus: IN_PROGRESS,
        score: { sets: periods([1, 0], [0, 0]) },
      });
      expect(trailing.result.success).toEqual(true);
      expect(stored(trailing.matchUp)).toEqual([[1, 0]]);
    });

    it('a closed 0-0 period of a match in progress is kept', () => {
      setOutcomePipeline(pipeline);
      const { drawId, matchUpIds } = firstMatchUp('SET3XA-S:T10');
      const sets = [{ ...periods([1, 0])[0] }, { setNumber: 2, side1Score: 0, side2Score: 0, segmentComplete: true }];
      const { result, matchUp } = score(drawId, matchUpIds[0], { matchUpStatus: IN_PROGRESS, score: { sets } });
      expect(result.success).toEqual(true);
      expect(stored(matchUp)).toEqual([
        [1, 0],
        [0, 0],
      ]);
    });

    it('a 0-0 set of a format counted in sets is still a placeholder', () => {
      setOutcomePipeline(pipeline);
      const { drawId, matchUpIds } = firstMatchUp('SET3-S:6/TB7');
      const sets = [
        { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
        { setNumber: 2, side1Score: 6, side2Score: 3, winningSide: 1 },
        { setNumber: 3, side1Score: 0, side2Score: 0 },
      ];
      const { result, matchUp } = score(drawId, matchUpIds[0], {
        matchUpStatus: COMPLETED,
        score: { sets },
        winningSide: 1,
      });
      expect(result.success).toEqual(true);
      expect(stored(matchUp)).toEqual([
        [6, 4],
        [6, 3],
      ]);
    });
  },
);

describe('hockey: 3-2-1-0 from how each result was decided', () => {
  // IIHF: 3 for a win in regulation; 2 for a win in overtime or the shootout, 1 for that loss; 0 for a regulation loss
  const IIHF = {
    groupOrderKey: 'classificationPoints',
    resultPoints: {
      rules: [
        { id: 'regulation', decidedIn: ['REGULATION'], winner: 3, loser: 0 },
        { id: 'overtime', decidedIn: ['OVERTIME', 'DECIDER'], winner: 2, loser: 1 },
      ],
    },
  };

  it.each<OutcomePipelineMode>([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_DIFFERENTIAL])(
    'regulation, overtime and shootout results earn their points, pipeline %s',
    (pipeline) => {
      setOutcomePipeline(pipeline);
      expect(validateTallyPolicy({ tallyPolicy: IIHF as any }).error).toBeUndefined();
      const { drawId } = firstMatchUp(HOCKEY, ROUND_ROBIN, 3);
      const all = tournamentEngine.allDrawMatchUps({ drawId }).matchUps.map(({ matchUpId }) => matchUpId);
      expect(all).toHaveLength(3);
      const outcomes = [
        // a regulation win with a scoreless period
        { winningSide: 1, sets: periods([1, 0], [0, 0], [1, 0]), decidedIn: 'REGULATION', points: [3, 0] },
        // sudden death in overtime
        { winningSide: 2, sets: periods([1, 0], [0, 1], [0, 0], [0, 1]), decidedIn: 'OVERTIME', points: [1, 2] },
        // a scoreless overtime, then the shootout 3-2
        {
          winningSide: 1,
          sets: periods([1, 0], [0, 1], [0, 0], [0, 0], [3, 2]),
          decidedIn: 'DECIDER',
          points: [2, 1],
        },
      ];
      const scored = all.map((matchUpId, index) => {
        const { winningSide, sets } = outcomes[index];
        return score(drawId, matchUpId, { matchUpStatus: COMPLETED, score: { sets }, winningSide });
      });
      scored.forEach(({ result, matchUp }, index) => {
        expect(result.success).toEqual(true);
        expect(matchUp.score.overtime.decidedIn).toEqual(outcomes[index].decidedIn);
      });

      const matchUps = scored.map(({ matchUp }) => matchUp);
      const tally: any = getParticipantResults({ matchUps, tallyPolicy: IIHF as any });
      matchUps.forEach((matchUp, index) => {
        const points = [1, 2].map((sideNumber) => {
          const { participantId } = matchUp.sides.find((side) => side.sideNumber === sideNumber);
          return tally.participantResults[participantId].classificationContributions.find(
            (contribution) => contribution.matchUpId === matchUp.matchUpId,
          ).points;
        });
        expect(points).toEqual(outcomes[index].points);
      });
    },
  );
});

describe.each<OutcomePipelineMode>([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_DIFFERENTIAL])(
  'a level finish after a finite overtime with no decider, pipeline %s',
  (pipeline) => {
    // 90 minutes, then two periods of extra time, then the match stands level
    const EXTRA_TIME = 'HAL2XA-S:T45P-O:2/T15P';
    const LEVEL_AFTER_EXTRA_TIME = periods([1, 0], [0, 1], [0, 0], [0, 0]);

    it('is a draw in a round robin', () => {
      setOutcomePipeline(pipeline);
      const { drawId, matchUpIds } = firstMatchUp(EXTRA_TIME);
      const { result, matchUp } = score(drawId, matchUpIds[0], {
        matchUpStatus: COMPLETED,
        score: { sets: LEVEL_AFTER_EXTRA_TIME },
      });
      expect(result.success).toEqual(true);
      expect(matchUp.score.overtime).toMatchObject({ decidedIn: 'OVERTIME', scoreString: '1-1 (OT 2, drawn)' });
      const tally: any = getParticipantResults({ matchUps: [matchUp] });
      for (const { participantId } of matchUp.sides)
        expect(tally.participantResults[participantId]).toMatchObject({ matchUpsDrawn: 1, matchUpsWon: 0 });
    });

    it('needs a decision where a winner must advance', () => {
      setOutcomePipeline(pipeline);
      const { drawId, matchUpIds } = firstMatchUp(EXTRA_TIME, SINGLE_ELIMINATION);
      const level = score(drawId, matchUpIds[0], { matchUpStatus: COMPLETED, score: { sets: LEVEL_AFTER_EXTRA_TIME } });
      expect(level.result.error).toEqual(UNDECIDED_LEVEL_RESULT);
      const { result } = score(drawId, matchUpIds[0], {
        matchUpStatus: COMPLETED,
        score: decided({ method: 'SHOOTOUT', tally: [5, 4] }, LEVEL_AFTER_EXTRA_TIME),
        winningSide: 1,
      });
      expect(result.success).toEqual(true);
    });
  },
);

describe('a result decided outside its score, in an overtime format', () => {
  const validate = (sets: ReturnType<typeof periods>, winningSide = 1) =>
    validateScore({
      score: decided({ method: 'OFFICIAL_DECISION' }, sets) as any,
      matchUpStatus: COMPLETED,
      matchUpFormat: HOCKEY,
      winningSide,
    });

  it('is refused where the score decides the match, or regulation was not played', () => {
    const refusal = 'only a level score is decided outside it: this score decides the match, or is not complete';
    for (const sets of [
      periods([2, 0], [0, 0], [0, 0]), // regulation decides
      periods([1, 0], [0, 1], [0, 0], [1, 0]), // a sudden-death period decides
      periods([1, 0], [0, 1], [0, 0], [0, 0], [3, 2]), // the shootout decides
      periods([0, 0], [0, 0]), // regulation is not over
      periods([1, 0]), // regulation is not over, and the score is not level
    ]) {
      expect(validate(sets)).toEqual({ error: INVALID_SCORE, info: refusal });
    }
  });

  it('is refused where a decider recorded in its tiebreak points decides the match, the goals level', () => {
    const sets = [
      ...periods([1, 0], [0, 1], [0, 0], [0, 0]),
      { setNumber: 5, side1TiebreakScore: 1, side2TiebreakScore: 0 },
    ];
    const result = validateScore({
      score: decided({ method: 'OFFICIAL_DECISION' }, sets as any) as any,
      matchUpFormat: 'PER3XA-S:T20P-O:1SD/T5P-F:TB1',
      matchUpStatus: COMPLETED,
      winningSide: 1,
    });
    expect(result.error).toEqual(INVALID_SCORE);
  });

  it('is recorded where the score is level after regulation or overtime', () => {
    expect(validate(periods([1, 0], [0, 1], [0, 0])).valid).toEqual(true);
    const { drawId, matchUpIds } = firstMatchUp(HOCKEY, SINGLE_ELIMINATION);
    const { result, matchUp } = score(drawId, matchUpIds[0], {
      matchUpStatus: COMPLETED,
      score: decided({ method: 'SHOOTOUT', tally: [2, 3] }, periods([1, 0], [0, 1], [0, 0], [0, 0])),
      winningSide: 2,
    });
    expect(result.success).toEqual(true);
    expect(matchUp.score.overtime).toMatchObject({ decidedIn: 'EXTERNAL', scoreString: '1-1 (Shootout: 2-3)' });
  });
});

describe('a result decided outside its score, in a format without overtime, reads as one', () => {
  it.each([
    [SOCCER, decided({ method: 'SHOOTOUT', tally: [4, 3] }, periods([1, 0], [0, 1])), 1, '1-1 (Shootout: 4-3)'],
    ['SET1-S:P16', decided({ method: 'LOTS' }, periods([8, 8])), 2, '8-8 (Lots)'],
    [
      'SET3-S:T10',
      decided({ method: 'COMPETITION_RULE', rule: 'fewer penalties' }, periods([2, 1], [1, 2], [1, 1])),
      1,
      '2-1 1-2 1-1 (Competition rule)',
    ],
  ] as const)('%s', (matchUpFormat, outcomeScore, winningSide, scoreString) => {
    const { drawId, matchUpIds } = firstMatchUp(matchUpFormat, SINGLE_ELIMINATION);
    const { result, matchUp } = score(drawId, matchUpIds[0], {
      matchUpStatus: COMPLETED,
      score: outcomeScore,
      winningSide,
    });
    expect(result.success).toEqual(true);
    expect(matchUp.score.overtime).toMatchObject({
      phase: 'REGULATION',
      decidedIn: 'EXTERNAL',
      decidedBy: outcomeScore.overtime.decidedBy,
      scoreString,
    });
  });

  it('a record with no method reads as decided, and a tally reads from the side asked', () => {
    const context: any = { phase: 'REGULATION', periodNumber: 2, aggregateScore: [1, 1], decidedIn: 'EXTERNAL' };
    expect(overtimeResultString(context)).toEqual('1-1 (Decided)');
    const shootout = { ...context, aggregateScore: [2, 1], decidedBy: { method: 'SHOOTOUT', tally: [4, 3] } };
    expect(overtimeResultString(shootout, 1)).toEqual('1-2 (Shootout: 3-4)');
  });
});
