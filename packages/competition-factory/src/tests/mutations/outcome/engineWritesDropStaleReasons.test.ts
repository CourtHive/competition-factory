import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { OutcomePipelineDivergence } from '@Mutate/matchUps/outcome/differential';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants
import { MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS } from '@Constants/topicConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';
import {
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';
import {
  ABANDONED,
  BYE,
  CANCELLED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  INCOMPLETE,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * AN ENGINE WRITE KEEPS ONLY THE REASONS THAT STILL DESCRIBE THE RESULT IT LEAVES.
 *
 * A call's own matchUp keeps the reasons that still describe its result (`clearedStatusReasons.test.ts`). The same
 * rule holds for every other matchUp a write touches: a produced exit withdrawn when its source is corrected or
 * cleared, an exit collapsed to a BYE, a result removed with a position, a draw reset. Each row below left the
 * reasons of the result it undid on a matchUp that no longer holds it (a `TO_BE_PLAYED` or a `BYE` carrying a
 * walkover's `W1`). The check is independent of the engine: after every step, every matchUp's reasons are described
 * by its status and winner, a side reason naming a side that exited and a match reason on a status that belongs to
 * the match. A BYE standing over an exit its provenance still records may keep that exit's reason. v1 and v2 leave the
 * same record and raise the same notices, and `differential` finds nothing to raise.
 */

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

type Outcome = Record<string, unknown>;
type Step =
  | { at: string; outcome: Outcome }
  | { removeWithBye: [string, number] }
  | { swap: [string, number, number] }
  | { reset: true };
type Row = {
  drawType: string;
  drawSize: number;
  participantsCount: number;
  nonRandom: number;
  propagateExitStatus?: boolean;
  allowChangePropagation?: boolean;
  steps: Step[];
  /** the matchUp the last step moves off the result its reasons were given for, and the status it then holds */
  then: [string, string];
  /** the side reasons that matchUp still holds, where the status it is left with takes one */
  kept?: Record<number, string>;
};

const TOPICS = [MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION, MODIFY_POSITION_ASSIGNMENTS];
const REASON_STATUSES = [
  ABANDONED,
  CANCELLED,
  INCOMPLETE,
  DEFAULTED,
  RETIRED,
  WALKOVER,
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
];
const MATCH_STATUSES = [ABANDONED, CANCELLED, INCOMPLETE];
const EXITS = [DEFAULTED, RETIRED, WALKOVER, DOUBLE_WALKOVER, DOUBLE_DEFAULT];
const blank = { scoreStringSide1: '', scoreStringSide2: '' };
const won = (winningSide: 1 | 2) => ({
  winningSide,
  score: { sets: [{ setNumber: 1, side1Score: winningSide === 1 ? 6 : 2, side2Score: winningSide === 1 ? 2 : 6 }] },
});

const ROWS: [string, Row][] = [
  [
    'a produced walkover withdrawn when its source is corrected to a played win',
    {
      drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
      drawSize: 8,
      participantsCount: 7,
      nonRandom: 49,
      propagateExitStatus: true,
      steps: [
        { at: 'Main|1|4', outcome: { matchUpStatus: WALKOVER, winningSide: 2, sideStatusCodes: { 1: 'W1' } } },
        { at: 'Main|1|4', outcome: won(1) },
      ],
      then: ['Consolation|1|2', TO_BE_PLAYED],
    },
  ],
  [
    'a produced walkover withdrawn when its source is cleared with the explicit clear',
    {
      drawType: FIRST_ROUND_LOSER_CONSOLATION,
      drawSize: 32,
      participantsCount: 32,
      nonRandom: 482,
      propagateExitStatus: true,
      steps: [
        { at: 'Main|1|11', outcome: { matchUpStatus: WALKOVER, winningSide: 2, sideStatusCodes: { 1: 'W1' } } },
        { at: 'Main|1|11', outcome: { matchUpStatus: TO_BE_PLAYED, score: blank, clearStatusCodes: true } },
      ],
      then: ['Consolation|1|6', TO_BE_PLAYED],
    },
  ],
  [
    'a produced walkover withdrawn when its source is cleared with no reason',
    {
      drawType: FIRST_ROUND_LOSER_CONSOLATION,
      drawSize: 32,
      participantsCount: 32,
      nonRandom: 482,
      propagateExitStatus: true,
      steps: [
        { at: 'Main|1|11', outcome: { matchUpStatus: WALKOVER, winningSide: 2, sideStatusCodes: { 1: 'W1' } } },
        { at: 'Main|1|11', outcome: { matchUpStatus: TO_BE_PLAYED, score: blank } },
      ],
      then: ['Consolation|1|6', TO_BE_PLAYED],
    },
  ],
  [
    'a produced walkover collapsed to a BYE when its source becomes a double default',
    {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      drawSize: 32,
      participantsCount: 30,
      nonRandom: 6,
      propagateExitStatus: true,
      steps: [
        { at: 'Main|1|5', outcome: { matchUpStatus: WALKOVER, winningSide: 1, sideStatusCodes: { 2: 'W1' } } },
        { at: 'Main|1|5', outcome: { matchUpStatus: DOUBLE_DEFAULT, sideStatusCodes: { 1: 'DM', 2: 'DM' } } },
      ],
      then: ['Consolation|1|3', BYE],
    },
  ],
  [
    'a produced default collapsed to a BYE when its source becomes a double default',
    {
      drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
      drawSize: 8,
      participantsCount: 4,
      nonRandom: 57,
      propagateExitStatus: true,
      steps: [
        { at: 'Main|2|2', outcome: { matchUpStatus: DEFAULTED, winningSide: 1, sideStatusCodes: { 2: 'DM' } } },
        { at: 'Main|2|2', outcome: { matchUpStatus: DOUBLE_DEFAULT, sideStatusCodes: { 1: 'DM', 2: 'DM' } } },
      ],
      then: ['Consolation|3|1', BYE],
    },
  ],
  [
    'a produced walkover removed with the position it was carried to',
    {
      drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
      drawSize: 8,
      participantsCount: 5,
      nonRandom: 252,
      propagateExitStatus: true,
      steps: [
        { at: 'Main|1|2', outcome: { matchUpStatus: WALKOVER, winningSide: 2, sideStatusCodes: { 1: 'W1' } } },
        { removeWithBye: ['Consolation', 3] },
      ],
      then: ['Consolation|2|1', TO_BE_PLAYED],
    },
  ],
  [
    'a produced walkover re-awarded to the other side when a swap withdraws its stale origin',
    {
      drawType: DOUBLE_ELIMINATION,
      drawSize: 8,
      participantsCount: 4,
      nonRandom: 10853,
      propagateExitStatus: true,
      steps: [
        { at: 'Main|2|2', outcome: { matchUpStatus: WALKOVER, winningSide: 1, sideStatusCodes: { 2: 'W1' } } },
        { swap: ['Main', 1, 8] },
        { at: 'Main|2|1', outcome: { matchUpStatus: WALKOVER, winningSide: 1, sideStatusCodes: { 2: 'W1' } } },
      ],
      then: ['Backdraw|3|1', WALKOVER],
      kept: { 1: 'W1' },
    },
  ],
  ...(
    [
      ['a WALKOVER', { matchUpStatus: WALKOVER, winningSide: 1, sideStatusCodes: { 2: 'W1' } }],
      ['a DEFAULTED', { matchUpStatus: DEFAULTED, winningSide: 2, sideStatusCodes: { 1: 'DM' } }],
      ['a RETIRED', { matchUpStatus: RETIRED, winningSide: 1, sideStatusCodes: { 2: 'RJ' }, score: won(1).score }],
      ['a DOUBLE_WALKOVER', { matchUpStatus: DOUBLE_WALKOVER, sideStatusCodes: { 1: 'WOWO', 2: 'WOWO' } }],
      ['a DOUBLE_DEFAULT', { matchUpStatus: DOUBLE_DEFAULT, sideStatusCodes: { 1: 'DM', 2: 'DM' } }],
      ['an ABANDONED', { matchUpStatus: ABANDONED, matchUpStatusCode: 'OA' }],
      ['a CANCELLED', { matchUpStatus: CANCELLED, matchUpStatusCode: 'OA' }],
    ] as [string, Outcome][]
  ).map(
    ([label, outcome]) =>
      [
        `${label} with its reason, then the draw reset`,
        {
          drawType: SINGLE_ELIMINATION,
          drawSize: 8,
          participantsCount: 8,
          nonRandom: 1,
          steps: [{ at: 'Main|1|1', outcome }, { reset: true }],
          then: ['Main|1|1', TO_BE_PLAYED],
        },
      ] as [string, Row],
  ),
];

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function drawMatchUps() {
  const inContext = tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps;
  const stored = new Map(
    tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: false }).matchUps.map((m: any) => [m.matchUpId, m]),
  );
  return inContext.map((m: any) => ({ key: key(m), matchUpId: m.matchUpId, stored: stored.get(m.matchUpId) as any }));
}

/** the reasons a stored matchUp holds that its status and winner do not describe, by the rule stated above */
function undescribed({ matchUpStatus, winningSide, sideStatusCodes, matchUpStatusCode, sideExitProvenance }: any) {
  const stale: string[] = [];
  const held = Object.keys(sideStatusCodes ?? {}).map(Number);
  const sides =
    matchUpStatus === BYE ? held.filter((side) => !EXITS.includes(sideExitProvenance?.[side]?.matchUpStatus)) : held;
  if (!REASON_STATUSES.includes(matchUpStatus)) {
    if (matchUpStatusCode) stale.push(`matchUpStatusCode on ${matchUpStatus}`);
    if (sides.length) stale.push(`sideStatusCodes on ${matchUpStatus}`);
    return stale;
  }
  if (MATCH_STATUSES.includes(matchUpStatus)) {
    if (sides.length) stale.push(`sideStatusCodes on ${matchUpStatus}`);
    return stale;
  }
  if (matchUpStatusCode) stale.push(`matchUpStatusCode on ${matchUpStatus}`);
  let exited: number[] = [];
  if ([DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus)) exited = [1, 2];
  else if (winningSide) exited = [3 - winningSide];
  for (const side of sides) if (!exited.includes(side)) stale.push(`a side ${side} reason on ${matchUpStatus}`);
  return stale;
}

function play(mode: OutcomePipelineMode, row: Row) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock('2026-11-26T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawType: row.drawType, drawSize: row.drawSize, participantsCount: row.participantsCount, drawId: 'd' },
    ],
    nonRandom: row.nonRandom,
    setState: true,
  });
  deleteNotices();
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      TOPICS.map((topic) => [
        topic,
        (payloads: any[]) => payloads.forEach((p) => notices.push(`${topic} ${canonicalJson(p)}`)),
      ]),
    ),
  });
  setOutcomePipeline(mode);
  const results: any[] = [];
  const undescribedAfter: string[][] = [];
  let divergence: string | undefined;
  try {
    row.steps.forEach((step, i) => {
      setClock(`2026-11-26T00:0${i + 1}:00.000Z`);
      const matchUps = drawMatchUps();
      let result: any;
      if ('at' in step) {
        const target = matchUps.find((m) => m.key === step.at);
        result = tournamentEngine.setMatchUpStatus({
          allowChangePropagation: row.allowChangePropagation,
          propagateExitStatus: row.propagateExitStatus,
          matchUpId: target?.matchUpId,
          outcome: step.outcome,
          drawId: 'd',
        });
      } else if ('removeWithBye' in step) {
        const [structureName, drawPosition] = step.removeWithBye;
        const { structures } = tournamentEngine.getEvent({ drawId: 'd' }).drawDefinition;
        const { structureId } = structures.find((structure: any) => structure.structureName === structureName);
        result = tournamentEngine.removeDrawPositionAssignment({
          replaceWithBye: true,
          drawId: 'd',
          drawPosition,
          structureId,
        });
      } else if ('swap' in step) {
        const [structureName, ...drawPositions] = step.swap;
        const { structures } = tournamentEngine.getEvent({ drawId: 'd' }).drawDefinition;
        const { structureId } = structures.find((structure: any) => structure.structureName === structureName);
        result = tournamentEngine.swapDrawPositionAssignments({ drawId: 'd', drawPositions, structureId });
      } else result = tournamentEngine.resetDrawDefinition({ drawId: 'd' });
      results.push(result);
      undescribedAfter.push(
        drawMatchUps().flatMap(({ key, stored }) => undescribed(stored).map((stale) => `${key}: ${stale}`)),
      );
    });
  } catch (error) {
    if (!(error instanceof OutcomePipelineDivergence)) throw error;
    divergence = error.message;
  }
  const last = drawMatchUps().find((m) => m.key === row.then[0])?.stored;
  return {
    record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
    thenMatchUpId: drawMatchUps().find((m) => m.key === row.then[0])?.matchUpId,
    results: results.map(({ stack: _stack, ...result }: any) => result),
    then: last && {
      matchUpStatus: last.matchUpStatus,
      sideStatusCodes: last.sideStatusCodes,
      matchUpStatusCode: last.matchUpStatusCode,
    },
    undescribedAfter,
    divergence,
    notices,
  };
}

