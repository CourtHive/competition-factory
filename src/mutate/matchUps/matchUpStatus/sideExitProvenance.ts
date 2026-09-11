import { OUTCOME_DEFAULT, OUTCOME_RETIREMENT, OUTCOME_WALKOVER } from '@Helpers/keyValueScore/constants';
import { writeNativeEnabled } from '@Global/state/globalState';
import { definedAttributes } from '@Tools/definedAttributes';

// constants and types
import { MatchUp, SideExitProvenance, SideExitProvenanceEntry } from '@Types/tournamentTypes';
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * Paired writer/reader for `matchUp.sideExitProvenance`.
 *
 * WHY THIS EXISTS. `matchUpStatusCodes` is an `any[]` carrying three unrelated element shapes:
 * the scoring policy's vocabulary (`matchUpStatusCode`), propagation provenance
 * (`matchUpStatus`/`previousMatchUpStatus`/`sideNumber`), and codes wrapped as `{ code }`. Provenance
 * is positional in that array — a side is an INDEX, padded with `''` — so it cannot be addressed,
 * cannot be attributed to the exit that produced it, and is flattened by every reader that assumes a
 * string. This field gives provenance its own home: keyed by `sideNumber`, one fixed shape, and
 * carrying `sourceMatchUpId`.
 *
 * WRITE MODE. Native writes are gated on `writeNativeEnabled()` (true for NATIVE and BRIDGE), so the
 * field follows the same switch as the other CODES first-class transitions. The LEGACY
 * `matchUpStatusCodes` write is deliberately NOT gated on `writeLegacyEnabled()` yet: the global
 * default is NATIVE, so gating it would stop writing the legacy array immediately and that is a
 * breaking change. Retiring the legacy write is the 8.0 step; until then this is a pure addition.
 *
 * See Mentat/planning/MATCHUP_STATUS_CODES_PER_SIDE.md.
 */

/** DOUBLE_WALKOVER produces WALKOVER downstream, DOUBLE_DEFAULT produces DEFAULTED. */
export function producedExitStatus(previousMatchUpStatus?: string): string | undefined {
  if (previousMatchUpStatus === DOUBLE_WALKOVER) return WALKOVER;
  if (previousMatchUpStatus === DOUBLE_DEFAULT) return DEFAULTED;
  return previousMatchUpStatus;
}

type BuildArgs = {
  pairedMatchUpStatus?: string;
  sourceMatchUpStatus?: string;
  sourceSideNumber?: number;
  pairedMatchUpId?: string;
  sourceMatchUpId?: string;
};

/**
 * Provenance for both sides of a target fed by a double exit.
 *
 * `sourceSideNumber` says which side the SOURCE exit landed on; the paired previous matchUp supplies
 * the other. Returns undefined when the side is unknown, rather than guessing — an unattributed
 * entry is worse than no entry, because the unwind would then trust it.
 */
export function buildSideExitProvenance(params: BuildArgs): SideExitProvenance | undefined {
  const { sourceMatchUpStatus, pairedMatchUpStatus, sourceSideNumber, sourceMatchUpId, pairedMatchUpId } = params;
  if (sourceSideNumber !== 1 && sourceSideNumber !== 2) return undefined;

  const pairedSideNumber = sourceSideNumber === 1 ? 2 : 1;
  const provenance: SideExitProvenance = {
    [sourceSideNumber]: definedAttributes({
      matchUpStatus: producedExitStatus(sourceMatchUpStatus),
      previousMatchUpStatus: sourceMatchUpStatus,
      sourceMatchUpId,
    }) as SideExitProvenanceEntry,
    [pairedSideNumber]: definedAttributes({
      matchUpStatus: producedExitStatus(pairedMatchUpStatus),
      previousMatchUpStatus: pairedMatchUpStatus,
      sourceMatchUpId: pairedMatchUpId,
    }) as SideExitProvenanceEntry,
  };

  // an entry with nothing in it is noise; drop it rather than persist an empty object
  for (const key of Object.keys(provenance)) {
    if (!Object.keys(provenance[key as any] ?? {}).length) delete provenance[key as any];
  }

  return Object.keys(provenance).length ? provenance : undefined;
}

