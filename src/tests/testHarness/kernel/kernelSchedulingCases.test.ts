import { authoredSchedulingCases } from './schedulingCaseSources';
import { readFileSync, writeFileSync } from 'node:fs';
import { canonicalJson } from '@Tools/canonicalJson';
import { describe, expect, it } from 'vitest';
import path from 'node:path';

/**
 * `cases/scheduling.json` is the authored `kernel.scheduling.plan@1` cases (`schedulingCaseSources.ts`): rebuilt here,
 * each held to its claims, and compared with the committed file, so a change to the view or to a plan is a reviewed
 * change to the cases. `KERNEL_SCHEDULING_CASES=write` rewrites the file instead.
 */
const file = path.join(__dirname, 'cases', 'scheduling.json');

describe('the authored scheduling cases', () => {
  it('meet their claims, and are the committed cases', () => {
    const cases = authoredSchedulingCases();
    expect(cases.length).toBeGreaterThanOrEqual(7);
    if (process.env.KERNEL_SCHEDULING_CASES === 'write') {
      writeFileSync(file, JSON.stringify(cases, null, 1) + '\n');
      return;
    }
    const committed = JSON.parse(readFileSync(file, 'utf8'));
    expect(committed.map(({ caseId }: any) => caseId)).toEqual(cases.map(({ caseId }) => caseId));
    for (const [index, built] of cases.entries())
      expect({ caseId: built.caseId, same: canonicalJson(built) === canonicalJson(committed[index]) }).toEqual({
        caseId: built.caseId,
        same: true,
      });
  });
});
