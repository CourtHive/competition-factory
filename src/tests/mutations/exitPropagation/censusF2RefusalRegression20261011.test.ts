import { replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { afterAll, beforeAll, expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * CENSUS FAILURE FAMILY F2, replayed — a ratchet that may only shrink.
 *
 * F2 is `ERROR_IMPLIES_NO_MUTATION`: a call returns an error after changing the draw. Replayed by arm on `dev`
 * 43ced17b72, the thirteenth and fourteenth at-scale runs' census-fails hold 92 instances. Each was stepped to its
 * refusing call with a trap on the live draw, which recorded the first write, and was put in one of three groups:
 *
 * - **SETTLE-A** (53): the refusal's only write is `reconcileStaleExitOrigins`, run by `setMatchUpStatus` after
 *   `setMatchUpState` had refused. It repairs a stale exit origin that an EARLIER, successful call left: that call's
 *   own reconciliation was handed `result.context.matchUpsMap`, which `definedAttributes` had deep-copied, so it
 *   decided on the draw as it stood at the direction and wrote to objects no longer in it.
 * - **SETTLE-B** (2, FIRST_MATCH_LOSER_CONSOLATION 16 under `doubleExitPropagateBye: false`): the same write. The stale
 *   entry is left by `settleHeldExits`, which sends an exit on from a matchUp whose open seat can never be filled; the
 *   relay rule in `reconcileStaleExitOrigins` accepted a hop only past a matchUp still holding a BYE.
 * - **OTHER** (12, DOUBLE_ELIMINATION 10, FEED_IN_CHAMPIONSHIP_TO_SF 2): the direction writes, and a position
 *   assignment refuses after it (`ERR_EXISTING_POSITION_ASSIGNMENT`, `ERR_OCCUPIED_DRAW_POSITION`).
 *
 * The other 25 (11 seeds) are P51's RULE 4 meeting: `progressExitStatus` refusing a convergence onto a matchUp an exit
 * already decided, with active downstream. CA, 2026-10-11, in two groups:
 *
 * - **P51-CONVERGENCE** (10 seeds, 24 instances, one per seed held here): nothing below the convergence was played;
 *   only carried exits stood there. Closed by the 2026-09-25 rule applied to convergence
 *   (`aConvergenceIsNotBlockedByWhatItCarried`).
 * - **P51-PLAYED** (1 seed, OLYMPIC `on`:20496362): a match recorded with two participants stands below. Held here
 *   since CA's (b) landed in v1 and v2 alike: the arrival is carried past the matchUp the exit decided while
 *   awaiting it (`aCarryIsCarriedPastADecidedSeat`), and the P52 guard behind it reads a result recorded by the
 *   winner of the loser's carried award, one structure on. It replays clean.
 * - **RUN16-INCOMPATIBLE** (COMPASS 20599089, `off` and `policyoff`) and **RUN16-ASSIGNMENT** (DOUBLE_ELIMINATION
 *   `on`:20617910, COMPASS `policyoff`:20586104): the sixteenth at-scale run's four instances (census S4, 2026-10-13),
 *   outside the s13/s14 range. `ERR_INCOMPATIBLE_MATCHUP_STATUS` and `ERR_EXISTING_POSITION_ASSIGNMENT` after writing.
 *   RUN16-INCOMPATIBLE closed: `progressExitStatus` built its view without the tournament record, so the carry-past
 *   check read a result recorded below as inert and fell through to a convergence `setMatchUpState` refused
 *   (`aCarryPastSeesARecordedResultBelow`). RUN16-ASSIGNMENT `on`:20617910 closed: a withdrawal that left the kept
 *   exit awarded to the OTHER side compared status alone, kept the stale award and never released what it had
 *   advanced (`aWithdrawnExitReleasesTheAwardItMoved`); `policyoff`:20586104 closed: a double exit
 *   re-derived to a single one left its carrier's structurally advanced seat in the next round
 *   (`aDissolvedDoubleExitReleasesItsLoser`). All four run-16 instances replay clean.
 * - **RUN17B-ASSIGNMENT** (DOUBLE_ELIMINATION 8/5 `policyoff`:20622028 and 20630577, the run-17 baseline): the same
 *   release, from a structure's LAST round, where the next round is across the link; and the BYE-status entry a
 *   convergence left beside a BYE outlived the exit it accompanied (`aDissolvedFinalReleasesAcrossTheLink`). Closed.
 *
 * This fixture holds 53: these two, the four run-16 instances, and 47 from s13/s14 sized for CI: every SETTLE-B and OTHER
 * instance, up to three SETTLE-A instances per draw type
 * (the smallest), seeds 20504956 and 20523724, one instance of each P51-CONVERGENCE seed, and the P51-PLAYED instance.
 * All 92 are in `Mentat/fixtures/exit-propagation-census/census-fails-s1{3,4}.jsonl`; the planning record is
 * `Mentat/planning/CENSUS_FAILURE_FAMILIES.md`. Each schedule replays in the arm it was emitted in.
 *
 * **SETTLE-A and SETTLE-B closed, all 24 here** (and all 55 of the two runs): `setMatchUpStatus` runs nothing after
 * a refusal, the settle step reads the draw rather than a map carried in the context, and `decorateResult` no longer
 * deep-copies a context (`aSettleReadsTheDrawItLeft`). None exposes another property behind it. SETTLE-B's two seeds
 * close as refusals; the held exits that fail to converge there are recorded in the planning record.
 *
 * **OTHER: both FEED_IN_CHAMPIONSHIP_TO_SF instances and DOUBLE_ELIMINATION 20496331 closed** (2026-10-12): a carried
 * exit that passed a BYE a holder later took back comes back with it, and a matchUp onward decided only by that carry,
 * for an unoccupied seat, is released with it (`releaseHoldersByeFromTarget`, `passedByeReleased`;
 * `aCarryPastAReleasedByeComesBack`). None exposes another property behind it.
 *
 * **OTHER: the remaining eight DOUBLE_ELIMINATION instances closed** (2026-10-12), by five fixes, one per shape
 * (`doubleEliminationRefusalsThatWrote`): the decider is seated from the final that stands; an exit arriving opposite
 * a carrier converges; an award taken back is released across its own winner link; an occupant carrying an exit is
 * read from the side the advancement derived; and a clear of a position the matchUp never held keeps the held side's
 * carry. None exposes another property behind it.
 *
 * ## OPEN — the instances that still refuse after writing, by group
 *
 * The instances failing `ERROR_IMPLIES_NO_MUTATION` with their recorded code must EQUAL these lists, each in its own
 * group, so one group's fix cannot hide behind another's. A new failure fails; so does an instance that stops failing,
 * until its entry is removed here — the lists only shrink, and a fix records itself by deleting a line.
 */
const OPEN: Record<string, Set<string>> = {
  'SETTLE-A': new Set([]),
  'SETTLE-B': new Set([]),
  'P51-CONVERGENCE': new Set([]),
  'P51-PLAYED': new Set([]),
  OTHER: new Set([]),
  'RUN16-INCOMPATIBLE': new Set([]),
  'RUN16-ASSIGNMENT': new Set([]),
  'RUN17B-ASSIGNMENT': new Set([]),
};

/**
 * ## BEHIND — what an instance fails once its F2 finding is gone
 *
 * The census reports a seed's FIRST failing property, so closing F2 can expose another family behind it. Such an
 * instance leaves OPEN and is recorded here with the property it now fails. An instance in neither must replay clean.
 */
const BEHIND: Record<string, string> = {};

type Arm = 'off' | 'on' | 'policyoff';
type Group =
  'SETTLE-A' | 'SETTLE-B' | 'OTHER' | 'P51-CONVERGENCE' | 'P51-PLAYED' | 'RUN16-INCOMPATIBLE' | 'RUN16-ASSIGNMENT';
type Instance = { arm: Arm; seed: number; run: string; group: Group; code: string; config: any; steps: any[] };

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/censusF2RefusalSchedules20261011.jsonl');
const INSTANCES: Instance[] = fs
  .readFileSync(FIXTURE, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const key = (instance: Instance) => `${instance.arm}:${instance.seed}`;
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };

// the census's `on` arm is an env flag that `transitions.ts` reads per mutation; restored whatever an instance set
let priorFlag: string | undefined;
beforeAll(() => {
  priorFlag = process.env.ALLOW_CHANGE_PROPAGATION;
});
afterAll(() => {
  if (priorFlag === undefined) delete process.env.ALLOW_CHANGE_PROPAGATION;
  else process.env.ALLOW_CHANGE_PROPAGATION = priorFlag;
});

/** `F2:<code>` for a refusal after a write, the failing property when it fails otherwise, undefined when clean */
function classify(instance: Instance): string | undefined {
  setSubscriptions({});
  if (instance.arm === 'on') process.env.ALLOW_CHANGE_PROPAGATION = '1';
  else delete process.env.ALLOW_CHANGE_PROPAGATION;
  const policyDefinitions = instance.arm === 'policyoff' ? POLICY_OFF : undefined;
  const failure = replay(instance.config, instance.steps, `census-f2-${instance.seed}`, policyDefinitions);
  if (!failure) return undefined;
  if (failure.property === 'ERROR_IMPLIES_NO_MUTATION') {
    const code = /"code":"([A-Z_]+)"/.exec(failure.detail)?.[1];
    return `F2:${code}`;
  }
  if (failure.property !== 'DRAW_INCONSISTENCY') return failure.property;
  const issueTypes = JSON.parse(failure.detail).map((issue: any) => issue.issueType);
  return `DRAW_INCONSISTENCY:${issueTypes.join('+')}`;
}

// CONTROL: an empty or truncated fixture would pass by replaying nothing
it('holds all 53 instances, each listed in its own group at most once', () => {
  expect(INSTANCES.length).toEqual(53);
  expect(new Set(INSTANCES.map(key)).size).toEqual(53);
  for (const instance of INSTANCES) {
    expect(['off', 'on', 'policyoff']).toContain(instance.arm);
    expect(instance.config.seed).toEqual(instance.seed);
  }
  const listed = [...Object.values(OPEN).flatMap((entries) => [...entries]), ...Object.keys(BEHIND)];
  expect(new Set(listed).size).toEqual(listed.length);
  expect(listed.filter((entry) => !INSTANCES.some((instance) => key(instance) === entry))).toEqual([]);
  // an OPEN entry sits in the group its instance was classified into
  for (const [group, entries] of Object.entries(OPEN)) {
    for (const entry of entries) expect(INSTANCES.find((instance) => key(instance) === entry)?.group).toEqual(group);
  }
});

it.each(INSTANCES.map((instance) => [`${instance.group} ${key(instance)}`, instance] as const))(
  '%s',
  (_label, instance) => {
    const entry = key(instance);
    const expected = OPEN[instance.group].has(entry) ? `F2:${instance.code}` : BEHIND[entry];
    expect(classify(instance)).toEqual(expected);
  },
);
