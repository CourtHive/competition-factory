import { generateOutcomeFromScoreString } from '@Generators/simulation/generateOutcomeFromScoreString';
import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { firstPlayable } from '@Tests/testHarness/exitPropagation/driver';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { captureRecord, compareRecord } from '@Tools/recordDiff';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { cloneState } from '@Tools/cloneState';
import { performance } from 'node:perf_hooks';
import { expect, it, vi } from 'vitest';
import fs from 'node:fs';

// constants
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';
import {
  COMPASS,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  QUALIFYING,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

/**
 * THE COST CURVE — outcome v2 executor plan § 6.0, G4 (S0 commits it).
 *
 * What one `setMatchUpStatus` costs as a draw grows, per pipeline mode: every matchUp completed `6-1 6-1`, timing
 * only that call, the method of `Mentat/reports/2026-10-18-completion-cost-profile.md` (which ran in a throwaway
 * worktree). G4's draws: SINGLE_ELIMINATION 32/64/128/256, FEED_IN_CHAMPIONSHIP 64, ROUND_ROBIN 32,
 * DOUBLE_ELIMINATION 64, COMPASS 64 and TEAM SINGLE_ELIMINATION 16 (lines scored, with lineups).
 *
 * - Single process; the modes ALTERNATE within each repeat, after one warm-up, so drift falls on all modes alike.
 *   The first run of a session is ~10% slower (the profile), which is what the warm-up absorbs.
 * - Hydrations per call are counted on the `getAllDrawMatchUps` / `getDrawMatchUps` exports, by a counter with no
 *   stack capture, so the timing is not the cost census's (`pipelineCost.test.ts`, which names every caller).
 * - The full-record copies S1 adds to a `differential` call (a shadow `cloneState`, and the A3.2 comparison:
 *   `captureRecord` then `compareRecord`) are timed on each completed draw, its largest state, beside v1's per-call
 *   cost.
 * - The pipeline is set with `setOutcomePipeline`, never an env var: vitest sets `process.env.MODE` itself, which once
 *   silently profiled v1 as v2 (the profile's first trap).
 *
 * Inert by default (`COST_CURVE=1`; `COST_CURVE_REPEATS`, default 4; `COST_CURVE_ONLY`, a label substring; `OUT` for
 * JSON + markdown). The control below
 * runs on every `pnpm test`: a small draw, asserting the harness times calls and sees hydrations. G4 is run on
 * Button and its table recorded in `Mentat/reports/`.
 *
 *   COST_CURVE=1 OUT=/tmp/cost-curve.json TZ=UTC npx vitest run src/tests/mutations/exitPropagation/costCurve.test.ts
 */

const hydrations = { count: 0 };

vi.mock('@Query/matchUps/drawMatchUps', async (importOriginal) => {
  const actual: any = await importOriginal();
  const counted =
    (original: (...args: any[]) => any) =>
    (...args: any[]) => {
      const params = args[0];
      if (params?.inContext || params?.nextMatchUps || params?.contextFilters) hydrations.count += 1;
      return original(...args);
    };
  return {
    ...actual,
    getAllDrawMatchUps: counted(actual.getAllDrawMatchUps),
    getDrawMatchUps: counted(actual.getDrawMatchUps),
  };
});

/**
 * `qualifying`: a qualifying structure of 16 feeding 4 qualifiers into a main draw of 32, under the progression
 * policy given (the three qualifier flags are `false` by default: a qualifying result then writes nothing into the
 * main draw). Played in three phases: qualifying to completion; then each qualifier-producing matchUp corrected
 * while the main draw is unplayed (a flipped winner replaces the qualifier, a cleared result removes them, the
 * re-entered result places them again); then the main draw.
 */
type Config = {
  /** the progression policy's qualifier flags; none given is the default policy (all three off) */
  qualifying?: { policy?: Record<string, boolean> };
  eventType?: string;
  drawType: string;
  drawSize: number;
  label: string;
};
const AUTO_QUALIFIERS = { autoPlaceQualifiers: true, autoReplaceQualifiers: true, autoRemoveQualifiers: true };
const CONFIGS: Config[] = [
  ...[32, 64, 128, 256].map((drawSize) => ({ label: `SE ${drawSize}`, drawType: SINGLE_ELIMINATION, drawSize })),
  { label: 'FIC 64', drawType: FEED_IN_CHAMPIONSHIP, drawSize: 64 },
  { label: 'RR 32', drawType: ROUND_ROBIN, drawSize: 32 },
  { label: 'DE 64', drawType: DOUBLE_ELIMINATION, drawSize: 64 },
  { label: 'COMPASS 64', drawType: COMPASS, drawSize: 64 },
  { label: 'TEAM SE 16', drawType: SINGLE_ELIMINATION, drawSize: 16, eventType: TEAM },
  // its first-match loser link sends a loser on only from their first match played (not a plain LOSER link)
  { label: 'FMLC 64', drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 64 },
  // setMatchUpStatus across the qualifying link, with the policy's flags off (the default) and on
  { label: 'Q16→SE 32, default', drawType: SINGLE_ELIMINATION, drawSize: 32, qualifying: {} },
  { label: 'Q16→SE 32, auto', drawType: SINGLE_ELIMINATION, drawSize: 32, qualifying: { policy: AUTO_QUALIFIERS } },
];
const MODES = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];
const { outcome: PLAYED } = generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
// the score string is read from the winner's side
const { outcome: FLIPPED } = generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 2 });

