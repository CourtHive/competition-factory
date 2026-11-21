import { getNoticeBuffer } from '@Global/state/globalState';
import { canonicalHash } from './corpus/hash';
import { writeFileSync } from 'node:fs';
import { afterAll } from 'vitest';
// constants and types
import type { ResultType } from '@Types/factoryTypes';
const limit = 8;
const totals = { calls: 0, passes: 0, changed: 0, cycles: 0, reachedLimit: 0, errors: 0, newNotices: 0 };
const noticeCount = () => getNoticeBuffer()?.length ?? 0;

export function iterateSettlement(record: unknown, settle: () => ResultType): void {
  totals.calls++;
  const hashes = new Set([canonicalHash(record)]);
  let previous = [...hashes][0];
  for (let pass = 0; pass < limit; pass++) {
    const beforeNotices = noticeCount();
    const result = settle();
    totals.passes++;
    totals.newNotices += Math.max(0, noticeCount() - beforeNotices);
    if (result.error) {
      totals.errors++;
      return;
    }
    const hash = canonicalHash(record);
    if (hash === previous) return;
    if (pass === 0) totals.changed++;
    if (hashes.has(hash)) {
      totals.cycles++;
      return;
    }
    hashes.add(hash);
    previous = hash;
  }
  totals.reachedLimit++;
}

const output = process.env.OUTCOME_EXTERNAL_FIXPOINT_JSON;
if (output) afterAll(() => writeFileSync(output, JSON.stringify(totals, null, 2) + '\n'));
