import { generateOutcomeFromScoreString } from '@Generators/simulation/generateOutcomeFromScoreString';
import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import POLICY_SCORING_DEFAULT from '@Fixtures/policies/POLICY_SCORING_DEFAULT';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { RETIRED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
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
 * S7: V2 OWNS A TEAM LINE'S RESULT (outcome v2 executor plan § 6 S7). A line that leaves its dual undecided: v1 writes
 * the line, then the dual's tally (`updateTieMatchUpScore`: its sides and tieFormat where they change, its score and
 * status). A line that decides its dual: v1 also makes the dual's own call, writing its winner and directing it, and
 * carries the winning team's line-up onto its side of the next dual (`propagateLineUp`) and, where a loser link sends the
 * losing team on, the losing team's onto its side there (`propagateLoserLineUp`); a loser going on through a BYE there
 * also takes its draw line-up onto the dual beyond (`updateSideLineUp`). A line played on a dual already decided writes
 * the line and the dual's tally, the dual keeping its winner. A dual's own call given a winner is written and directed as
 * any winner, and its own double exit advanced as any double exit; its exit carried across a loser link is written on
 * the dual it reaches with that dual's sides ensured. Under `v2` the call is written
 * by v2 and v1's writer is not asked; the record, the notices (payloads, in order) and the results equal v1's, under the
 * fixed and the real clock.
 *
 * Still v1's, pinned below: a decided dual whose losing side holds no line-up; a
 * line in a round robin (its group's tally); a REPORTED score source; and auto-calc off.
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
function stepOutcome({ winningSide, outcome }: Scenario['step']) {
  if (outcome === 'winner') return { winningSide };
  if (outcome === 'cleared') return { matchUpStatus: TO_BE_PLAYED };
  if (outcome === 'DOUBLE_WALKOVER' || outcome === 'DOUBLE_DEFAULT') return { matchUpStatus: outcome };
  if (outcome === 'RETIRED') {
    return generateOutcomeFromScoreString({ scoreString: '6-1 2-1', winningSide, matchUpStatus: RETIRED }).outcome;
  }
  return outcome ? { winningSide, matchUpStatus: outcome } : won(winningSide);
}

/**
 * a line of a dual: the dual by structure, round and position (a round robin's: the round's first, `roundPosition` 0),
 * the line by its index among the dual's lines
 */
type Line = { structureName: string; roundNumber: number; roundPosition: number; line: number };
type Scenario = {
  drawProfile: Record<string, unknown>;
  /** after the setup, the step's dual stores no tieFormat of its own (an imported record): v1 copies it on */
  unsettled?: true;
  /** after the setup, the step's dual has auto-calc disabled */
  autoCalcOff?: true;
  /** lines played after auto-calc is disabled: they decide nothing */
  setupAfter?: { target: Line; winningSide: 1 | 2 }[];
  /** after the setup, the step's dual's tieFormat declares its score REPORTED: the lines derive nothing */
  reported?: true;
  /** after the setup, each side of the step's dual holds an assignment naming no participant */
  stray?: true;
  /** after the setup, the step's dual's side 2 holds no line-up */
  bare?: true;
  setup: { target: Line; winningSide: 1 | 2 }[];
  /** the step's outcome: scored 6-1 6-1 (default), a winner alone, a single exit, or a double exit (its side unused) */
  step: {
    target: Line;
    winningSide: 1 | 2;
    /** the call is the dual's own (the target's line is ignored) */
    dual?: true;
    /** the call's flags (`enableAutoCalc`, `propagateExitStatus`, ...) */
    flags?: Record<string, boolean>;
    outcome?: 'winner' | 'cleared' | 'WALKOVER' | 'DEFAULTED' | 'RETIRED' | 'DOUBLE_WALKOVER' | 'DOUBLE_DEFAULT';
  };
  /** CONTROL: the dual a loser link sends the losing team to, and whether v1 carries its line-up onto that side */
  loserSeat?: { dual: Omit<Line, 'line'>; sideNumber: 1 | 2; carried: boolean };
  /** CONTROL: past a BYE, the dual beyond the loser's seat, which v1 writes the losing team's draw line-up onto */
  beyondSeat?: Scenario['loserSeat'];
  /** CONTROL: the step's dual is decided before the step, for this side, and v1 leaves it so */
  decided?: 1 | 2;
  /** the tournament's policies (a scoring policy's `processCodes`) */
  policyDefinitions?: Record<string, unknown>;
  /** KEPT: the reason v2 leaves the step to v1 (`team` unless named) */
  abstains?: string;
  /** after the setup, the step's dual is given this exit (for side 1, a single one) by its own call */
  dualExit?: 'WALKOVER' | 'DEFAULTED' | 'DOUBLE_WALKOVER';
};

function findDual({ structureName, roundNumber, roundPosition }: Omit<Line, 'line'>): any {
  return tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true })
    .matchUps.find(
      (matchUp: any) =>
        matchUp.tieMatchUps &&
        matchUp.structureName === structureName &&
        matchUp.roundNumber === roundNumber &&
        (!roundPosition || matchUp.roundPosition === roundPosition),
    );
}

