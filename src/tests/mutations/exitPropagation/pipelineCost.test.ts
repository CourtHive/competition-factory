import { distribution, takeRecords, beginRun, siteRows, median } from '@Tests/testHarness/exitPropagation/pipelineCost';
import { deepCorrectionScenario, runPath } from '@Tests/testHarness/exitPropagation/correctionDivergence';
import type { CallRecord, Selector, Site } from '@Tests/testHarness/exitPropagation/pipelineCost';
import type { DivergenceConfig } from '@Tests/testHarness/exitPropagation/correctionDivergence';
import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it, vi } from 'vitest';
import fs from 'node:fs';
import {
  MATRIX_EXTENSION_DRAW_TYPES,
  MATRIX_EXTENSION_CELLS,
  MATRIX_DRAW_TYPES,
  TEAM_LINE_CELLS,
  playMatrixCell,
  MATRIX_CELLS,
  cellLabel,
} from '@Tests/testHarness/exitPropagation/matrixCells';

// constants
import { COMPLETED, DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { LUCKY_DRAW, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * WHAT ONE `setMatchUpStatus` ASKS OF THE DRAW, AND WHO ASKS — assessment gap G15.
 *
 * CA, 2026-10-01, on the first cut of the scheduled-exit warning walking the draw twice per score:
 * *"ensure we're not doubling work that is done elsewhere in the pipeline"*, and *"add to our
 * workstream a pass to detect any other similar performance considerations."* This is that pass's
 * instrument. It changes nothing; it counts.
 *
 * Seven functions are replaced with counting wrappers (`pipelineCost.ts`), each call attributed to
 * the two engine frames above it (`PIPELINE_COST_FRAMES=7` names more, to find who is really asking):
 *
 *   getMatchUpsMap                    the draw's matchUps, flat and by structure — a walk
 *   getAllDrawMatchUps, getDrawMatchUps   in context that is a HYDRATION: a deep copy of every
 *                                     matchUp with its sides, participants and targets
 *   structureAssignedDrawPositions    a structure's assignments, filtered four ways
 *   getPositionAssignments            the same assignments, unfiltered
 *   positionTargets                   where a matchUp's winner and loser go
 *   getAllStructureMatchUps           one structure's matchUps — the unit a draw hydration is made of
 *   findDrawMatchUp                   one matchUp; in context it hydrates its whole structure
 *
 * ## What is run
 *
 * - **matrix**: one cell per draw type, all seventeen (`MATRIX_DRAW_TYPES` and the extension), at
 *   drawSize 16 three seats short (a lucky draw one short — three short is unpopulated), played to
 *   exhaustion on the matrix's own schedule. Four arms: a DOUBLE_WALKOVER under the default policy
 *   (a double exit produces a BYE), the same with the policy off (it produces an exit — the arm
 *   `carryExitOnward` and `settleHeldExits` do their work in), and a WALKOVER and a DEFAULTED with
 *   `propagateExitStatus` (`progressExitStatus`'s rules; a default also takes the process-code
 *   path of `modifyMatchUpScore`, which hydrates for itself).
 * - **deep correction**: per draw type and policy, the deep-correction oracle's CORRECTED route —
 *   twelve steps, then the last exit re-scored. The re-score is reported as its own arm, because it
 *   is the one call that unwinds a cascade and replays another.
 * - **TEAM line**: the four TEAM draw types with lineups attached, so lines are scored and the dual
 *   is written through `updateTieMatchUpScore`.
 *
 * ## Inert by default, with a control that is not
 *
 * The census is a measurement, taken when the pipeline changes; it is gated on `PIPELINE_COST=1`
 * and writes its tables to stdout (and its rows to `OUT` as JSON). The control below runs on every
 * `pnpm test`: one small cell, asserting the wrappers see the pipeline and name a caller for every
 * call. An instrument that has silently stopped counting reports the best possible result.
 *
 *   PIPELINE_COST=1 OUT=/tmp/pipeline-cost.json TZ=UTC \
 *     npx vitest run src/tests/mutations/exitPropagation/pipelineCost.test.ts
 */

vi.mock('@Query/matchUps/getMatchUpsMap', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { counted } = await import('@Tests/testHarness/exitPropagation/pipelineCost');
  return { ...actual, getMatchUpsMap: counted('getMatchUpsMap', actual.getMatchUpsMap) };
});

vi.mock('@Query/matchUps/drawMatchUps', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { counted, inContextRequested } = await import('@Tests/testHarness/exitPropagation/pipelineCost');
  return {
    ...actual,
    getAllDrawMatchUps: counted('getAllDrawMatchUps', actual.getAllDrawMatchUps, inContextRequested),
    getDrawMatchUps: counted('getDrawMatchUps', actual.getDrawMatchUps, inContextRequested),
  };
});

