import { generateOutcomeFromScoreString } from '@Generators/simulation/generateOutcomeFromScoreString';
import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { LAVER_CUP } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  COMPASS,
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';
import {
  MODIFY_DRAW_DEFINITION,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';

/**
 * S7: V2 OWNS A TEAM LINE'S RESULT THAT LEAVES ITS DUAL UNDECIDED (outcome v2 executor plan § 6 S7). A line's first
 * result on a dual already in progress, whose stored sides, tieFormat and score source `updateTieMatchUpScore` leaves as
 * they are: v1 writes the line, then the dual's tally (its score; its status stays IN_PROGRESS). Under `v2` the call is
 * written by v2 and v1's writer is not asked; the record, the notices (payloads, in order) and the results equal v1's,
 * under the fixed and the real clock.
 *
 * Still v1's, pinned below: a dual's first line (v1 copies its line-ups and tieFormat onto the dual), a line that
 * decides its dual, and a line in a round robin (its group's tally).
 */
const v1Writes = vi.hoisted(() => ({ count: 0 }));
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      v1Writes.count += 1;
      return actual.setMatchUpState(...args);
    },
  };
});

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

const TOPICS = [MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION, MODIFY_POSITION_ASSIGNMENTS, UPDATE_INCONTEXT_MATCHUP];
const won = (winningSide: 1 | 2) => generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide }).outcome;

/**
 * a line of a dual: the dual by structure, round and position (a round robin's: the round's first, `roundPosition` 0),
 * the line by its index among the dual's lines
 */
type Line = { structureName: string; roundNumber: number; roundPosition: number; line: number };
type Scenario = {
  drawProfile: Record<string, unknown>;
  /** after the setup, the step's dual stores no tieFormat of its own (an imported record): v1 copies it on */
  unsettled?: true;
  setup: { target: Line; winningSide: 1 | 2 }[];
  step: { target: Line; winningSide: 1 | 2 };
};

function findLine({ structureName, roundNumber, roundPosition, line }: Line): string {
  const dual = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true })
    .matchUps.find(
      (matchUp: any) =>
        matchUp.tieMatchUps &&
        matchUp.structureName === structureName &&
        matchUp.roundNumber === roundNumber &&
        (!roundPosition || matchUp.roundPosition === roundPosition),
    );
  return dual.tieMatchUps[line].matchUpId;
}

/**
 * The scenario's record, prepared once under v1 and copied for each run: setting a line-up result can create PAIR
 * participants with fresh ids, so two separately generated records would differ before the step under test
 */
function prepare({ drawProfile, setup, step, unsettled }: Scenario, realClock: boolean) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock(realClock ? undefined : '2026-10-25T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM, ...drawProfile, drawId: 'd' }],
    nonRandom: 1,
    setState: true,
  });
  expect(tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd' }).success).toEqual(
    true,
  );
  for (const { target, winningSide } of setup) {
    const result = tournamentEngine.setMatchUpStatus({
      drawId: 'd',
      matchUpId: findLine(target),
      outcome: won(winningSide),
    });
    if (!result.success) throw new Error(`setup step failed: ${JSON.stringify(target)}`);
  }
  const record = structuredClone(tournamentEngine.getTournament().tournamentRecord);
  if (unsettled) {
    const lineId = findLine(step.target);
    const duals = record.events.flatMap((event: any) =>
      event.drawDefinitions.flatMap((draw: any) => draw.structures.flatMap((structure: any) => structure.matchUps)),
    );
    const dual = duals.find((matchUp: any) => matchUp.tieMatchUps?.some((line: any) => line.matchUpId === lineId));
    // CONTROL: the dual is in progress and stored a tieFormat, which is taken away
    expect([dual.matchUpStatus, !!dual.tieFormat]).toEqual(['IN_PROGRESS', true]);
    delete dual.tieFormat;
  }
  return record;
}

function play(mode: OutcomePipelineMode, { step }: Scenario, prepared: any, realClock = false) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  tournamentEngine.setState(structuredClone(prepared));
  deleteNotices();
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      (realClock ? TOPICS.filter((topic) => topic !== UPDATE_INCONTEXT_MATCHUP) : TOPICS).map((topic) => [
        topic,
        (payloads: any[]) => payloads.forEach((p) => notices.push(`${topic} ${canonicalJson(p)}`)),
      ]),
    ),
  });
  const matchUpId = findLine(step.target);
  setOutcomePipeline(mode);
  v1Writes.count = 0;
  if (!realClock) setClock('2026-10-25T00:01:00.000Z');
  const { stack: _stack, ...result } = tournamentEngine.setMatchUpStatus({
    outcome: won(step.winningSide),
    drawId: 'd',
    matchUpId,
  }) as any;
  return {
    record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
    v1Writes: v1Writes.count,
    notices,
    result,
  };
}