describe('an engine write drops the reasons its result no longer has', () => {
  it.each(ROWS)('%s', (_label, row) => {
    const v1 = play(OUTCOME_PIPELINE_V1, row);
    const v2 = play(OUTCOME_PIPELINE_V2, row);
    const differential = play(OUTCOME_PIPELINE_DIFFERENTIAL, row);

    // CONTROL: every step is accepted, and the last moves the named matchUp off the result its reasons were for
    expect(v1.results.map((result: any) => result.success)).toEqual(row.steps.map(() => true));
    expect(v1.then?.matchUpStatus).toEqual(row.then[1]);

    expect(v1.then?.sideStatusCodes).toEqual(row.kept);
    expect(v1.then?.matchUpStatusCode).toBeUndefined();
    expect(v1.undescribedAfter).toEqual(row.steps.map(() => []));

    expect(v2.results).toEqual(v1.results);
    expect(v2.undescribedAfter).toEqual(v1.undescribedAfter);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
    expect(differential.divergence).toBeUndefined();
    expect(differential.record).toEqual(v1.record);
  });
});

/**
 * A DECIDED MATCHUP RE-SORTED UNDER ITS WINNER KEEPS ITS REASON ON THE SIDE THAT EXITED.
 *
 * Correcting a consolation quarterfinal with `allowChangePropagation` puts the other participant on the path, and the
 * decided semifinal they reach is re-sorted: `[3, 4]` becomes `[4, 6]`, so the participant on drawPosition 4 moves to
 * side 1. The winner, the score and the provenance follow the re-sort, and so does the reason: it stays with the side
 * that exited. Where the participant replaced on the path is the one who exited (the last row), the reason goes to the
 * participant who now holds that exit, as the result itself does. Each row is also run without its reason: the two
 * records differ only in the reason.
 */