function findLine(target: Line): string {
  return findDual(target).tieMatchUps[target.line].matchUpId;
}

/** the line-up held on a side of a dual, as stored */
function heldLineUp({ dual, sideNumber }: NonNullable<Scenario['loserSeat']>) {
  const { matchUpId } = findDual(dual);
  const { matchUp } = tournamentEngine.findMatchUp({ drawId: 'd', matchUpId });
  return matchUp.sides?.find((side: any) => side.sideNumber === sideNumber)?.lineUp;
}

/** the stored winner of a line's dual */
function dualWinner(target: Line) {
  const { matchUpId } = findDual(target);
  return tournamentEngine.findMatchUp({ drawId: 'd', matchUpId }).matchUp.winningSide;
}

/**
 * The scenario's record, prepared once under v1 and copied for each run: setting a line-up result can create PAIR
 * participants with fresh ids, so two separately generated records would differ before the step under test
 */
function prepare(
  {
    drawProfile,
    setup,
    setupAfter,
    step,
    unsettled,
    autoCalcOff,
    reported,
    stray,
    bare,
    dualExit,
    policyDefinitions,
  }: Scenario,
  realClock: boolean,
) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock(realClock ? undefined : '2026-10-25T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM, ...drawProfile, drawId: 'd' }],
    policyDefinitions,
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
  if (dualExit) {
    const { matchUpId } = findDual(step.target);
    const outcome =
      dualExit === 'DOUBLE_WALKOVER' ? { matchUpStatus: dualExit } : { matchUpStatus: dualExit, winningSide: 1 };
    expect(tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome }).success).toEqual(true);
  }
  if (autoCalcOff) {
    const lineId = findLine(step.target);
    const dual = tournamentEngine
      .allDrawMatchUps({ drawId: 'd', inContext: true })
      .matchUps.find((matchUp: any) => matchUp.tieMatchUps?.some((line: any) => line.matchUpId === lineId));
    expect(tournamentEngine.disableTieAutoCalc({ drawId: 'd', matchUpId: dual.matchUpId }).success).toEqual(true);
  }
  for (const { target, winningSide } of setupAfter ?? []) {
    const played = tournamentEngine.setMatchUpStatus({
      drawId: 'd',
      matchUpId: findLine(target),
      outcome: won(winningSide),
    });
    if (!played.success) throw new Error(`setup step failed: ${JSON.stringify(target)}`);
  }
  const record = structuredClone(tournamentEngine.getTournament().tournamentRecord);
  if (reported) {
    const lineId = findLine(step.target);
    const duals = record.events.flatMap((event: any) =>
      event.drawDefinitions.flatMap((draw: any) => draw.structures.flatMap((structure: any) => structure.matchUps)),
    );
    const dual = duals.find((matchUp: any) => matchUp.tieMatchUps?.some((line: any) => line.matchUpId === lineId));
    // CONTROL: the dual stores its own tieFormat (copied on at its first line), which now declares a reported score
    expect(!!dual.tieFormat).toEqual(true);
    dual.tieFormat.scoreSource = 'REPORTED';
  }
  if (stray) {
    const lineId = findLine(step.target);
    const duals = record.events.flatMap((event: any) =>
      event.drawDefinitions.flatMap((draw: any) => draw.structures.flatMap((structure: any) => structure.matchUps)),
    );
    const dual = duals.find((matchUp: any) => matchUp.tieMatchUps?.some((line: any) => line.matchUpId === lineId));
    // CONTROL: both sides of the dual hold their line-ups, to which an assignment naming no participant is added
    expect(dual.sides.map((side: any) => !!side.lineUp?.length)).toEqual([true, true]);
    for (const side of dual.sides) {
      const [{ collectionId }] = side.lineUp[0].collectionAssignments;
      side.lineUp.push({ collectionAssignments: [{ collectionId, collectionPosition: 9 }] });
    }
  }
  if (bare) {
    const lineId = findLine(step.target);
    const duals = record.events.flatMap((event: any) =>
      event.drawDefinitions.flatMap((draw: any) => draw.structures.flatMap((structure: any) => structure.matchUps)),
    );
    const dual = duals.find((matchUp: any) => matchUp.tieMatchUps?.some((line: any) => line.matchUpId === lineId));
    const side = dual.sides.find((each: any) => each.sideNumber === 2);
    // CONTROL: side 2 held its line-up, which is taken away
    expect(!!side.lineUp?.length).toEqual(true);
    delete side.lineUp;
  }
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
  const matchUpId = step.dual ? findDual(step.target).matchUpId : findLine(step.target);
  setOutcomePipeline(mode);
  v1Writes.count = 0;
  if (!realClock) setClock('2026-10-25T00:01:00.000Z');
  const { stack: _stack, ...result } = tournamentEngine.setMatchUpStatus({
    outcome: stepOutcome(step),
    ...step.flags,
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
    "SINGLE_ELIMINATION: a dual's first line: v1 copies the line-ups and tieFormat onto the dual, now in progress",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [],
      step: { target: R1(1, 0), winningSide: 1 },
    },
  ],
  [
    "COMPASS: an East dual's first line",
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      setup: [],
      step: { target: R1(2, 3, 'East'), winningSide: 2 },
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
  [
    'a line that decides its dual (5-0 at a value goal of 5): the dual is directed, carrying its line-up on',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [0, 1, 2, 3].map((line) => ({ target: R1(1, line), winningSide: 1 as const })),
      step: { target: R1(1, 4), winningSide: 1 },
    },
  ],
  [
    'a line that decides a second-position dual for side 2: the winner is side 2 of the next dual',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [0, 1, 2, 3].map((line) => ({ target: R1(2, line), winningSide: 2 as const })),
      step: { target: R1(2, 5), winningSide: 2 },
    },
  ],
  [
    'a line that decides a dual 5-4 after the other side led',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [
        ...[0, 1, 2, 3].map((line) => ({ target: R1(1, line), winningSide: 2 as const })),
        ...[4, 5, 6, 7].map((line) => ({ target: R1(1, line), winningSide: 1 as const })),
      ],
      step: { target: R1(1, 8), winningSide: 1 },
    },
  ],
  [
    'a line that decides the final: no dual follows, nothing is carried',
    {
      drawProfile: { drawSize: 2, drawType: SINGLE_ELIMINATION },
      setup: [0, 1, 2, 3].map((line) => ({ target: R1(1, line), winningSide: 1 as const })),
      step: { target: R1(1, 4), winningSide: 1 },
    },
  ],
  [
    'COMPASS: a line that decides an East dual for side 1: its loser goes West, carrying its line-up',
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      setup: [0, 1, 2, 3].map((line) => ({ target: R1(2, line, 'East'), winningSide: 1 as const })),
      step: { target: R1(2, 4, 'East'), winningSide: 1 },
      loserSeat: { dual: { structureName: 'West', roundNumber: 1, roundPosition: 1 }, sideNumber: 2, carried: true },
    },
  ],
  [
    'COMPASS: a dual decided whose sides hold an assignment naming no participant: the loser carries it, the winner not',
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      setup: [0, 1, 2, 3].map((line) => ({ target: R1(2, line, 'East'), winningSide: 1 as const })),
      step: { target: R1(2, 4, 'East'), winningSide: 1 },
      stray: true,
      loserSeat: { dual: { structureName: 'West', roundNumber: 1, roundPosition: 1 }, sideNumber: 2, carried: true },
    },
  ],
  [
    "COMPASS: a second-round East dual decided: its loser goes to North's first round, on side 2 by roundPosition",
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      setup: [
        ...[3, 4].flatMap((roundPosition) =>
          [0, 1, 2, 3, 4].map((line) => ({ target: R1(roundPosition, line, 'East'), winningSide: 1 as const })),
        ),
        ...[0, 1, 2, 3].map((line) => ({
          target: { structureName: 'East', roundNumber: 2, roundPosition: 2, line },
          winningSide: 1 as const,
        })),
      ],
      step: { target: { structureName: 'East', roundNumber: 2, roundPosition: 2, line: 4 }, winningSide: 1 },
      loserSeat: { dual: { structureName: 'North', roundNumber: 1, roundPosition: 1 }, sideNumber: 2, carried: true },
    },
  ],
  [
    'COMPASS: a line that decides a first-position East dual for side 2: its loser is side 1 in West',
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      setup: [0, 1, 2, 3].map((line) => ({ target: R1(1, line, 'East'), winningSide: 2 as const })),
      step: { target: R1(1, 4, 'East'), winningSide: 2 },
      loserSeat: { dual: { structureName: 'West', roundNumber: 1, roundPosition: 1 }, sideNumber: 1, carried: true },
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION: a line that decides a first-round Main dual: its loser is fed on',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [0, 1, 2, 3].map((line) => ({ target: R1(1, line), winningSide: 1 as const })),
      step: { target: R1(1, 4), winningSide: 1 },
      loserSeat: {
        dual: { structureName: 'Consolation', roundNumber: 1, roundPosition: 1 },
        sideNumber: 1,
        carried: true,
      },
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION: a second-round Main dual decided: a loser who had won is kept out, a BYE in its seat',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [
        ...[1, 2].flatMap((roundPosition) =>
          [0, 1, 2, 3, 4].map((line) => ({ target: R1(roundPosition, line), winningSide: 1 as const })),
        ),
        ...[0, 1, 2, 3].map((line) => ({
          target: { structureName: 'Main', roundNumber: 2, roundPosition: 1, line },
          winningSide: 1 as const,
        })),
      ],
      step: { target: { structureName: 'Main', roundNumber: 2, roundPosition: 1, line: 4 }, winningSide: 1 },
      loserSeat: {
        dual: { structureName: 'Consolation', roundNumber: 2, roundPosition: 1 },
        sideNumber: 1,
        carried: false,
      },
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION: a second-round Main dual decided: a loser who had a BYE is fed on, to side 1',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, participantsCount: 6 },
      setup: [
        ...[0, 1, 2, 3, 4].map((line) => ({ target: R1(2, line), winningSide: 1 as const })),
        ...[0, 1, 2, 3].map((line) => ({
          target: { structureName: 'Main', roundNumber: 2, roundPosition: 1, line },
          winningSide: 2 as const,
        })),
      ],
      step: { target: { structureName: 'Main', roundNumber: 2, roundPosition: 1, line: 4 }, winningSide: 2 },
      loserSeat: {
        dual: { structureName: 'Consolation', roundNumber: 2, roundPosition: 1 },
        sideNumber: 1,
        carried: true,
      },
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION: a decided dual whose loser is seated opposite a BYE: on through it, its line-up both places',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, participantsCount: 7 },
      setup: [0, 1, 2, 3].map((line) => ({ target: R1(2, line), winningSide: 1 as const })),
      step: { target: R1(2, 4), winningSide: 1 },
      loserSeat: {
        dual: { structureName: 'Consolation', roundNumber: 1, roundPosition: 1 },
        sideNumber: 2,
        carried: true,
      },
      beyondSeat: {
        dual: { structureName: 'Consolation', roundNumber: 2, roundPosition: 1 },
        sideNumber: 2,
        carried: true,
      },
    },
  ],
  [
    'a line played on a dual already decided, for the losing side: the dual keeps its winner, 5-1',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [0, 1, 2, 3, 4].map((line) => ({ target: R1(1, line), winningSide: 1 as const })),
      step: { target: R1(1, 5), winningSide: 2 },
      decided: 1,
    },
  ],
  [
    'a line played on a dual already decided for side 2, for side 2: 0-6, nothing directed again',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [0, 1, 2, 3, 4].map((line) => ({ target: R1(2, line), winningSide: 2 as const })),
      step: { target: R1(2, 6), winningSide: 2 },
      decided: 2,
    },
  ],
  [
    'COMPASS: a line played on an East dual already decided, its loser in West: nothing carried again',
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      setup: [0, 1, 2, 3, 4].map((line) => ({ target: R1(2, line, 'East'), winningSide: 1 as const })),
      step: { target: R1(2, 8, 'East'), winningSide: 2 },
      decided: 1,
    },
  ],
  [
    'a line played on a decided dual whose winner has played on: the next dual in progress is left as it is',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [
        ...[1, 2].flatMap((roundPosition) =>
          [0, 1, 2, 3, 4].map((line) => ({ target: R1(roundPosition, line), winningSide: 1 as const })),
        ),
        { target: { structureName: 'Main', roundNumber: 2, roundPosition: 1, line: 0 }, winningSide: 1 as const },
      ],
      step: { target: R1(1, 7), winningSide: 2 },
      decided: 1,
    },
  ],
  [
    'a line that takes a dual walked over at 4-0 to 5-0: the dual, its winner kept, is written as its lines project it',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [0, 1, 2, 3].map((line) => ({ target: R1(1, line), winningSide: 1 as const })),
      step: { target: R1(1, 4), winningSide: 1 },
      dualExit: 'WALKOVER',
      decided: 1,
    },
  ],
  [
    'a line won with no score (a winner alone) on an open dual, 1-1',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1, 0), winningSide: 1 }],
      step: { target: R1(1, 1), winningSide: 2, outcome: 'winner' },
    },
  ],
  [
    "a dual's first line a WALKOVER: the line-ups and tieFormat copied on, the walkover counted for its winner",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [],
      step: { target: R1(2, 0), winningSide: 2, outcome: 'WALKOVER' },
    },
  ],
  [
    'a line DEFAULTED that decides its dual: the dual directed, its line-up carried on',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [0, 1, 2, 3].map((line) => ({ target: R1(1, line), winningSide: 1 as const })),
      step: { target: R1(1, 4), winningSide: 1, outcome: 'DEFAULTED' },
    },
  ],
  [
    'a line RETIRED, its score kept, played on a dual already decided',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [0, 1, 2, 3, 4].map((line) => ({ target: R1(1, line), winningSide: 1 as const })),
      step: { target: R1(1, 5), winningSide: 2, outcome: 'RETIRED' },
      decided: 1,
    },
  ],
  [
    'COMPASS: a line WALKOVER that decides an East dual: its loser goes West carrying its line-up, no exit carried',
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      setup: [0, 1, 2, 3].map((line) => ({ target: R1(2, line, 'East'), winningSide: 1 as const })),
      step: { target: R1(2, 4, 'East'), winningSide: 1, outcome: 'WALKOVER' },
      loserSeat: { dual: { structureName: 'West', roundNumber: 1, roundPosition: 1 }, sideNumber: 2, carried: true },
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION: a winner alone deciding a first-round Main dual: its loser is fed on',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [0, 1, 2, 3].map((line) => ({ target: R1(1, line), winningSide: 1 as const })),
      step: { target: R1(1, 4), winningSide: 1, outcome: 'winner' },
      loserSeat: {
        dual: { structureName: 'Consolation', roundNumber: 1, roundPosition: 1 },
        sideNumber: 1,
        carried: true,
      },
    },
  ],
  [
    "a dual's first line a DOUBLE_WALKOVER: the dual in progress, the line counted for neither side",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [],
      step: { target: R1(1, 0), winningSide: 1, outcome: 'DOUBLE_WALKOVER' },
    },
  ],
  [
    'a line DOUBLE_DEFAULT on an open dual, 1-0',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1, 0), winningSide: 1 }],
      step: { target: R1(1, 1), winningSide: 1, outcome: 'DOUBLE_DEFAULT' },
    },
  ],
  [
    'a line DOUBLE_WALKOVER played on a dual already decided: the dual keeps its winner',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [0, 1, 2, 3, 4].map((line) => ({ target: R1(1, line), winningSide: 1 as const })),
      step: { target: R1(1, 5), winningSide: 1, outcome: 'DOUBLE_WALKOVER' },
      decided: 1,
    },
  ],
  [
    'COMPASS: a line DOUBLE_DEFAULT in an East dual whose loser would go West: nothing produced or carried',
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      setup: [{ target: R1(2, 0, 'East'), winningSide: 2 }],
      step: { target: R1(2, 1, 'East'), winningSide: 1, outcome: 'DOUBLE_DEFAULT' },
    },
  ],
  [
    "a dual's own call given a winner alone, the dual untouched: its sides' line-ups written, the winner directed",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [],
      step: { target: R1(1, 0), winningSide: 1, outcome: 'winner', dual: true },
    },
  ],
  [
    "a dual's own call given a winner, scored, after a line won by the other side",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(2, 0), winningSide: 1 }],
      step: { target: R1(2, 1), winningSide: 2, dual: true },
    },
  ],
  [
    "a dual's own WALKOVER with no loser link",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [],
      step: { target: R1(1, 0), winningSide: 2, outcome: 'WALKOVER', dual: true },
    },
  ],
  [
    "a dual's own call in the final: nothing directed",
    {
      drawProfile: { drawSize: 2, drawType: SINGLE_ELIMINATION },
      setup: [],
      step: { target: R1(1, 0), winningSide: 1, outcome: 'winner', dual: true },
    },
  ],
  [
    "COMPASS: an East dual's own call: its loser's assignment writes the team's draw line-up on its West seat",
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      setup: [],
      step: { target: R1(2, 0, 'East'), winningSide: 1, outcome: 'winner', dual: true },
      loserSeat: { dual: { structureName: 'West', roundNumber: 1, roundPosition: 1 }, sideNumber: 2, carried: true },
    },
  ],
  [
    "FIRST_MATCH_LOSER_CONSOLATION: a dual's own call whose loser is seated opposite a BYE: both duals take its line-up",
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, participantsCount: 7 },
      setup: [],
      step: { target: R1(2, 0), winningSide: 1, outcome: 'winner', dual: true },
      loserSeat: {
        dual: { structureName: 'Consolation', roundNumber: 1, roundPosition: 1 },
        sideNumber: 2,
        carried: true,
      },
      beyondSeat: {
        dual: { structureName: 'Consolation', roundNumber: 2, roundPosition: 1 },
        sideNumber: 2,
        carried: true,
      },
    },
  ],
  [
    "a dual's own DOUBLE_WALKOVER: the WALKOVER it produces waits in the next dual",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [],
      step: { target: R1(1, 0), winningSide: 1, outcome: 'DOUBLE_WALKOVER', dual: true },
    },
  ],
  [
    "a dual's own DOUBLE_DEFAULT under propagateExitStatus: the DEFAULTED it produces waits in the next dual",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [],
      step: {
        target: R1(1, 0),
        winningSide: 1,
        outcome: 'DOUBLE_DEFAULT',
        dual: true,
        flags: { propagateExitStatus: true },
      },
    },
  ],
  [
    "a dual's own DOUBLE_WALKOVER beside a decided dual: the WALKOVER it produces is awarded to that dual's winner",
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: [0, 1, 2, 3, 4].map((line) => ({ target: R1(2, line), winningSide: 1 as const })),
      step: { target: R1(1, 0), winningSide: 1, outcome: 'DOUBLE_WALKOVER', dual: true },
    },
  ],
  [
    "a dual's own DOUBLE_WALKOVER in a draw of 7: the next dual's other side goes on from a BYE",
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION, participantsCount: 7 },
      setup: [],
      step: { target: R1(2, 0), winningSide: 1, outcome: 'DOUBLE_WALKOVER', dual: true },
    },
  ],
  [
    "FIRST_MATCH_LOSER_CONSOLATION: a dual's own DOUBLE_WALKOVER: BYEs on the consolation seats its loser link feeds",
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [],
      step: {
        target: R1(1, 0),
        winningSide: 1,
        outcome: 'DOUBLE_WALKOVER',
        dual: true,
        flags: { propagateExitStatus: true },
      },
    },
  ],
  [
    "COMPASS: an East dual's own DOUBLE_DEFAULT: BYEs on the West seats its loser link feeds",
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      setup: [],
      step: { target: R1(1, 0, 'East'), winningSide: 1, outcome: 'DOUBLE_DEFAULT', dual: true },
    },
  ],
  [
    "FIRST_MATCH_LOSER_CONSOLATION: a dual's own WALKOVER carried across its loser link: the dual it reaches is written",
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [],
      step: {
        target: R1(1, 0),
        winningSide: 1,
        outcome: 'WALKOVER',
        dual: true,
        flags: { propagateExitStatus: true },
      },
      loserSeat: {
        dual: { structureName: 'Consolation', roundNumber: 1, roundPosition: 1 },
        sideNumber: 1,
        carried: true,
      },
    },
  ],
  [
    "FIRST_MATCH_LOSER_CONSOLATION: a dual's own DEFAULTED carried across its loser link, the other side's",
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [],
      step: {
        target: R1(1, 1),
        winningSide: 2,
        outcome: 'DEFAULTED',
        dual: true,
        flags: { propagateExitStatus: true },
      },
    },
  ],
];