const R1 = (roundPosition: number, line: number, structureName = 'Main'): Line => ({
  roundNumber: 1,
  structureName,
  roundPosition,
  line,
});

const OWNED: [string, Scenario][] = [
  [
    'SINGLE_ELIMINATION: a dual 1-0 takes its second line for the other side, 1-1',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1, 0), winningSide: 1 }],
      step: { target: R1(1, 1), winningSide: 2 },
    },
  ],
  [
    'SINGLE_ELIMINATION: a fourth line, 4-0, short of the value goal of 5',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [0, 1, 2].map((line) => ({ target: R1(2, line), winningSide: 1 as const })),
      step: { target: R1(2, 3), winningSide: 1 },
    },
  ],
  [
    'SINGLE_ELIMINATION at LAVER_CUP: a line of a collection valued differently',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION, tieFormatName: LAVER_CUP },
      setup: [{ target: R1(1, 0), winningSide: 2 }],
      step: { target: R1(1, 4), winningSide: 1 },
    },
  ],
  [
    'COMPASS: a line of an East dual',
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      setup: [{ target: R1(3, 0, 'East'), winningSide: 1 }],
      step: { target: R1(3, 1, 'East'), winningSide: 1 },
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION: a line of a Main dual',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [{ target: R1(2, 2), winningSide: 2 }],
      step: { target: R1(2, 5), winningSide: 2 },
    },
  ],
];

describe('under v2, a TEAM line that leaves its dual undecided is v2s, and leaves exactly what v1 leaves', () => {
  it.each(OWNED)('%s', (_label, scenario) => {
    for (const realClock of [false, true]) {
      const prepared = prepare(scenario, realClock);
      const v1 = play(OUTCOME_PIPELINE_V1, scenario, prepared, realClock);
      const v2 = play(OUTCOME_PIPELINE_V2, scenario, prepared, realClock);
      // the differential compares v2's plan with v1's write, notices included: a divergence would throw
      expect(play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario, prepared, realClock).result.success).toEqual(true);
      // CONTROL: v1 wrote through its own writer, and the step succeeded
      expect(v1.v1Writes).toBeGreaterThanOrEqual(1);
      expect(v1.result.success).toEqual(true);

      expect(v2.v1Writes).toEqual(0);
      expect(v2.result).toEqual(v1.result);
      if (!realClock) expect(v2.record).toEqual(v1.record);
      expect(v2.notices.length).toEqual(v1.notices.length);
      if (!realClock) expect(v2.notices).toEqual(v1.notices);
    }
  });
});

const KEPT: [string, Scenario][] = [
  [
    "a dual's first line: v1 copies its line-ups and tieFormat onto the dual",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [],
      step: { target: R1(1, 0), winningSide: 1 },
    },
  ],
  [
    'a line that decides its dual (5-0 at a value goal of 5): the dual is directed',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [0, 1, 2, 3].map((line) => ({ target: R1(1, line), winningSide: 1 as const })),
      step: { target: R1(1, 4), winningSide: 1 },
    },
  ],
  [
    'an in-progress dual storing no tieFormat of its own (an imported record): v1 copies the tieFormat onto it',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1, 0), winningSide: 1 }],
      step: { target: R1(1, 1), winningSide: 2 },
      unsettled: true,
    },
  ],
  [
    "a line in a round robin: v1 re-reads its group's tally (a line's group is read off its dual, hydration OPEN-14)",
    {
      drawProfile: { drawSize: 4, drawType: ROUND_ROBIN },
      setup: [{ target: R1(0, 0, 'Group 1'), winningSide: 1 }],
      step: { target: R1(0, 1, 'Group 1'), winningSide: 2 },
    },
  ],
];

describe('still v1s', () => {
  it.each(KEPT)('%s', (_label, scenario) => {
    const deferred = () => getDifferentialTally()['shadow:abstain:team']?.deferred ?? 0;
    const prepared = prepare(scenario, false);
    const before = deferred();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario, prepared);
    expect(compared.result.success).toEqual(true);
    expect(deferred() - before).toEqual(1);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario, prepared);
    expect(v2.v1Writes).toBeGreaterThanOrEqual(1);
  });
});
