import { generateOutcomeFromScoreString } from '@Generators/simulation/generateOutcomeFromScoreString';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { setOutcomePipeline } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import {
  INVALID_END_TIME,
  INVALID_RESUME_TIME,
  INVALID_STOP_TIME,
  INVALID_VALUES,
  VENUE_NOT_FOUND,
} from '@Constants/errorConditionConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * S7, § 2 row 29: a schedule refused by its own write (a stop, resume or end time out of order, a venue not found, a
 * court order not a number) is refused before the outcome lands. v1 applied the schedule after the outcome and met
 * these there: the result was written and directed, then the call returned the error (measured 2026-11-01). Both
 * pipelines now ask `scheduleRefusal` first, so the record is unchanged, the code is the writer's own, and the
 * differential compares the two refusals (it threw a divergence on every shape below before).
 */
afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];
const won = generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
const inProgress = { matchUpStatus: IN_PROGRESS, score: { sets: [{ setNumber: 1, side1Score: 3, side2Score: 2 }] } };

const SHAPES: [string, Record<string, unknown>, Record<string, unknown> | undefined, string][] = [
  ['a winner with a stop time and no start time', { stopTime: '10:20' }, won, INVALID_STOP_TIME.code],
  [
    'a winner with a stop and resume time, no start',
    { stopTime: '10:20', resumeTime: '10:40' },
    won,
    INVALID_STOP_TIME.code,
  ],
  ['a winner with a resume time and no stop time', { resumeTime: '10:40' }, won, INVALID_RESUME_TIME.code],
  [
    'a winner with an end time before its start time',
    { startTime: '11:00', endTime: '10:00' },
    won,
    INVALID_END_TIME.code,
  ],
  ['a winner with a venue not found', { venueId: 'nowhere' }, won, VENUE_NOT_FOUND.code],
  ['a winner with a court order not a number', { courtOrder: 'x' }, won, INVALID_VALUES.code],
  [
    'a matchUp in progress with a stop time and no start time',
    { stopTime: '10:20' },
    inProgress,
    INVALID_STOP_TIME.code,
  ],
  ['a schedule alone, a stop time and no start time', { stopTime: '10:20' }, undefined, INVALID_STOP_TIME.code],
];

describe('a schedule its own write refuses is refused before the outcome, alike under v1, v2 and differential', () => {
  it.each(SHAPES)('%s', (_label, schedule, outcome, code) => {
    for (const mode of MODES) {
      setOutcomePipeline(OUTCOME_PIPELINE_V1);
      mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawId: 'd', drawSize: 8 }],
        startDate: '2026-01-01',
        endDate: '2026-01-07',
        nonRandom: 1,
        setState: true,
      });
      const { matchUpId } = tournamentEngine
        .allDrawMatchUps({ drawId: 'd' })
        .matchUps.find((matchUp: any) => matchUp.roundNumber === 1);
      const before = canonicalJson(tournamentEngine.getTournament().tournamentRecord);
      const compared = getDifferentialTally().refusal?.compared ?? 0;
      setOutcomePipeline(mode);
      const result: any = tournamentEngine.setMatchUpStatus({
        drawId: 'd',
        matchUpId,
        ...(outcome ? { outcome } : {}),
        schedule,
      });
      expect([mode, result.error?.code]).toEqual([mode, code]);
      expect(canonicalJson(tournamentEngine.getTournament().tournamentRecord)).toEqual(before);
      if (mode === OUTCOME_PIPELINE_DIFFERENTIAL)
        expect(getDifferentialTally().refusal?.compared).toEqual(compared + 1);
    }
  });

  it('CONTROL: a schedule its write accepts still lands with the outcome', () => {
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'd', drawSize: 8 }],
      startDate: '2026-01-01',
      endDate: '2026-01-07',
      nonRandom: 1,
      setState: true,
    });
    const { matchUpId } = tournamentEngine
      .allDrawMatchUps({ drawId: 'd' })
      .matchUps.find((matchUp: any) => matchUp.roundNumber === 1);
    const schedule = { startTime: '10:00', stopTime: '10:20', resumeTime: '10:40', endTime: '11:30' };
    const result: any = tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome: won, schedule });
    expect(result.success).toEqual(true);
    const { matchUp } = tournamentEngine.findMatchUp({ drawId: 'd', matchUpId });
    expect([matchUp.winningSide, matchUp.schedule.startTime, matchUp.schedule.endTime]).toEqual([1, '10:00', '11:30']);
  });
});
