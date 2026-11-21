import { expect } from 'vitest';

/** Only the contents of the diagnostic stack may vary across outcome modes (§7.2). */
export function captureReturn({ stack, ...result }: Record<string, any>) {
  return { result, arrayStack: Array.isArray(stack) };
}

export function expectReturnParity(
  actual: ReturnType<typeof captureReturn>,
  v1: ReturnType<typeof captureReturn>,
  context?: string,
) {
  if (v1.arrayStack) expect(actual.arrayStack, context).toBe(true);
  expect(actual.result, context).toStrictEqual(v1.result);
}
