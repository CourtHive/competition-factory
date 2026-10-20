import { replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
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
 * **Closed, all 45 (and all 265 of the run), by `relabelledPathFeeds`** (`aFlipReFeedsTheLossItRelabels`): a winner
 * change relabels the old winner's later losses onto the old loser, and the `FIRST_MATCHUP` feed of such a loss was
 * never re-asked about its new occupant, whose first win is the flipped matchUp. None exposes another property behind
 * it.
 *
 * ## OPEN — the seeds whose end state still fails the FMLC feed rule
 *
 * The set of seeds failing with an F1 issue must EQUAL this list. A new failure fails; so does a seed that stops
 * failing, until its entry is removed here — the list only shrinks, and a fix records itself by deleting a line.
 */
const OPEN = new Set<string>([]);

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
