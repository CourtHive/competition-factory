import { prepareDraw, replay, type Step } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, test } from 'vitest';
import fs from 'fs';

/**
 * Shrink ONE census seed on a census PROPERTY — the name `census.test.ts` writes in its `property`
 * field. `shrinkIssue.test.ts` shrinks on `getDrawInconsistencies` issueTypes and on harness
 * invariants; neither covers the relational properties, which are what an opened census seed most
 * often reports. INERT unless `SEED` is set.
 */
test.skipIf(!process.env.SEED)(
  'shrink on a census property',
  () => {
    const scenario = fs
      .readFileSync(process.env.SCHEDULES_IN as string, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .find((r: any) => r.seed === Number(process.env.SEED));
    expect(scenario, 'seed not in the schedule file').toBeTruthy();

    const property = (steps: Step[]): string | undefined => {
      setSubscriptions({});
      const drawId = 'shrink-property';
      prepareDraw(scenario.config, drawId);
      try {
        return (replay(scenario.config, steps, drawId) as any)?.property;
      } catch {
        return 'THREW';
      }
    };

    let steps: Step[] = scenario.steps ?? [];
    const target = process.env.PROPERTY ?? property(steps);
    // CONTROL: the full schedule must reproduce the named property, or the shrink shrinks nothing.
    expect(property(steps), `full schedule does not report ${target}`).toEqual(target);

    let progressed = true;
    while (progressed) {
      progressed = false;
      for (let i = steps.length - 1; i >= 0; i--) {
        const candidate = [...steps.slice(0, i), ...steps.slice(i + 1)];
        if (property(candidate) === target) {
          steps = candidate;
          progressed = true;
          break;
        }
      }
    }

    fs.writeFileSync(
      process.env.OUT ?? '/tmp/deb-rd/shrunk-property.json',
      JSON.stringify({ seed: scenario.seed, config: scenario.config, property: target, steps }, null, 2),
    );
  },
  1000 * 60 * 30,
);
