import { ConflictEvaluationInputs } from '@Types/officiatingTypes';

/**
 * The single list of inputs that configure a conflict-of-interest evaluation.
 *
 * WHY THIS EXISTS. Every route that can evaluate conflicts calls `getOfficialConflicts`, and each one
 * used to hand-list the fields it forwarded. That is silent-drift by construction: when
 * `officialParticipantId` + `groupParticipants` were added for tournament-scoped (GROUP) declarations,
 * `addMatchUpOfficial` forwarded them and `assignOfficial` did not — so the SAME conflict blocked a
 * per-matchUp assignment and passed on the tournament-level one. A rule that applies or not depending on
 * which route the operator happened to use is worse than no rule, because it looks enforced.
 *
 * Adding a new input now means editing this one array. Routes forward the set whole and inherit it.
 *
 * `participants` is deliberately NOT here: it is route-specific. `assignOfficial` takes it from the
 * caller; `getMatchUpOfficialConflicts` derives it from the matchUp's sides. Routes pass it explicitly
 * alongside this set.
 */
export const CONFLICT_INPUT_KEYS = [
  'policyDefinitions',
  'officialRecord',
  'officialParticipantId',
  'groupParticipants',
  'nationalityCode',
  'organisationIds',
] as const satisfies readonly (keyof ConflictEvaluationInputs)[];

/**
 * Pick the conflict-evaluation inputs off any args object, so a route forwards the whole set rather
 * than a hand-maintained subset. A conformance test asserts every route does this — see
 * `src/tests/officiating/conflictInputForwarding.test.ts`.
 */
export function conflictInputsFrom(source: ConflictEvaluationInputs): ConflictEvaluationInputs {
  const inputs: ConflictEvaluationInputs = {};
  for (const key of CONFLICT_INPUT_KEYS) {
    if (source?.[key] !== undefined) (inputs as any)[key] = source[key];
  }
  return inputs;
}