type Run = { calls: number; ms: number[]; hydrations: number[]; refused: number };

/** generate the draw and complete it, timing every `setMatchUpStatus`; the harness's own reads are not counted */
function complete(config: Config, mode: string): Run {
  setSubscriptions({});
  const drawId = 'curve';
  const qualifying = config.qualifying && {
    qualifyingProfiles: [
      { roundTarget: 1, structureProfiles: [{ stageSequence: 1, drawSize: 16, qualifyingPositions: 4 }] },
    ],
  };
  const generated: any = mocksEngine.generateTournamentRecord({
    // an empty policy is refused (ERR_INVALID_VALUES), so the default is no progression policy at all
    ...(config.qualifying?.policy
      ? { policyDefinitions: { [POLICY_TYPE_PROGRESSION]: config.qualifying.policy } }
      : {}),
    drawProfiles: [
      {
        ...(config.eventType ? { eventType: config.eventType } : {}),
        ...qualifying,
        drawType: config.drawType,
        drawSize: config.drawSize,
        drawId,
      },
    ],
    nonRandom: 1,
    setState: true,
  });
  // CONTROL: a refused generation sets no state, and would time nothing (or the previous draw)
  expect(generated.error, `${config.label}: generated`).toBeUndefined();
  expect(generated.drawIds).toContain(drawId);
  if (config.eventType === TEAM)
    expect(tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId }).success).toEqual(
      true,
    );
  setOutcomePipeline(mode as any);
  const run: Run = { calls: 0, ms: [], hydrations: [], refused: 0 };
  const enter = (matchUpId: string, outcome: any) => {
    const before = hydrations.count;
    const started = performance.now();
    const result: any = tournamentEngine.setMatchUpStatus({ matchUpId, outcome, drawId });
    run.ms.push(performance.now() - started);
    run.hydrations.push(hydrations.count - before);
    run.calls += 1;
    if (!result.success) run.refused += 1;
    return !!result.success;
  };
  const playOut = (inScope: (matchUp: any) => boolean) => {
    const skip = new Set<string>();
    for (let guard = 0; guard < 5000; guard++) {
      const target = firstPlayable(getDrawMatchUps(drawId).filter(inScope), skip);
      if (!target) break;
      if (!enter(target.matchUpId, PLAYED)) skip.add(target.matchUpId);
    }
  };
  if (config.qualifying) {
    const isQualifying = (matchUp: any) => matchUp.stage === QUALIFYING;
    playOut(isQualifying);
    const qualifyingMatchUps = getDrawMatchUps(drawId).filter(isQualifying);
    const lastRound = Math.max(...qualifyingMatchUps.map((matchUp: any) => matchUp.roundNumber));
    const producers = qualifyingMatchUps.filter((matchUp: any) => matchUp.roundNumber === lastRound);
    // CONTROL: four qualifiers, each from a qualifying matchUp that was played
    expect(producers.map((matchUp: any) => matchUp.winningSide).filter(Boolean)).toHaveLength(4);
    for (const { matchUpId } of producers) {
      // CONTROL: each correction is accepted, or the path it names was never measured
      expect(enter(matchUpId, FLIPPED), 'flip').toEqual(true); // autoReplaceQualifiers: the other participant qualifies
      expect(enter(matchUpId, toBePlayed), 'clear').toEqual(true); // autoRemoveQualifiers: nobody qualifies from it
      expect(enter(matchUpId, PLAYED), 're-enter').toEqual(true); // autoPlaceQualifiers: placed again
    }
    // CONTROL: the corrections crossed the link, or (flags off) did not: placed qualifiers in the main draw
    const placed = getDrawMatchUps(drawId)
      .filter((matchUp: any) => matchUp.stage !== QUALIFYING)
      .flatMap((matchUp: any) => matchUp.sides ?? [])
      .filter((side: any) => side?.qualifier && side.participantId).length;
    expect(placed, `${config.label}: qualifiers placed in the main draw`).toEqual(
      config.qualifying.policy?.autoPlaceQualifiers ? 4 : 0,
    );
  }
  playOut(() => true);
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  return run;
}