/** a best-of-three played win, as the draw's format scores it */
const played = (winningSide: 1 | 2) => ({
  winningSide,
  score: {
    sets: [1, 2].map((setNumber) => ({
      setNumber,
      side1Score: winningSide === 1 ? 6 : 2,
      side2Score: winningSide === 1 ? 2 : 6,
      winningSide,
    })),
  },
});
const RESORT_STEPS: Step[] = [
  { at: 'Main|1|1', outcome: played(2) },
  { at: 'Main|1|2', outcome: played(1) },
  { at: 'Main|1|3', outcome: played(2) },
  { at: 'Main|1|4', outcome: played(1) },
  { at: 'Main|2|1', outcome: played(2) },
  { at: 'Main|2|2', outcome: played(1) },
  { at: 'Consolation|1|1', outcome: played(1) },
  { at: 'Consolation|1|2', outcome: played(1) },
  { at: 'Consolation|2|1', outcome: played(2) },
  { at: 'Consolation|2|2', outcome: played(1) },
];
const resortRow = (exit: Outcome, then: [string, string], kept: Record<number, string>): Row => ({
  drawType: FEED_IN_CHAMPIONSHIP,
  drawSize: 8,
  participantsCount: 8,
  nonRandom: 1005,
  allowChangePropagation: true,
  steps: [...RESORT_STEPS, { at: 'Consolation|3|1', outcome: exit }, { at: 'Consolation|2|2', outcome: played(2) }],
  then,
  kept,
});
const retired = (winningSide: 1 | 2) => ({
  winningSide,
  score: {
    sets: [
      { setNumber: 1, side1Score: winningSide === 1 ? 6 : 2, side2Score: winningSide === 1 ? 2 : 6, winningSide },
      { setNumber: 2, side1Score: winningSide === 1 ? 2 : 1, side2Score: winningSide === 1 ? 1 : 2 },
    ],
  },
});
const RESORT_ROWS: [string, Row][] = [
  [
    'a walkover whose walked-over side moves to side 1',
    resortRow(
      { matchUpStatus: WALKOVER, winningSide: 1, sideStatusCodes: { 2: 'W1' } },
      ['Consolation|3|1', WALKOVER],
      {
        1: 'W1',
      },
    ),
  ],
  [
    'a retirement with a score whose retiring side moves to side 1',
    resortRow({ matchUpStatus: RETIRED, ...retired(1), sideStatusCodes: { 2: 'RJ' } }, ['Consolation|3|1', RETIRED], {
      1: 'RJ',
    }),
  ],
  [
    'a retirement by the participant the correction replaces',
    resortRow({ matchUpStatus: RETIRED, ...retired(2), sideStatusCodes: { 1: 'RJ' } }, ['Consolation|3|1', RETIRED], {
      2: 'RJ',
    }),
  ],
];