vi.mock('@Query/drawDefinition/positionsGetter', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { counted } = await import('@Tests/testHarness/exitPropagation/pipelineCost');
  return {
    ...actual,
    structureAssignedDrawPositions: counted('structureAssignedDrawPositions', actual.structureAssignedDrawPositions),
    getPositionAssignments: counted('getPositionAssignments', actual.getPositionAssignments),
  };
});

vi.mock('@Query/matchUp/positionTargets', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { counted } = await import('@Tests/testHarness/exitPropagation/pipelineCost');
  return { ...actual, positionTargets: counted('positionTargets', actual.positionTargets) };
});

vi.mock('@Query/matchUps/getAllStructureMatchUps', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { counted, inContextRequested } = await import('@Tests/testHarness/exitPropagation/pipelineCost');
  return {
    ...actual,
    getAllStructureMatchUps: counted('getAllStructureMatchUps', actual.getAllStructureMatchUps, inContextRequested),
  };
});

vi.mock('@Acquire/findDrawMatchUp', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { counted, inContextRequested } = await import('@Tests/testHarness/exitPropagation/pipelineCost');
  return { ...actual, findDrawMatchUp: counted('findDrawMatchUp', actual.findDrawMatchUp, inContextRequested) };
});

vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpStatus', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { bracketed } = await import('@Tests/testHarness/exitPropagation/pipelineCost');
  return { ...actual, setMatchUpStatus: bracketed(actual.setMatchUpStatus) };
});

const enabled = process.env.PIPELINE_COST === '1';
const outPath = process.env.OUT;

const ALL_DRAW_TYPES = [...MATRIX_DRAW_TYPES, ...MATRIX_EXTENSION_DRAW_TYPES];
const ALL_CELLS = [...MATRIX_CELLS, ...MATRIX_EXTENSION_CELLS];

/** the matrix's own cell for a draw type: drawSize 16, three short (a lucky draw one short) */
const matrixCell = (drawType: string, exitStatus: string) =>
  ALL_CELLS.find(
    (cell) =>
      cell.participantsCount === (drawType === LUCKY_DRAW ? 15 : 13) &&
      cell.exitStatus === exitStatus &&
      cell.drawType === drawType &&
      cell.propagateExitStatus &&
      cell.drawSize === 16,
  );

// the functions a draw-wide HYDRATION is asked for through, at the top of the stack
const hydration: Selector = (site) =>
  !site.nested && site.inContext && ['getAllDrawMatchUps', 'getDrawMatchUps'].includes(site.fn);
const top =
  (fn: string): Selector =>
  (site) =>
    !site.nested && site.fn === fn;

function playCell(arm: string, cell: (typeof ALL_CELLS)[number], policy?: any): CallRecord[] {
  setSubscriptions({});
  beginRun(arm, cellLabel(cell).replace('matrix ', ''));
  const played = playMatrixCell(cell, `cost-${cell.seed}`, 'exits', policy);
  expect(played, `${cellLabel(cell)} generated`).toEqual(true);
  return takeRecords();
}

// ---------------------------------------------------------------------------------------------
// THE CONTROL — every `pnpm test`
// ---------------------------------------------------------------------------------------------

