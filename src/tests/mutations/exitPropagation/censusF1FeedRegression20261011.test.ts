import { replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { afterAll, beforeAll, expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * CENSUS FAILURE FAMILY F1, replayed — a ratchet that may only shrink.
 *
 * The thirteenth at-scale run (dev 1049a6373e, seeds 20,460,001–20,500,000, 40,000 per arm) read zero stalls, and 451
 * census-fails. 265 of them are one family, all in the `allowChangePropagation` arm and all
 * FIRST_MATCH_LOSER_CONSOLATION: the end state fails `getDrawInconsistencies` with `DROPPED_PROGRESSION` (a loser
 * eligible to feed the consolation is absent from it) or `INELIGIBLE_PROGRESSION` (a loser the feed rule excludes is
 * present in it). Every one fails identically on `dev` before and after #5364, so the family predates that release; the
 * frozen anchors (P48) already failed at 564302fa85.
 *
 * This fixture holds 45 of the 265, sized for CI: the four smallest seeds, every seed reporting
 * `INELIGIBLE_PROGRESSION`, and the earliest `DROPPED_PROGRESSION` seed at each draw size. All 265 are in
 * `Mentat/fixtures/exit-propagation-census/census-fails-s13.jsonl`; the full set is a scale run's job. The planning
 * record is `Mentat/planning/CENSUS_FAILURE_FAMILIES.md`.
 *
 * Each schedule was EMITTED IN THE `on` ARM and replays there: `generateSchedule` calls the engine, so a schedule
 * emitted without `allowChangePropagation` is a different schedule.
 *
 * ## OPEN — the seeds whose end state still fails the FMLC feed rule
 *
 * The set of seeds failing with an F1 issue must EQUAL this list. A new failure fails; so does a seed that stops
 * failing, until its entry is removed here — the list only shrinks, and a fix records itself by deleting a line.
 */
const OPEN = new Set<string>([
  'on:20460202', // 8/8 DROPPED_PROGRESSION
  'on:20460410', // 8/7 INELIGIBLE_PROGRESSION
  'on:20460458', // 8/8 DROPPED_PROGRESSION
  'on:20460840', // 32/29 DROPPED_PROGRESSION
  'on:20460841', // 32/30 DROPPED_PROGRESSION
  'on:20460860', // 8/7 DROPPED_PROGRESSION
  'on:20461319', // 16/14 DROPPED_PROGRESSION
  'on:20461937', // 16/15 DROPPED_PROGRESSION
  'on:20462268', // 32/31 DROPPED_PROGRESSION
  'on:20463468', // 8/5 DROPPED_PROGRESSION
  'on:20463476', // 16/16 DROPPED_PROGRESSION
  'on:20463511', // 8/6 DROPPED_PROGRESSION
  'on:20463622', // 32/27 DROPPED_PROGRESSION
  'on:20463803', // 32/29 INELIGIBLE_PROGRESSION + DROPPED_PROGRESSION
  'on:20463941', // 16/13 DROPPED_PROGRESSION
  'on:20464044', // 32/32 DROPPED_PROGRESSION
  'on:20464366', // 16/11 DROPPED_PROGRESSION
  'on:20469209', // 16/16 INELIGIBLE_PROGRESSION
  'on:20470000', // 16/16 INELIGIBLE_PROGRESSION
  'on:20470676', // 16/16 INELIGIBLE_PROGRESSION
  'on:20470928', // 8/5 INELIGIBLE_PROGRESSION
  'on:20473585', // 16/14 INELIGIBLE_PROGRESSION
  'on:20473867', // 16/14 INELIGIBLE_PROGRESSION
  'on:20473873', // 8/8 INELIGIBLE_PROGRESSION
  'on:20474622', // 16/11 INELIGIBLE_PROGRESSION
  'on:20476188', // 8/6 INELIGIBLE_PROGRESSION
  'on:20478629', // 16/11 INELIGIBLE_PROGRESSION
  'on:20480001', // 16/16 INELIGIBLE_PROGRESSION
  'on:20480841', // 16/11 INELIGIBLE_PROGRESSION
  'on:20482053', // 16/16 INELIGIBLE_PROGRESSION
  'on:20483283', // 16/13 INELIGIBLE_PROGRESSION + DROPPED_PROGRESSION
  'on:20483602', // 8/8 INELIGIBLE_PROGRESSION
  'on:20483976', // 16/13 INELIGIBLE_PROGRESSION
  'on:20486619', // 16/14 INELIGIBLE_PROGRESSION
  'on:20486683', // 32/29 INELIGIBLE_PROGRESSION
  'on:20486698', // 16/13 INELIGIBLE_PROGRESSION
  'on:20489845', // 16/14 INELIGIBLE_PROGRESSION
  'on:20492035', // 16/11 INELIGIBLE_PROGRESSION
  'on:20492728', // 32/30 INELIGIBLE_PROGRESSION
  'on:20494512', // 32/27 INELIGIBLE_PROGRESSION
  'on:20494692', // 32/30 INELIGIBLE_PROGRESSION
  'on:20495518', // 32/30 INELIGIBLE_PROGRESSION
  'on:20495541', // 16/15 INELIGIBLE_PROGRESSION
  'on:20498417', // 32/27 INELIGIBLE_PROGRESSION
  'on:20498521', // 8/7 INELIGIBLE_PROGRESSION
]);

/**
 * ## BEHIND — what a seed fails once its F1 finding is gone
 *
 * The census reports a seed's FIRST failing property, so closing F1 can expose another family behind it. Such a seed
 * leaves OPEN and is recorded here with the property it now fails, so that what it fails stays exact rather than
 * becoming "anything but F1". A seed in neither list must replay clean.
 */
const BEHIND: Record<string, string> = {};

type Instance = { arm: 'on'; seed: number; issueTypes: string[]; config: any; steps: any[] };

const FEED_ISSUES = ['DROPPED_PROGRESSION', 'INELIGIBLE_PROGRESSION'];

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/censusF1FeedSchedules20261011.jsonl');
const INSTANCES: Instance[] = fs
  .readFileSync(FIXTURE, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const key = (instance: Instance) => `${instance.arm}:${instance.seed}`;

// the census's `on` arm: `transitions.ts` reads the flag per mutation
let priorFlag: string | undefined;
beforeAll(() => {
  priorFlag = process.env.ALLOW_CHANGE_PROPAGATION;
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
});
afterAll(() => {
  if (priorFlag === undefined) delete process.env.ALLOW_CHANGE_PROPAGATION;
  else process.env.ALLOW_CHANGE_PROPAGATION = priorFlag;
});

/** 'F1' when the end state fails the feed rule, the failing property when it fails otherwise, undefined when clean */
function classify(instance: Instance): string | undefined {
  setSubscriptions({});
  const failure = replay(instance.config, instance.steps, `census-f1-${instance.seed}`);
  if (!failure) return undefined;
  if (failure.property !== 'DRAW_INCONSISTENCY') return failure.property;
  const issueTypes = JSON.parse(failure.detail).map((issue: any) => issue.issueType);
  return issueTypes.some((issueType: string) => FEED_ISSUES.includes(issueType))
    ? 'F1'
    : `DRAW_INCONSISTENCY:${issueTypes.join('+')}`;
}

// CONTROL: an empty or truncated fixture would pass by replaying nothing, and a line from another arm or draw type
// would replay a schedule that is not this family's
it('holds all 45 instances, each an `on`-arm FIRST_MATCH_LOSER_CONSOLATION schedule', () => {
  expect(INSTANCES.length).toEqual(45);
  expect(new Set(INSTANCES.map(key)).size).toEqual(45);
  for (const instance of INSTANCES) {
    expect(instance.arm).toEqual('on');
    expect(instance.config.drawType).toEqual('FIRST_MATCH_LOSER_CONSOLATION');
    expect(instance.config.seed).toEqual(instance.seed);
  }
  // every seed is accounted for in exactly one place
  const listed = [...OPEN, ...Object.keys(BEHIND)];
  expect(new Set(listed).size).toEqual(listed.length);
  expect(listed.filter((entry) => !INSTANCES.some((instance) => key(instance) === entry))).toEqual([]);
});

it.each(INSTANCES.map((instance) => [key(instance), instance] as const))('%s', (entry, instance) => {
  const expected = OPEN.has(entry) ? 'F1' : BEHIND[entry];
  expect(classify(instance)).toEqual(expected);
});
