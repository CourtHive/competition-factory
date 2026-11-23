import type * as errorConditionConstants from '@Constants/errorConditionConstants';
import type * as sanctioningConstants from '@Constants/sanctioningConstants';
import type * as officiatingConstants from '@Constants/officiatingConstants';

/** The `code` of every `{ message, code }` error a constants module exports. */
type CodesOf<Module> = {
  [Name in keyof Module]: Module[Name] extends { readonly code: infer Code extends string; readonly message: string }
    ? Code
    : never;
}[keyof Module];

/**
 * Every error code the factory can return, as a closed union.
 *
 * Across a socket an error arrives as JSON, so its `code` is the only thing a consumer can recognise it
 * by. Typed as `string`, a misspelled code is a comparison that never matches and compiles anyway; typed
 * as `ErrorCode`, it does not compile:
 *
 *     const MISSING: ErrorCode = 'ERR_MISSING_TOURNAMENT';   // ok
 *     const TYPO: ErrorCode = 'ERR_MISSING_TOURNAMNT';       // error
 *
 * Derived from the modules' exports rather than listed, so an error added to any of them is a member
 * without further edits. Comparing against the constant itself (`error?.code === INVALID_VALUES.code`)
 * needs no type at all and is equally safe.
 */
export type ErrorCode =
  CodesOf<typeof errorConditionConstants> | CodesOf<typeof sanctioningConstants> | CodesOf<typeof officiatingConstants>;
