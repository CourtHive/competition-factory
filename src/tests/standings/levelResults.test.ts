import { getParticipantResults } from '@Query/matchUps/roundRobinTally/getParticipantResults';
import { isDrawnResult } from '@Query/matchUps/roundRobinTally/drawnResults';
import { setOutcomePipeline } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants and types
import { OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { AD_HOC, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { MatchUp } from '@Types/tournamentTypes';

/*
 * Standings phase 2 § 1.1, slice 1 (CA 2026-11-04): a level finish of a format that can end level (scoring spec § 9.7)
 * is a drawn result where no winner is needed: the score is kept, no winner is named, and the tally counts a draw.
 * Before this, both pipelines stored a soccer 1-1 COMPLETED with no score.
 */

afterEach(() => setOutcomePipeline());

const SOCCER = 'HAL2A-S:T45';
const halves = (...goals: [number, number][]) => ({
  sets: goals.map(([side1Score, side2Score], index) => ({ setNumber: index + 1, side1Score, side2Score })),
});

function scoreFirstMatchUp({
  drawType,
  matchUpFormat,
  score,
  winningSide,
}: {
  drawType: string;
  matchUpFormat: string;
  score: Record<string, unknown>;
  winningSide?: number;
}) {
  const result: any = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      drawType === AD_HOC
        ? { drawSize: 4, drawType, matchUpFormat, automated: true, roundsCount: 1 }
        : { drawSize: 4, drawType, matchUpFormat },
    ],
    setState: true,
  });
  const drawId = result.drawIds[0];
  const [{ matchUpId }] = tournamentEngine.allTournamentMatchUps().matchUps;
  const outcome = { matchUpStatus: COMPLETED, score, winningSide };
  expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome }).success).toEqual(true);
  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId, inContext: true });
  return { matchUp, drawId };
}

describe.each<OutcomePipelineMode>([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_DIFFERENTIAL])(
  'level results, pipeline %s',
  (pipeline) => {
    it('keeps a soccer 1-1 in a round robin as a drawn result', () => {
      setOutcomePipeline(pipeline);
      const { matchUp } = scoreFirstMatchUp({
        drawType: ROUND_ROBIN,
        matchUpFormat: SOCCER,
        score: halves([1, 0], [0, 1]),
      });
      expect(matchUp.matchUpStatus).toEqual(COMPLETED);
      expect(matchUp.winningSide).toBeUndefined();
      expect(matchUp.score.sets.map((set) => [set.side1Score, set.side2Score])).toEqual([
        [1, 0],
        [0, 1],
      ]);

      const result: any = getParticipantResults({ matchUps: [matchUp] });
      for (const { participantId } of matchUp.sides) {
        expect(result.participantResults[participantId]).toMatchObject({ matchUpsDrawn: 1, gamesWon: 1, gamesLost: 1 });
      }
    });

    it('keeps a soccer 1-1 in an ad hoc draw', () => {
      setOutcomePipeline(pipeline);
      const { matchUp } = scoreFirstMatchUp({ drawType: AD_HOC, matchUpFormat: SOCCER, score: halves([1, 0], [0, 1]) });
      expect([matchUp.matchUpStatus, matchUp.winningSide, matchUp.score.sets.length]).toEqual([
        COMPLETED,
        undefined,
        2,
      ]);
    });

    it('still decides a 2-1', () => {
      setOutcomePipeline(pipeline);
      const { matchUp } = scoreFirstMatchUp({
        drawType: ROUND_ROBIN,
        matchUpFormat: SOCCER,
        score: halves([1, 0], [1, 1]),
        winningSide: 1,
      });
      expect([matchUp.matchUpStatus, matchUp.winningSide]).toEqual([COMPLETED, 1]);
    });
  },
);

describe('isDrawnResult: a level finish the format permits (scoring spec § 9.7)', () => {
  const result = (matchUpFormat: string, sets: [number, number][], extra: Partial<MatchUp> = {}) =>
    isDrawnResult({
      matchUpId: 'm',
      matchUpStatus: COMPLETED,
      matchUpFormat,
      score: halves(...sets),
      ...extra,
    } as MatchUp);

  it('reads an aggregate total over all N segments', () => {
    expect(
      result(SOCCER, [
        [1, 0],
        [0, 1],
      ]),
    ).toEqual(true);
    expect(
      result(SOCCER, [
        [1, 0],
        [0, 0],
      ]),
    ).toEqual(false);
    // one half is not a finish
    expect(result(SOCCER, [[1, 1]])).toEqual(false);
    // a winner named is not a draw
    expect(
      result(
        SOCCER,
        [
          [1, 0],
          [0, 1],
        ],
        { winningSide: 1 },
      ),
    ).toEqual(false);
    // not completed
    expect(
      result(
        SOCCER,
        [
          [1, 0],
          [0, 1],
        ],
        { matchUpStatus: 'IN_PROGRESS' },
      ),
    ).toEqual(false);
  });

  it('reads a declared decider: a sudden-death point settles it, a timed decider can close level', () => {
    expect(
      result('SET3XA-S:T10-F:TB1', [
        [3, 2],
        [1, 2],
        [0, 0],
      ]),
    ).toEqual(false);
    expect(
      result('SET3XA-S:T10-F:T10P', [
        [3, 2],
        [1, 2],
        [0, 0],
        [1, 1],
      ]),
    ).toEqual(true);
    // the decider settled it: not a draw
    expect(
      result('SET3XA-S:T10-F:T10P', [
        [3, 2],
        [1, 2],
        [0, 0],
        [2, 1],
      ]),
    ).toEqual(false);
    // the decider not yet played
    expect(
      result('SET3XA-S:T10-F:T10P', [
        [3, 2],
        [1, 2],
        [0, 0],
      ]),
    ).toEqual(false);
  });

  it('reads a level count of sets: a timed set closing level', () => {
    const sets = [
      { setNumber: 1, side1Score: 3, side2Score: 1, winningSide: 1 },
      { setNumber: 2, side1Score: 0, side2Score: 2, winningSide: 2 },
      { setNumber: 3, side1Score: 1, side2Score: 1 },
    ];
    const matchUp = (count: number) =>
      ({
        matchUpId: 'm',
        matchUpStatus: COMPLETED,
        matchUpFormat: 'SET3-S:T10',
        score: { sets: sets.slice(0, count) },
      }) as MatchUp;
    expect(isDrawnResult(matchUp(3))).toEqual(true);
    expect(isDrawnResult(matchUp(2))).toEqual(false);
  });

  it('reads a declared overtime as the scoring engine completes it', () => {
    const levelAfterExtraTime: [number, number][] = [
      [1, 0],
      [0, 1],
      [0, 0],
      [0, 0],
    ];
    // a finite overtime with no decider finishes level
    expect(result('HAL2XA-S:T45P-O:2X/T15P', levelAfterExtraTime)).toEqual(true);
    // a shootout follows a level overtime, and overtime follows a level regulation: neither is finished
    expect(result('HAL2XA-S:T45P-O:2X/T15P-F:SO5', levelAfterExtraTime)).toEqual(false);
    expect(result('HAL2XA-S:T45P-O:2X/T15P', levelAfterExtraTime.slice(0, 2))).toEqual(false);
  });

  it('reads a format that cannot end level as never drawn', () => {
    expect(
      result('SET3-S:6/TB7', [
        [6, 3],
        [3, 6],
      ]),
    ).toEqual(false);
  });
});