describe('under v2, a TEAM line is v2s, deciding its dual or not, and leaves exactly what v1 leaves', () => {
  it.each(OWNED)('%s', (_label, scenario) => {
    for (const realClock of [false, true]) {
      const prepared = prepare(scenario, realClock);
      const { decided } = scenario;
      const seats = [scenario.loserSeat, scenario.beyondSeat].filter((seat) => !!seat);
      // CONTROL: the loser's seat holds no line-up before the step, and holds one after v1's exactly where v1 carries it
      for (const seat of seats) expect(heldLineUp(seat)).toBeUndefined();
      if (decided) expect(dualWinner(scenario.step.target)).toEqual(decided);
      const v1 = play(OUTCOME_PIPELINE_V1, scenario, prepared, realClock);
      for (const seat of seats) expect(!!heldLineUp(seat)?.length).toEqual(seat.carried);
      if (decided) expect(dualWinner(scenario.step.target)).toEqual(decided);
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
    "COMPASS: a decided dual whose losing side holds no line-up: the loser's assignment writes its seat's sides",
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      setup: [0, 1, 2, 3].map((line) => ({ target: R1(2, line, 'East'), winningSide: 1 as const })),
      step: { target: R1(2, 4, 'East'), winningSide: 1 },
      bare: true,
    },
  ],
  [
    'a line played on a dual decided by its own exit: v1 projects the dual from its lines, un-deciding it (line-score)',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1, 0), winningSide: 1 }],
      step: { target: R1(1, 1), winningSide: 2 },
      dualExit: 'DEFAULTED',
    },
  ],
  [
    "a line DEFAULTED under a scoring policy's processCodes: v1 writes the codes on the line (exitReason)",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      policyDefinitions: POLICY_SCORING_DEFAULT,
      setup: [{ target: R1(1, 0), winningSide: 1 }],
      step: { target: R1(1, 1), winningSide: 2, outcome: 'DEFAULTED' },
      abstains: 'exit',
    },
  ],
  [
    "a dual's own DOUBLE_WALKOVER once a line is played: v1's (exitReason: a double exit over a dual in progress)",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1, 0), winningSide: 1 }],
      step: { target: R1(1, 0), winningSide: 1, outcome: 'DOUBLE_WALKOVER', dual: true },
      abstains: 'exit',
    },
  ],
  [
    "a dual's own call clearing a dual still to be played: v1's (route clear-score)",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [],
      step: { target: R1(1, 0), winningSide: 1, outcome: 'cleared', dual: true },
    },
  ],
  [
    "a dual's own call that disables auto-calc: v1 writes disableAutoCalc",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [],
      step: { target: R1(1, 0), winningSide: 1, outcome: 'winner', dual: true, flags: { disableAutoCalc: true } },
    },
  ],
  [
    "a dual's own call that enables auto-calc: v1 projects the winner from the lines",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [],
      autoCalcOff: true,
      setupAfter: [0, 1, 2, 3, 4].map((line) => ({ target: R1(1, line), winningSide: 1 as const })),
      step: { target: R1(1, 0), winningSide: 1, outcome: 'winner', dual: true, flags: { enableAutoCalc: true } },
    },
  ],
  [
    "COMPASS: an East dual's own WALKOVER carried across its loser link and on past the West dual it reaches: v1's",
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      setup: [],
      step: {
        target: R1(1, 0, 'East'),
        winningSide: 1,
        outcome: 'WALKOVER',
        dual: true,
        flags: { propagateExitStatus: true },
      },
    },
  ],
  [
    "FIRST_MATCH_LOSER_CONSOLATION: a dual's own WALKOVER carried to a seat opposite a BYE, on through it: v1's",
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, participantsCount: 7 },
      setup: [],
      step: {
        target: R1(2, 0),
        winningSide: 1,
        outcome: 'WALKOVER',
        dual: true,
        flags: { propagateExitStatus: true },
      },
    },
  ],
  [
    "a dual's own call on a dual already decided: v1's",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [0, 1, 2, 3, 4].map((line) => ({ target: R1(1, line), winningSide: 1 as const })),
      step: { target: R1(1, 0), winningSide: 1, outcome: 'winner', dual: true },
    },
  ],
  [
    "a dual's own call given a winner after its own DOUBLE_WALKOVER: v1's (a double exit given a winner)",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [],
      dualExit: 'DOUBLE_WALKOVER',
      step: { target: R1(1, 0), winningSide: 1, outcome: 'winner', dual: true },
    },
  ],
  [
    "a dual's own call in a round robin: its group's tally",
    {
      drawProfile: { drawSize: 4, drawType: ROUND_ROBIN },
      setup: [],
      step: { target: R1(0, 0, 'Group 1'), winningSide: 1, outcome: 'winner', dual: true },
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
  [
    'a line of a dual whose tieFormat declares its score REPORTED: v1 returns before any tally',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1, 0), winningSide: 1 }],
      step: { target: R1(1, 1), winningSide: 2 },
      reported: true,
    },
  ],
  [
    "a line of a dual whose auto-calc is off: v1 leaves the dual's score to be entered",
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1, 0), winningSide: 1 }],
      step: { target: R1(1, 1), winningSide: 2 },
      autoCalcOff: true,
    },
  ],
];

describe('still v1s', () => {
  it.each(KEPT)('%s', (_label, scenario) => {
    const deferred = () => getDifferentialTally()[`shadow:abstain:${scenario.abstains ?? 'team'}`]?.deferred ?? 0;
    const prepared = prepare(scenario, false);
    const before = deferred();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario, prepared);
    expect(compared.result.success).toEqual(true);
    expect(deferred() - before).toEqual(1);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario, prepared);
    expect(v2.v1Writes).toBeGreaterThanOrEqual(1);
  });
});
