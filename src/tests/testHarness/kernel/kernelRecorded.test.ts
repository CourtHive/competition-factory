import { batchedAdapter, externalAdapter, stdioCommand } from './externalAdapter';
import { canonicalJson } from '@Tools/canonicalJson';
import { describe, expect, it } from 'vitest';
import { directAdapter } from './kernel';
import { readFileSync } from 'node:fs';

// types
import type { KernelAdapter, KernelCase } from './kernel';

/**
 * Opt-in: `KERNEL_CASES=<file>` grades a file of recorded cases (`pnpm kernel:harvest-scheduling` writes one: a case per
 * scheduling call of the corpus, the scale matrix and the scheduling tests) through this implementation, in process and
 * as its own process, and through `KERNEL_EXTERNAL_ADAPTER=<command>` when one is named. Every adapter must give every
 * case's expected value. Skipped without a file: recorded cases are generated, never committed.
 */
const file = process.env.KERNEL_CASES;

function loadCases(): KernelCase[] {
  if (!file) return [];
  const byId = new Map<string, KernelCase>();
  for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const kernelCase: KernelCase = JSON.parse(line);
    byId.set(kernelCase.caseId, kernelCase);
  }
  return [...byId.values()];
}

describe.skipIf(!file)('recorded kernel cases', () => {
  const cases = loadCases();
  const requests = cases.map(({ operation, input }) => ({ operation, input }));
  const external = process.env.KERNEL_EXTERNAL_ADAPTER;
  const adapters: KernelAdapter[] = [
    directAdapter(),
    batchedAdapter(externalAdapter(stdioCommand(), 'stdio'), requests),
    ...(external ? [batchedAdapter(externalAdapter(external), requests)] : []),
  ];

  it.each(adapters)('$name gives every recorded case its expected value', (adapter) => {
    expect(cases.length).toBeGreaterThan(0);
    const failed = cases
      .filter(
        ({ operation, input, expected }) => canonicalJson(adapter.invoke(operation, input)) !== canonicalJson(expected),
      )
      .map(({ caseId }) => caseId);
    expect({ cases: cases.length, failed }).toEqual({ cases: cases.length, failed: [] });
  });
});
