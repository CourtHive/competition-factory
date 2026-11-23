import { describe, expect, it } from 'vitest';

// constants
import * as errorConditionConstants from '@Constants/errorConditionConstants';
import * as sanctioningConstants from '@Constants/sanctioningConstants';
import * as officiatingConstants from '@Constants/officiatingConstants';

/**
 * EVERY ERROR CODE IS A MEMBER OF ONE CLOSED UNION, `ErrorCode` (CA, 2026-10-04).
 *
 * The codes were 264 unique strings typed `string`, so a consumer recognising an error by its code
 * (the only key that survives the CFS socket) wrote the code by hand and a typo compiled. The factory
 * did the same: `src/errors` spelled 13 codes as literals under a comment saying they "must stay
 * identical", and `unwrap()` threw a code no constants module defined.
 *
 * This file holds the runtime half. The type-level half (the union is closed, admits each module's
 * codes, refuses a misspelling) lives in `src/constants/errorCodeConformance.ts`, because test files are
 * excluded from `tsconfig.json` and a type assertion written here would never be checked.
 */

const modules = { errorConditionConstants, sanctioningConstants, officiatingConstants };
const isError = (value: unknown): value is { code: string; message: string } =>
  !!value && typeof value === 'object' && typeof (value as any).code === 'string' && 'message' in (value as any);

const codesByModule = Object.entries(modules).map(([name, module]) => ({
  name,
  codes: Object.values(module)
    .filter(isError)
    .map((error) => error.code),
}));

describe('ErrorCode, at runtime', () => {
  it('every error code is unique across all three modules', () => {
    // CONTROL: each module was read
    for (const { codes } of codesByModule) expect(codes.length).toBeGreaterThan(10);
    const all = codesByModule.flatMap(({ codes }) => codes);
    expect(all.length).toBeGreaterThan(260);
    expect(all.filter((code, index) => all.indexOf(code) !== index)).toEqual([]);
  });

  it('the code unwrap() throws for an empty engine result is a defined constant', () => {
    expect(errorConditionConstants.ENGINE_RETURNED_UNDEFINED.code).toEqual('ENGINE_RETURNED_UNDEFINED');
  });
});
