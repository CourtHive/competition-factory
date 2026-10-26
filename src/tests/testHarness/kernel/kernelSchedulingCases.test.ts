import { authoredSchedulingCases } from './schedulingCaseSources';
import { authoredGridCases } from './gridCaseSources';
import { readFileSync, writeFileSync } from 'node:fs';
import { canonicalJson } from '@Tools/canonicalJson';
import { describe, expect, it } from 'vitest';
import type { KernelCase } from './kernel';
import path from 'node:path';

/**
 * `cases/scheduling.json` is the authored `kernel.scheduling.plan@2` cases (`schedulingCaseSources.ts`), and
 * `cases/schedulingView.json` the `kernel.scheduling.view@1` cases built from the same sources: rebuilt here, each held
 * to its claims, and compared with the committed files, so a change to the view or to a plan is a reviewed change to
 * the cases; `cases/schedulingGrid.json` is the `kernel.scheduling.grid@1` cases (`gridCaseSources.ts`).
 * `KERNEL_SCHEDULING_CASES=write` rewrites the files instead.
 */
const files = {
  plan: path.join(__dirname, 'cases', 'scheduling.json'),
  view: path.join(__dirname, 'cases', 'schedulingView.json'),
  grid: path.join(__dirname, 'cases', 'schedulingGrid.json'),
};

function expectCommitted(file: string, cases: KernelCase[]) {
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
}

describe('the authored scheduling cases', () => {
  it('meet their claims, and are the committed cases', () => {
    const { plan, view } = authoredSchedulingCases();
    expect(plan.length).toBeGreaterThanOrEqual(7);
    expect(view.map(({ caseId }) => caseId.replace('.view.', '.plan.'))).toEqual(plan.map(({ caseId }) => caseId));
    expectCommitted(files.plan, plan);
    expectCommitted(files.view, view);
  });

  it('the grid cases meet their claims and the closed-view property, and are the committed cases', () => {
    const grid = authoredGridCases();
    expect(grid.length).toBeGreaterThanOrEqual(7);
    expectCommitted(files.grid, grid);
  });
});
