import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, randomConfig, generateSchedule, type Step } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, test } from 'vitest';
import fs from 'fs';

/**
 * `drawPositions` must never be an array of nothing but holes. INERT unless `SHAPE_SCAN=1`.
 *
 *   SHAPE_SCAN=1 TZ=UTC SEED_START=9000001 SEED_COUNT=600 OUT=/tmp/shape.jsonl \
 *     npx vitest run src/tests/mutations/exitPropagation/drawPositionShape.test.ts
 *
 * Replay a frozen window instead of generating, exactly as the census does:
 *   SHAPE_SCAN=1 SCHEDULES_IN=../Mentat/fixtures/exit-propagation-census/sched-w1.jsonl …
 * and add `ALLOW_CHANGE_PROPAGATION=1` for the second arm.
 *
 * ## The rule this asserts
 *
 * A hole is load-bearing ONLY beside a survivor. `[undefined, 5]` keeps 5 on side 2, because
 * `drawPositions` is POSITIONAL and compacting would move the survivor to the other side —
 * `releaseAdvancedDrawPosition` preserves that deliberately, and it must keep doing so. An array of
 * nothing BUT holes says nothing: there is no survivor for the hole to hold a side open beside.
 *
 * ## Why this is a scanner and not a unit test
 *
 * The shape is produced by cascades, not by any single call, and it is produced on matchUps far
 * from the one being scored. Measured 2026-09-16 over both frozen windows and both arms — 2,400
 * seed-runs, 72,000 steps — **870 seed-runs (36%) produced one**: 759 `[null,null]`, 137 `[null]`,
 * every one on an UNDECIDED matchUp in a downstream feed target. A unit test at any one call site
 * would have found none of them.
 *
 * ## It reads STORED state, deliberately
 *
 * inContext derivation pads and drops: `definedAttributes(…, ignoreEmptyArrays)` removes an empty
 * array entirely, so a hydrated matchUp cannot distinguish `[]` from never-had-positions. The
 * question is about what is stored, so it reads `drawDefinition.structures[].matchUps`.
 */

const enabled = process.env.SHAPE_SCAN === '1';
const seedStart = Number(process.env.SEED_START ?? 9000001);
const seedCount = Number(process.env.SEED_COUNT ?? 600);
const maxSteps = Number(process.env.MAX_STEPS ?? 30);
const outPath = process.env.OUT ?? '/tmp/drawPositionShape.jsonl';
const schedulesIn = process.env.SCHEDULES_IN;

const isAllHoles = (drawPositions: any): boolean =>
  Array.isArray(drawPositions) &&
  drawPositions.length > 0 &&
  drawPositions.every((position: any) => position === undefined || position === null);

/** Every stored matchUp carrying an all-holes array, with the structure it sits in. */
export function allHolesMatchUps(drawId: string): any[] {
  const found: any[] = [];
  const walk = (structure: any) => {
    for (const matchUp of structure.matchUps ?? []) {
      if (isAllHoles(matchUp.drawPositions)) {
        found.push({
          coordinate: `${structure.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`,
          drawPositions: matchUp.drawPositions,
          matchUpStatus: matchUp.matchUpStatus ?? null,
          winningSide: matchUp.winningSide ?? null,
        });
      }
    }
    for (const child of structure.structures ?? []) walk(child);
  };
  for (const structure of getDrawDefinition(drawId)?.structures ?? []) walk(structure);
  return found;
}

const structuralKey = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

test.skipIf(!enabled)(
  'drawPositions is never an array of nothing but holes',
  () => {
    const scenarios = schedulesIn
      ? fs
          .readFileSync(schedulesIn, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : Array.from({ length: seedCount }, (_, index) => {
          const seed = seedStart + index;
          const config = randomConfig(seed);
          setSubscriptions({});
          prepareDraw(config, `shape-${seed}`);
          return { seed, config, steps: generateSchedule(config, `shape-${seed}`, maxSteps) };
        });

    fs.writeFileSync(outPath, '');
    let offendingSeeds = 0;
    let steps = 0;

    for (const scenario of scenarios) {
      setSubscriptions({});
      const drawId = `shape-${scenario.seed}`;
      prepareDraw(scenario.config, drawId);

      // At generation, before any mutation — a separate question from the runtime one.
      for (const offender of allHolesMatchUps(drawId)) {
        offendingSeeds++;
        fs.appendFileSync(outPath, JSON.stringify({ seed: scenario.seed, when: 'GENERATION', ...offender }) + '\n');
      }

      let reported = false;
      let stepNumber = 0;
      for (const step of (scenario.steps ?? []) as Step[]) {
        stepNumber++;
        const target = getDrawMatchUps(drawId).find((matchUp: any) => structuralKey(matchUp) === structuralKey(step));
        if (!target) continue;
        observeMutation({
          propagateExitStatus: scenario.config.propagateExitStatus,
          matchUpId: target.matchUpId,
          outcome: step.outcome,
          drawId,
        });
        steps++;
        const offenders = allHolesMatchUps(drawId);
        // One row per seed: the FIRST step that produces the shape is what a fix must address.
        if (offenders.length && !reported) {
          reported = true;
          offendingSeeds++;
          fs.appendFileSync(
            outPath,
            JSON.stringify({
              seed: scenario.seed,
              when: 'RUNTIME',
              step: stepNumber,
              triggeredBy: structuralKey(step),
              outcome: step.outcome,
              drawType: scenario.config.drawType,
              config: scenario.config,
              offenders,
            }) + '\n',
          );
        }
      }
    }

    fs.appendFileSync(
      outPath,
      JSON.stringify({ kind: 'SUMMARY', scenarios: scenarios.length, steps, offendingSeeds }) + '\n',
    );

    // The control: a scan that replayed nothing would report zero offenders and read as good news.
    expect(steps).toBeGreaterThan(0);
    expect(offendingSeeds).toEqual(0);
  },
  1000 * 60 * 60,
);
