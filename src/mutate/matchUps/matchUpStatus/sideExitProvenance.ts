import { OUTCOME_DEFAULT, OUTCOME_RETIREMENT, OUTCOME_WALKOVER } from '@Helpers/keyValueScore/constants';
import { writeNativeEnabled } from '@Global/state/globalState';
import { definedAttributes } from '@Tools/definedAttributes';
import { isAnyExit } from '@Validators/isExit';

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

/**
 * What a matchUp PRODUCES downstream, given the status that produced it.
 *
 * A UNIFORM double exit produces its own flavour: `DOUBLE_WALKOVER` produces `WALKOVER`,
 * `DOUBLE_DEFAULT` produces `DEFAULTED`. CA, 2026-09-12: *"a DOUBLE_DEFAULT producing a side record
 * DEF sounds right, the same as a DOUBLE_WALKOVER producing a WO / WALKOVER sounds right."*
 *
 * The unattributed case is a MIXED convergence, and it is decided upstream of this function by
 * `collapseDoubleExitStatus` — when two exits of differing origin meet, the converged matchUp is a
 * `DOUBLE_WALKOVER`, so what it produces here is a `WALKOVER`. CA: *"a WALKOVER and a DEFAULT would
 * produce a WALKOVER, not a DEF."* That is where the "not attributable to any upstream individual"
 * rule lives; this mapping stays a faithful per-flavour projection.
 */
export function producedExitStatus(previousMatchUpStatus?: string): string | undefined {
  if (previousMatchUpStatus === DOUBLE_WALKOVER) return WALKOVER;
  if (previousMatchUpStatus === DOUBLE_DEFAULT) return DEFAULTED;
  return previousMatchUpStatus;
}

/**
 * The status for a matchUp where two exits MEET, from the exits each side carried.
 *
 * CA, 2026-09-12: *"a WALKOVER and a DEFAULT would produce a WALKOVER, not a DEF… and a
 * DOUBLE_WALKOVER and a DOUBLE_DEFAULT producing a WALKOVER and a DEFAULT would produce a
 * WALKOVER."* So a convergence is `DOUBLE_DEFAULT` only when EVERY side's exit is default-flavoured;
 * any mixture collapses to `DOUBLE_WALKOVER`.
 *
 * The asymmetry is deliberate and is about not attributing a ruling to someone it was not made
 * about. `DOUBLE_DEFAULT` propagates `DEFAULTED` onward (see `producedExitStatus`), and a default is
 * a referee's finding against a named player. In a mixed convergence one side merely failed to
 * appear, so the weaker claim — "did not play" — is the only one true of both, and it is the one
 * that must survive the collapse into a single field. Choosing the stronger claim would put a `DEF`
 * badge beside an innocent participant's name: `courthive-components`
 * `renderParticipant.ts:113`/`:48` render this matchUp-level status per PARTICIPANT via
 * `renderStatusPill`.
 *
 * `RETIRED` is not default-flavoured, which matches `carryOverMatchUpStatus`'s existing decision to
 * carry a retirement forward as a `WALKOVER`.
 *
 * Takes the statuses as ARGUMENTS rather than reading provenance: provenance writes are gated on
 * `writeNativeEnabled()`, so under LEGACY mode there would be nothing to read.
 */
export function collapseDoubleExitStatus(sideStatuses: (string | undefined)[]): string {
  const known = sideStatuses.filter(Boolean);
  if (!known.length) return DOUBLE_WALKOVER;
  const isDefaultFlavoured = (status?: string) => status === DEFAULTED || status === DOUBLE_DEFAULT;
  return known.every(isDefaultFlavoured) ? DOUBLE_DEFAULT : DOUBLE_WALKOVER;
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

/**
 * Provenance for the ONE side that exited, when an exit is CARRIED into a fed matchUp.
 *
 * `buildSideExitProvenance` above describes a target fed by a DOUBLE exit, where both sides are
 * accounted for by a single call. A carried exit is the other half of the propagation story:
 * `directLoser` feeds one exiting participant into a consolation slot and `progressExitStatus`
 * stamps the status onto that matchUp. Only that participant's side has a provenance — the
 * opponent arrived by winning, not by exiting, and giving them an entry would misattribute the
 * exit.
 *
 * Without this, a carried exit is marked ONLY by a string in `matchUpStatusCodes`, which carries no
 * `previousMatchUpStatus`, so `exitProducedByPropagation` reads false and every detector that
 * excludes propagation-produced exits (`EXIT_WITHOUT_LOSER`, `DROPPED_PROGRESSION`) fires on a
 * legitimate pending exit. Measured 2026-09-11: 13 of the 27 offending matchUps behind the sweep's
 * 21 triaged seeds are this shape.
 */
export function buildCarriedExitProvenance({
  previousMatchUpStatus,
  exitingSideNumber,
  sourceMatchUpId,
  matchUpStatus,
}: {
  previousMatchUpStatus?: string;
  exitingSideNumber?: number;
  sourceMatchUpId?: string;
  matchUpStatus?: string;
}): SideExitProvenance | undefined {
  if (exitingSideNumber !== 1 && exitingSideNumber !== 2) return undefined;

  const entry = definedAttributes({
    matchUpStatus: producedExitStatus(matchUpStatus),
    previousMatchUpStatus,
    sourceMatchUpId,
  }) as SideExitProvenanceEntry;

  return Object.keys(entry).length ? { [exitingSideNumber]: entry } : undefined;
}

/**
 * Merge one side's provenance into whatever the matchUp already carries.
 *
 * `setSideExitProvenance` REPLACES, which is correct for a double exit: one call describes both
 * sides. A carried exit describes one side at a time and can reach a matchUp whose OTHER side was
 * stamped by an earlier propagation — `progressExitStatus` RULE 4, where two carried exits meet and
 * become a DOUBLE_WALKOVER. Replacing there would discard a still-true entry.
 */
export function mergeSideExitProvenance({
  provenance,
  matchUp,
}: {
  provenance?: SideExitProvenance;
  matchUp?: MatchUp;
}): void {
  if (!matchUp || !writeNativeEnabled()) return;
  if (!provenance || !Object.keys(provenance).length) return;
  matchUp.sideExitProvenance = { ...(matchUp.sideExitProvenance ?? {}), ...provenance };
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
 * Clear provenance ONLY when the matchUp is no longer an exit.
 *
 * `clearSideExitProvenance` is unconditional, which is right where the caller has just collapsed the
 * status — clearing a position, or writing a BYE. It is WRONG as an opportunistic clear, and it was
 * being used as one.
 *
 * `attemptToModifyScore` coerces an absent `matchUpStatusCodes` to `[]`, so `[]` means both "blank
 * the codes" and "the caller supplied none". Reading the second as the first wipes provenance off a
 * matchUp that is still the exit that provenance describes. Measured 2026-09-11 across the draws
 * behind the 21 triaged sweep seeds: **63 clears, 51 of them leaving the matchUp still an exit** —
 * `removeDirectedLoser` 38, `applyPositionToMatchUp` 9, `applyScoreAndStatus` 10. Those matchUps end
 * up as exits with no marker at all, so `exitProducedByPropagation` reads false and the detectors
 * that exclude a propagation-produced exit fire on legitimate ones.
 *
 * `isAnyExit`, not `isExit` — the double exits are precisely the statuses that stamp provenance.
 *
 * See Mentat/planning/SWEEP_20260911_DISCOVERY.md.
 */
export function clearResolvedSideExitProvenance(matchUp?: MatchUp): void {
  if (!matchUp || isAnyExit(matchUp.matchUpStatus)) return;
  clearSideExitProvenance(matchUp);
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