/** Write provenance onto a matchUp, honouring the schema write mode. */
export function setSideExitProvenance({
  provenance,
  matchUp,
}: {
  provenance?: SideExitProvenance;
  matchUp?: MatchUp;
}): void {
  if (!matchUp || !writeNativeEnabled()) return;
  if (provenance && Object.keys(provenance).length) {
    matchUp.sideExitProvenance = provenance;
  } else {
    delete matchUp.sideExitProvenance;
  }
}

/**
 * Remove provenance from a matchUp.
 *
 * NOT gated on the write mode. Every site that blanks `matchUpStatusCodes` must also clear this, or
 * an unwound matchUp keeps provenance for an exit that no longer exists — a do/undo residue. The
 * write mode decides whether the field is WRITTEN; it must never decide whether stale state is
 * removed.
 */
export function clearSideExitProvenance(matchUp?: MatchUp): void {
  if (matchUp) delete matchUp.sideExitProvenance;
}

/**
 * Read provenance, preferring the native field and falling back to the legacy array.
 *
 * The fallback exists so a record written before this field — or by a LEGACY-mode writer — still
 * answers. It reads only the provenance SHAPE out of `matchUpStatusCodes`; policy codes and
 * `{ code }` wrappers are not provenance and are ignored.
 */
export function getSideExitProvenance({ matchUp }: { matchUp?: MatchUp }): SideExitProvenance | undefined {
  const native = matchUp?.sideExitProvenance;
  if (native && Object.keys(native).length) return native;

  const codes = matchUp?.matchUpStatusCodes;
  if (!Array.isArray(codes)) return undefined;

  const derived: SideExitProvenance = {};
  codes.forEach((code: any, index: number) => {
    if (!code || typeof code !== 'object' || !code.previousMatchUpStatus) return;
    // legacy provenance is positional: index 0 is side 1. `sideNumber` is preferred when present.
    const sideNumber = code.sideNumber ?? index + 1;
    if (sideNumber !== 1 && sideNumber !== 2) return;
    derived[sideNumber] = definedAttributes({
      matchUpStatus: code.matchUpStatus,
      previousMatchUpStatus: code.previousMatchUpStatus,
      sourceMatchUpId: code.sourceMatchUpId,
    }) as SideExitProvenanceEntry;
  });

  return Object.keys(derived).length ? derived : undefined;
}

/** Whether this matchUp's exit was PRODUCED by upstream propagation rather than played. */
export function exitProducedByPropagation({ matchUp }: { matchUp?: MatchUp }): boolean {
  return !!getSideExitProvenance({ matchUp });
}

/**
 * The outcome code a `matchUpStatusCodes` element should contribute, whatever shape it arrived in.
 *
 * Replaces a coercion that mapped EVERY object element to `OUTCOME_WALKOVER`. Measured over 120
 * randomized sweep scenarios, of the 50 provenance elements that reached that coercion, **13 were
 * BYE and 9 were DEFAULTED** — 44% were not walkovers, and all were relabelled as one and persisted.
 *
 * Nothing caught it because the only oracle exercising this path is a DOUBLE_WALKOVER/DOUBLE_DEFAULT
 * PARITY test that rewrites `"DEFAULTED"` to `"WALKOVER"` and `"DEF"` to `"WO"` before comparing —
 * so a bug forcing that exact convergence is invisible to it. The BYE case is not in the rename pair
 * at all and was simply unasserted.
 *
 * A status with no outcome code — a BYE above all — yields an empty string, which is what the
 * surrounding positional array already uses for "no code on this side". It must NOT become a
 * walkover.
 */
export function exitOutcomeCode(element: any): string {
  if (typeof element === 'string') return element;
  if (!element || typeof element !== 'object') return '';

  // a wrapped code (`{ code }`) or a policy code carries its own string value
  const carried = element.matchUpStatusCode ?? element.code;
  if (typeof carried === 'string') return carried;

  const status = element.matchUpStatus ?? element.previousMatchUpStatus;
  if (status === WALKOVER || status === DOUBLE_WALKOVER) return OUTCOME_WALKOVER;
  if (status === DEFAULTED || status === DOUBLE_DEFAULT) return OUTCOME_DEFAULT;
  if (status === RETIRED) return OUTCOME_RETIREMENT;
  return '';
}