const withoutReasons = (row: Row): Row => ({
  ...row,
  steps: row.steps.map((step) => {
    if (!('at' in step)) return step;
    const { sideStatusCodes: _reasons, ...outcome } = step.outcome;
    return { ...step, outcome };
  }),
});

/** the record with one matchUp's side reasons removed */
function recordWithoutReasons(record: string, matchUpId?: string) {
  const strip = (value: any) => {
    if (Array.isArray(value)) value.forEach(strip);
    else if (value && typeof value === 'object') {
      if (value.matchUpId === matchUpId) delete value.sideStatusCodes;
      Object.values(value).forEach(strip);
    }
  };
  const parsed = JSON.parse(record);
  strip(parsed);
  return canonicalJson(parsed);
}

describe('a re-sort under the winner keeps the reason on the side that exited', () => {
  it.each(RESORT_ROWS)('%s', (_label, row) => {
    const v1 = play(OUTCOME_PIPELINE_V1, row);
    const v2 = play(OUTCOME_PIPELINE_V2, row);
    const differential = play(OUTCOME_PIPELINE_DIFFERENTIAL, row);
    const bare = play(OUTCOME_PIPELINE_V1, withoutReasons(row));

    expect(v1.results.map((result: any) => result.success)).toEqual(row.steps.map(() => true));
    expect(v1.then?.matchUpStatus).toEqual(row.then[1]);

    // the reason is on the side that exited, under the code it was given
    expect(v1.then?.sideStatusCodes).toEqual(row.kept);
    expect(v1.undescribedAfter).toEqual(row.steps.map(() => []));
    // ...and nothing else in the record depends on it
    expect(bare.then?.sideStatusCodes).toBeUndefined();
    expect(recordWithoutReasons(v1.record, v1.thenMatchUpId)).toEqual(bare.record);

    expect(v2.results).toEqual(v1.results);
    expect(v2.undescribedAfter).toEqual(v1.undescribedAfter);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
    expect(differential.divergence).toBeUndefined();
    expect(differential.record).toEqual(v1.record);
  });
});