/** what S1's differential would add per call on this record: a shadow clone, and the A3.2 capture + comparison */
function copyCost(samples = 5) {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const time = (fn: () => void) => {
    const started = performance.now();
    for (let i = 0; i < samples; i++) fn();
    return (performance.now() - started) / samples;
  };
  const captured = captureRecord(tournamentRecord);
  return {
    clone: time(() => cloneState({ tournamentRecord })),
    capture: time(() => captureRecord(tournamentRecord)),
    compare: time(() => compareRecord(captured, tournamentRecord)),
  };
}

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const fixed = (value: number, digits = 2) => value.toFixed(digits);

it('the control: the harness times every call and sees the hydrations', () => {
  const run = complete({ label: 'SE 8', drawType: SINGLE_ELIMINATION, drawSize: 8 }, OUTCOME_PIPELINE_V1);
  // a draw of 8 is seven matchUps, all played: an instrument that stopped counting would read zero
  expect(run.calls).toEqual(7);
  expect(run.refused).toEqual(0);
  expect(run.hydrations.every((count) => count > 0)).toEqual(true);
  const copies = copyCost(1);
  expect(copies.clone).toBeGreaterThan(0);
});

it.skipIf(process.env.COST_CURVE !== '1')(
  'the cost curve: ms and hydrations per setMatchUpStatus, per mode, as the draw grows',
  () => {
    const repeats = Number(process.env.COST_CURVE_REPEATS ?? 4);
    const rows: any[] = [];
    const only = process.env.COST_CURVE_ONLY; // a label substring, to run part of the curve
    complete(CONFIGS[0], OUTCOME_PIPELINE_V1); // warm-up, not recorded
    for (const config of CONFIGS.filter((candidate) => !only || candidate.label.includes(only))) {
      const byMode: Record<string, Run[]> = Object.fromEntries(MODES.map((mode) => [mode, []]));
      for (let repeat = 0; repeat < repeats; repeat++)
        for (const mode of repeat % 2 ? [...MODES].reverse() : MODES) byMode[mode].push(complete(config, mode));
      const copies = copyCost();
      const row: any = { config: config.label, copies };
      for (const mode of MODES) {
        const runs = byMode[mode];
        // CONTROL: every repeat in every mode completes the same draw the same way
        expect(new Set(runs.map((run) => `${run.calls}/${run.refused}`)).size, `${config.label} ${mode}`).toEqual(1);
        row[mode] = {
          calls: runs[0].calls,
          refused: runs[0].refused,
          msPerCall: mean(runs.map((run) => mean(run.ms))),
          hydrationsPerCall: mean(runs[0].hydrations),
        };
      }
      rows.push(row);
    }

    const lines = [
      '',
      `# cost curve — ${repeats} alternating repeats per mode, after a warm-up`,
      '',
      '| draw | calls | v1 ms/call | v2 ms/call | differential ms/call | v1 hydrations/call | v2 | differential | clone ms | capture ms | compare ms | S1 copies as % of v1 call |',
      '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
      ...rows.map((row) => {
        const [v1, v2, diff] = MODES.map((mode) => row[mode]);
        const added = row.copies.clone + row.copies.capture + row.copies.compare;
        return `| ${row.config} | ${v1.calls} | ${fixed(v1.msPerCall)} | ${fixed(v2.msPerCall)} | ${fixed(diff.msPerCall)} | ${fixed(v1.hydrationsPerCall, 1)} | ${fixed(v2.hydrationsPerCall, 1)} | ${fixed(diff.hydrationsPerCall, 1)} | ${fixed(row.copies.clone)} | ${fixed(row.copies.capture)} | ${fixed(row.copies.compare)} | ${fixed((100 * added) / v1.msPerCall, 0)}% |`;
      }),
      '',
    ].join('\n');
    process.stdout.write(lines);
    if (process.env.OUT) {
      fs.writeFileSync(process.env.OUT, JSON.stringify(rows, undefined, 2));
      fs.writeFileSync(process.env.OUT.replace(/\.json$/, '') + '.md', lines);
    }
  },
  3_600_000,
);
