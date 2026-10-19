import type { PropertyFailure } from './transitions';
import { execFileSync } from 'node:child_process';

/**
 * What a census finding row carries so it reproduces on its own (census plan A6).
 *
 * A row once held the seed, the property and the detail, and a reader had to recover the rest: which arm the process
 * ran, which policy the scenario replayed under, which revision generated the schedule and which replayed it, and
 * which call of the scenario failed. Each of those has cost a misread reproduction: a probe missing from the record
 * (sweep.ts, 2026-09-21), a policy window replayed without its policy, a Button run gating a stale ref.
 */
export type FindingProvenance = {
  arm: string;
  /** the policy the scenario replayed under; `null` when none was attached */
  policyDefinitions: any;
  revisions: {
    /** the revision that generated the schedule, when the scenario records it; `null` for older frozen inputs */
    source: string | null;
    /** the checkout that replayed it, suffixed `-dirty` when its tracked files differ from that commit */
    harness: string | null;
  };
};

/**
 * The arm, from the variables the Mentat workers set for it (`scripts/stall-census/worker.mjs`): `on` sets
 * `ALLOW_CHANGE_PROPAGATION=1`, `policyoff` sets `PROPAGATE_BYE=0`, `off` sets neither. `CENSUS_ARM` overrides.
 */
export function censusArm(env: Record<string, string | undefined> = process.env): string {
  if (env.CENSUS_ARM) return env.CENSUS_ARM;
  const base = env.ALLOW_CHANGE_PROPAGATION === '1' ? 'on' : 'off';
  let policy: string | undefined;
  if (env.PROPAGATE_BYE === '0') policy = 'policyoff';
  else if (env.PROPAGATE_BYE === '1') policy = 'policyon';
  if (!policy) return base;
  return base === 'off' ? policy : `${base}+${policy}`;
}

let harness: string | null | undefined;

/** The replaying checkout's commit, read once per process; `null` outside a git checkout. */
export function harnessRevision(): string | null {
  if (harness !== undefined) return harness;
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
    harness = dirty ? `${head}-dirty` : head;
  } catch {
    harness = null;
  }
  return harness;
}

export function findingProvenance({
  policyDefinitions,
  sourceRevision,
  arm,
}: {
  policyDefinitions?: any;
  sourceRevision?: string;
  arm?: string;
}): FindingProvenance {
  return {
    arm: arm ?? censusArm(),
    policyDefinitions: policyDefinitions ?? null,
    revisions: { source: sourceRevision ?? null, harness: harnessRevision() },
  };
}

/** The per-call half: which call failed and the first field that differed. Absent fields are omitted. */
export function findingLocation(failure: PropertyFailure) {
  return {
    ...(failure.stage ? { stage: failure.stage } : {}),
    ...(failure.step !== undefined ? { step: failure.step } : {}),
    ...(failure.firstDivergence !== undefined ? { firstDivergence: failure.firstDivergence } : {}),
  };
}