it('the recorder sees the pipeline: every setMatchUpStatus is bracketed and every call has a caller', () => {
  const cell = MATRIX_CELLS.find(
    (candidate) =>
      candidate.drawType === SINGLE_ELIMINATION &&
      candidate.exitStatus === DOUBLE_WALKOVER &&
      candidate.participantsCount === 7 &&
      candidate.propagateExitStatus,
  );
  expect(cell).toBeDefined();
  const records = playCell('control', cell!);

  // seven participants in a draw of eight: three first-round matchUps, two semifinals of which a
  // double exit takes at least one out of play — at least four results are entered
  expect(records.length).toBeGreaterThanOrEqual(4);
  expect(records.some((record) => record.outcome === DOUBLE_WALKOVER)).toEqual(true);

  for (const record of records) {
    // the pipeline cannot score a matchUp without the draw's matchUps
    expect(distribution([record], (site) => site.fn === 'getMatchUpsMap').total).toBeGreaterThan(0);
    for (const key of record.sites.keys()) expect(key).not.toContain('(no engine frame)');
  }

  // every counted function is reached by something — a wrapper nothing calls is a wrapper on the
  // wrong module, and would read as a function the pipeline never uses
  const reached = new Set(siteRows(records).map((row) => row.fn));
  expect([...reached].sort((a, b) => a.localeCompare(b))).toEqual([
    'findDrawMatchUp',
    'getAllDrawMatchUps',
    'getAllStructureMatchUps',
    'getMatchUpsMap',
    'getPositionAssignments',
    'positionTargets',
    'structureAssignedDrawPositions',
  ]);

  // nothing outside a setMatchUpStatus is recorded: the harness's own reads leave no record behind
  expect(takeRecords()).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// THE CENSUS — PIPELINE_COST=1
// ---------------------------------------------------------------------------------------------

const alternative = (outcome: any): any => {
  switch (outcome?.matchUpStatus) {
    case DOUBLE_WALKOVER:
      return { matchUpStatus: WALKOVER, winningSide: 1 };
    case DOUBLE_DEFAULT:
      return { matchUpStatus: DEFAULTED, winningSide: 1 };
    case WALKOVER:
      return { matchUpStatus: DOUBLE_WALKOVER };
    case DEFAULTED:
      return { matchUpStatus: COMPLETED, winningSide: 2, score: { sets: [{ side1Score: 3, side2Score: 6 }] } };
    default:
      return undefined;
  }
};

const POLICIES = [
  { name: 'BYE', definitions: undefined, doubleExitPropagateBye: undefined },
  { name: 'EXIT', definitions: PRODUCED_EXIT_POLICY, doubleExitPropagateBye: false },
];

/** the corrected route of one deep correction; its last call is the correction itself */
function playCorrection(drawType: string, policy: (typeof POLICIES)[number], cellExit: any, seed: number) {
  const config: DivergenceConfig = {
    doubleExitPropagateBye: policy.doubleExitPropagateBye,
    participantsCount: drawType === LUCKY_DRAW ? 15 : 13,
    propagateExitStatus: true,
    drawSize: 16,
    drawType,
    seed,
  };
  setSubscriptions({});
  // the scenario is found by playing the prefix once; that play is not the route being measured
  beginRun('discard', 'prefix');
  const scenario = deepCorrectionScenario({ config, cellExit, alternative });
  takeRecords();
  if (!scenario) return undefined;

  const label = `${drawType} 16/${config.participantsCount} ${cellExit.matchUpStatus}->${alternative(cellExit).matchUpStatus}`;
  beginRun(`deep ${policy.name}: the route`, label);
  const { refusals } = runPath(config, scenario.corrected, `deep-${seed}`);
  const records = takeRecords();
  const correction = records.at(-1);
  if (correction) correction.arm = `deep ${policy.name}: the correction`;
  return { records, refused: refusals.length };
}

const fixed = (value: number, digits = 1) => value.toFixed(digits);

const HEADLINE: { name: string; selector: Selector }[] = [
  { name: 'draw hydration (top)', selector: hydration },
  { name: 'getMatchUpsMap (top)', selector: top('getMatchUpsMap') },
  { name: 'getAllDrawMatchUps not in context (top)', selector: (s) => top('getAllDrawMatchUps')(s) && !s.inContext },
  { name: 'structureAssignedDrawPositions (top)', selector: top('structureAssignedDrawPositions') },
  { name: 'getPositionAssignments (top)', selector: top('getPositionAssignments') },
  { name: 'positionTargets (top)', selector: top('positionTargets') },
  { name: 'findDrawMatchUp in context (top)', selector: (s) => top('findDrawMatchUp')(s) && s.inContext },
  { name: 'findDrawMatchUp not in context (top)', selector: (s) => top('findDrawMatchUp')(s) && !s.inContext },
  {
    name: 'getAllStructureMatchUps in context (all)',
    selector: (s) => s.fn === 'getAllStructureMatchUps' && s.inContext,
  },
  { name: 'getMatchUpsMap (nested)', selector: (s) => s.nested && s.fn === 'getMatchUpsMap' },
];

function armTable(records: CallRecord[]): string {
  const arms = [...new Set(records.map((record) => record.arm))];
  const lines = [
    '| arm | setMatchUpStatus calls | ms/call median | ms/call worst | hydrations/call median | worst | worst at |',
    '|---|---:|---:|---:|---:|---:|---|',
  ];
  for (const arm of arms) {
    const inArm = records.filter((record) => record.arm === arm);
    const hydrations = distribution(inArm, hydration);
    const ms = inArm.map((record) => record.ms);
    lines.push(
      `| ${arm} | ${inArm.length} | ${fixed(median(ms), 2)} | ${fixed(Math.max(...ms), 2)} | ${hydrations.median} | ${hydrations.worst} | ${hydrations.worstAt} |`,
    );
  }
  return lines.join('\n');
}

function headlineTable(records: CallRecord[]): string {
  const totalMs = records.reduce((sum, record) => sum + record.ms, 0);
  const lines = [
    '| per setMatchUpStatus | total | median | worst | worst at | ms | % of pipeline ms |',
    '|---|---:|---:|---:|---|---:|---:|',
  ];
  for (const { name, selector } of HEADLINE) {
    const d = distribution(records, selector);
    lines.push(
      `| ${name} | ${d.total} | ${d.median} | ${d.worst} | ${d.worstAt} | ${fixed(d.ms)} | ${fixed((100 * d.ms) / totalMs)} |`,
    );
  }
  return lines.join('\n');
}

const siteName = (site: Site) => `${site.fn}${site.inContext ? ' [inContext]' : ''}`;

function siteTable(records: CallRecord[], nested: boolean, limit: number): string {
  const rows = siteRows(records).filter((row) => row.nested === nested);
  const lines = [
    '| function | caller < its caller | total | in N calls | per call when present | worst | worst at | ms |',
    '|---|---|---:|---:|---:|---:|---|---:|',
  ];
  for (const row of rows.slice(0, limit)) {
    lines.push(
      `| ${siteName(row)} | ${row.caller} | ${row.total} | ${row.presentIn} | ${fixed(row.total / row.presentIn, 2)} | ${row.worst} | ${row.worstAt} | ${fixed(row.ms)} |`,
    );
  }
  if (rows.length > limit) lines.push(`| … ${rows.length - limit} more sites | | | | | | | |`);
  return lines.join('\n');
}

it.skipIf(!enabled)(
  'the census: calls per site per setMatchUpStatus, over every draw type',
  () => {
    const records: CallRecord[] = [];
    const skipped: string[] = [];
    let refused = 0;

    for (const drawType of ALL_DRAW_TYPES) {
      const double = matrixCell(drawType, DOUBLE_WALKOVER);
      const single = matrixCell(drawType, WALKOVER);
      const defaulted = matrixCell(drawType, DEFAULTED);
      // CONTROL: the matrix has the cell this census names, for every draw type
      expect(double, `${drawType} DOUBLE_WALKOVER cell`).toBeDefined();
      expect(single, `${drawType} WALKOVER cell`).toBeDefined();
      expect(defaulted, `${drawType} DEFAULTED cell`).toBeDefined();
      records.push(
        ...playCell('matrix BYE: DOUBLE_WALKOVER', double!),
        ...playCell('matrix EXIT: DOUBLE_WALKOVER', double!, PRODUCED_EXIT_POLICY),
        ...playCell('matrix BYE: WALKOVER propagated', single!),
        ...playCell('matrix BYE: DEFAULTED propagated', defaulted!),
      );
    }

    let seed = 7500000;
    for (const policy of POLICIES) {
      for (const drawType of ALL_DRAW_TYPES) {
        for (const cellExit of [{ matchUpStatus: DOUBLE_WALKOVER }, { matchUpStatus: WALKOVER, winningSide: 1 }]) {
          seed += 1;
          const played = playCorrection(drawType, policy, cellExit, seed);
          if (!played) {
            skipped.push(`${policy.name} ${drawType} ${cellExit.matchUpStatus}`);
            continue;
          }
          refused += played.refused;
          records.push(...played.records);
        }
      }
    }

    const teamCells = TEAM_LINE_CELLS.filter(
      (cell) =>
        cell.exitStatus === DOUBLE_WALKOVER &&
        cell.participantsCount === 13 &&
        cell.propagateExitStatus &&
        cell.drawSize === 16,
    );
    // CONTROL: one line-arm cell per TEAM draw type
    expect(teamCells).toHaveLength(4);
    for (const cell of teamCells) records.push(...playCell('TEAM lines: DOUBLE_WALKOVER', cell));

    // CONTROL: the census looked at what it says it looked at
    const arms = new Set(records.map((record) => record.arm));
    expect(arms.size).toEqual(9);
    expect(skipped, 'draw types with no correction to measure').toEqual([]);
    for (const record of records) {
      for (const key of record.sites.keys()) expect(key).not.toContain('(no engine frame)');
    }

    const report = [
      '',
      `# pipeline cost census — ${records.length} setMatchUpStatus calls, ${ALL_DRAW_TYPES.length} draw types, ${refused} refused steps`,
      '',
      '## by arm',
      armTable(records),
      '',
      '## per setMatchUpStatus, all arms',
      headlineTable(records),
      '',
      '## sites asked for by the pipeline (top of stack), most calls first',
      siteTable(records, false, 80),
      '',
      '## sites reached inside another counted call (nested), most calls first',
      siteTable(records, true, 30),
      '',
    ].join('\n');
    process.stdout.write(report);

    if (outPath) {
      const rows = records.map((record) => ({ ...record, sites: Object.fromEntries(record.sites) }));
      fs.writeFileSync(outPath, JSON.stringify(rows));
      fs.writeFileSync(outPath.replace(/\.json$/, '') + '.md', report);
    }
  },
  600_000,
);
