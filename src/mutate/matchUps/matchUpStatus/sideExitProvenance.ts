import { OUTCOME_DEFAULT, OUTCOME_RETIREMENT, OUTCOME_WALKOVER } from '@Helpers/keyValueScore/constants';
import { writeNativeEnabled } from '@Global/state/globalState';
import { definedAttributes } from '@Tools/definedAttributes';
import { isAnyExit } from '@Validators/isExit';

// constants and types
import { MatchUp, SideExitProvenance, SideExitProvenanceEntry, MatchUpStatusUnion } from '@Types/tournamentTypes';
import {
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
  TO_BE_PLAYED,
  DEFAULTED,
  RETIRED,
  WALKOVER,
  BYE,
} from '@Constants/matchUpStatusConstants';

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
export function producedExitStatus(previousMatchUpStatus?: MatchUpStatusUnion): MatchUpStatusUnion | undefined {
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
  pairedMatchUpStatus?: MatchUpStatusUnion;
  sourceMatchUpStatus?: MatchUpStatusUnion;
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
  // An entry records where a side CAME FROM — it exited upstream, or it won and advanced. What it
  // must never record is a side that has not been decided at all.
  //
  // The paired previous matchUp is frequently still `TO_BE_PLAYED` when this runs, because the other
  // feeder has not been played yet, and that was stamped as
  // `{ matchUpStatus: TO_BE_PLAYED, previousMatchUpStatus: TO_BE_PLAYED }` — provenance asserting an
  // origin for a side that has none. It matters because `isPropagatedExit` reads the mere
  // PRESENCE of provenance, so an undecided side read as propagation-produced.
  //
  // A COMPLETED origin IS recorded, deliberately: `sideExitProvenance.test.ts` pins a double exit
  // meeting a played win, and that opponent's origin is a real fact.
  const isDecided = (status?: string) => !!status && status !== TO_BE_PLAYED;
  const provenance: SideExitProvenance = {
    ...(isDecided(sourceMatchUpStatus)
      ? {
          [sourceSideNumber]: definedAttributes({
            matchUpStatus: producedExitStatus(sourceMatchUpStatus),
            previousMatchUpStatus: sourceMatchUpStatus,
            sourceMatchUpId,
          }) as SideExitProvenanceEntry,
        }
      : {}),
    ...(isDecided(pairedMatchUpStatus)
      ? {
          [pairedSideNumber]: definedAttributes({
            matchUpStatus: producedExitStatus(pairedMatchUpStatus),
            previousMatchUpStatus: pairedMatchUpStatus,
            sourceMatchUpId: pairedMatchUpId,
          }) as SideExitProvenanceEntry,
        }
      : {}),
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
 * `previousMatchUpStatus`, so `isPropagatedExit` reads false and every detector that
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
  previousMatchUpStatus?: MatchUpStatusUnion;
  exitingSideNumber?: number;
  sourceMatchUpId?: string;
  matchUpStatus?: MatchUpStatusUnion;
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
  matchUp.sideExitProvenance = { ...matchUp.sideExitProvenance, ...provenance };
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
 * up as exits with no marker at all, so `isPropagatedExit` reads false and the detectors
 * that exclude a propagation-produced exit fire on legitimate ones.
 *
 * `isAnyExit`, not `isExit` — the double exits are precisely the statuses that stamp provenance.
 *
 * ALL THREE CALL SITES ARE LOAD-BEARING, measured 2026-09-19 by restoring each to an unconditional
 * `clearSideExitProvenance` ONE AT A TIME on `dev` after the unwind was corrected (#4935). The
 * original counts were `removeDirectedLoser` 38 clears, `applyPositionToMatchUp` 9,
 * `applyScoreAndStatus` 10.
 *
 * | site | full suite | census (six arms) | per-step inconsistencies |
 * |---|---|---|---|
 * | `removeDirectedLoser` | 2 failed | — | — |
 * | `applyScoreAndStatus` | 4 failed | — | — |
 * | `applyPositionToMatchUp` | **clean** | **+3 opened** | **+7 started** |
 *
 * **`applyPositionToMatchUp` is the one to be careful about.** Its suite is clean, and on that
 * evidence alone it reads as a redundant workaround left over from before the unwind was fixed. It
 * is not: the 600-seed census opens three seeds and the per-step scan starts seven findings. A suite
 * that stays green is not evidence that a propagation compensation is inert — the census is the
 * instrument that answers this, and it disagreed.
 *
 * See Mentat/planning/SWEEP_20260911_DISCOVERY.md.
 */
export function clearResolvedSideExitProvenance(matchUp?: MatchUp): void {
  // A BYE is not a RESOLVED result, so its record is not stale — CA's ruling that "a BYE is never
  // won" and "in both cases the BYE remains a BYE" (2026-09-20), applied to the record rather than
  // the status. `isAnyExit` excludes BYE, so without this the BYE claim ledger below is wiped by the
  // next placement or score to touch the matchUp, and the unwind is blind again.
  if (!matchUp || isAnyExit(matchUp.matchUpStatus) || matchUp.matchUpStatus === BYE) return;
  clearSideExitProvenance(matchUp);
}

/**
 * Record that `claimantMatchUpId`'s double exit claims a BYE on this side.
 *
 * Called on the ATTEMPT, not the placement. `assignDrawPositionBye` returns early when the position
 * already holds a BYE (`currentAssignment?.bye`, and again on `containsBye`), both above the point
 * where it marks the assignment — so a second claimant places nothing and, recorded at placement
 * time, would be invisible. Measured: the disputed BYE has two claimants in every affected draw
 * type, and it is the second one that decides whether the BYE survives a correction of the first.
 */
export function recordByeClaim({
  claimantMatchUpId,
  sideNumber,
  matchUp,
}: {
  claimantMatchUpId?: string;
  sideNumber?: number;
  matchUp?: MatchUp;
}): void {
  if (!matchUp || !claimantMatchUpId || (sideNumber !== 1 && sideNumber !== 2)) return;
  if (!writeNativeEnabled()) return;

  const provenance: SideExitProvenance = { ...(matchUp.sideExitProvenance ?? {}) };
  const entry: SideExitProvenanceEntry = { ...(provenance[sideNumber] ?? {}) };
  const claims = new Set(entry.byeClaims ?? []);
  claims.add(claimantMatchUpId);
  entry.byeClaims = [...claims];
  provenance[sideNumber] = entry;
  matchUp.sideExitProvenance = provenance;
}

/**
 * Withdraw one matchUp's BYE claim, and drop the record entirely when nothing is left.
 *
 * A ledger that is only ever written accumulates claims that describe nothing, and the first thing
 * that notices is an unwind asserting the record is gone. Withdrawal is what makes the claim a
 * memo of a LIVE relation rather than a growing history.
 */
export function withdrawByeClaim({
  claimantMatchUpId,
  sideNumber,
  matchUp,
}: {
  claimantMatchUpId?: string;
  sideNumber?: number;
  matchUp?: MatchUp;
}): void {
  if (!matchUp || !claimantMatchUpId || (sideNumber !== 1 && sideNumber !== 2)) return;
  const entry = matchUp.sideExitProvenance?.[sideNumber];
  if (!entry?.byeClaims?.length) return;

  const remaining = entry.byeClaims.filter((id) => id !== claimantMatchUpId);
  const provenance: SideExitProvenance = { ...(matchUp.sideExitProvenance ?? {}) };
  if (remaining.length) {
    provenance[sideNumber] = { ...entry, byeClaims: remaining };
  } else {
    const { byeClaims: _dropped, ...withoutClaims } = entry;
    // an entry that held ONLY claims goes with them; one that also describes an exit stays
    if (Object.keys(withoutClaims).length) provenance[sideNumber] = withoutClaims;
    else delete provenance[sideNumber];
  }

  if (Object.keys(provenance).length) matchUp.sideExitProvenance = provenance;
  else delete matchUp.sideExitProvenance;
}

/**
 * Withdraw this matchUp's BYE claims wherever they were recorded.
 *
 * Claims are keyed by IDENTITY, not by coordinate, and they have to be: the onward-advance path
 * records a claim on a DOWNSTREAM matchUp — a BYE that walks — which the unwind never revisits with
 * the drawPosition it was claimed against. Withdrawing only at the coordinate the unwind happens to
 * hold leaves those behind, and a stale claim reads as a live one.
 *
 * This is the same shape as `withdrawProducedExits`, which withdraws exit provenance by
 * `sourceMatchUpId` for the same reason.
 */
export function withdrawByeClaimsFrom({
  claimantMatchUpId,
  matchUps,
}: {
  claimantMatchUpId?: string;
  matchUps?: MatchUp[];
}): void {
  if (!claimantMatchUpId) return;
  for (const matchUp of matchUps ?? []) {
    const provenance = matchUp?.sideExitProvenance;
    if (!provenance) continue;
    for (const sideNumber of [1, 2]) {
      if (provenance[sideNumber]?.byeClaims?.includes(claimantMatchUpId)) {
        withdrawByeClaim({ matchUp, sideNumber, claimantMatchUpId });
      }
    }
  }
}

/**
 * Does any claim on this side survive the withdrawal in progress?
 *
 * A claim survives when its claimant is neither being withdrawn nor has stopped being a double
 * exit. Both halves are needed: `withdrawnSourceIds` is added to on ENTRY to `removeDoubleExit`, so
 * it means "visited", and a visited matchUp whose status has not yet been rewritten still reads as a
 * double exit.
 */
export function byeClaimSurvives({
  withdrawnSourceIds,
  isStillDoubleExit,
  sideNumber,
  matchUp,
}: {
  withdrawnSourceIds?: Set<string>;
  isStillDoubleExit: (matchUpId: string) => boolean;
  sideNumber?: number;
  matchUp?: MatchUp;
}): boolean {
  if (!matchUp || (sideNumber !== 1 && sideNumber !== 2)) return false;
  const claims = matchUp.sideExitProvenance?.[sideNumber]?.byeClaims ?? [];
  return claims.some((claimantMatchUpId) => {
    if (withdrawnSourceIds?.has(claimantMatchUpId)) return false;
    return isStillDoubleExit(claimantMatchUpId);
  });
}

/**
 * Read provenance, preferring the native field and falling back to the legacy array.
 *
 * The fallback exists so a record written before this field — or by a LEGACY-mode writer — still
 * answers. It reads only the provenance SHAPE out of `matchUpStatusCodes`; policy codes and
 * `{ code }` wrappers are not provenance and are ignored.
 *
 * NATIVE WINS WHOLE, deliberately, and this was tried the other way. Merging per side looks
 * strictly more informative — it would recover a side the half-written native field omits — but at
 * the time it was measured the legacy array was BOTH order-dependent and self-inconsistent on the
 * consolation convergence path: one entry order stored `{ matchUpStatus: DEFAULTED,
 * previousMatchUpStatus: DOUBLE_WALKOVER }`, a walkover origin producing a default. Merging imported
 * that corruption into a field which was correct.
 *
 * That corruption is gone at the source — `doubleExitAdvancement` now GENERATES the array from
 * provenance rather than hand-building it, so the two cannot disagree — but native-wins-whole
 * remains the right rule: a record written before the projection landed still carries the old shape,
 * and native is the only structure with an authoritative side key.
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

/**
 * Read provenance from the NATIVE field ALONE.
 *
 * `getSideExitProvenance` falls back to `matchUpStatusCodes`, and that fallback is right for the
 * question *"is this matchUp an exit that came from somewhere"* — a record written before the native
 * field, or by a LEGACY-mode writer, still answers it.
 *
 * It is WRONG for the question an unwind asks: *"did an origin survive THIS withdrawal"*. The legacy
 * array is not rewritten when provenance is withdrawn (see `withdrawFromMatchUp` on why it must not
 * be), so after the native field is cleared the fallback still returns the provenance-shaped
 * elements it held — answering "an origin survived" for a matchUp that has none. Measured: that
 * defeated an earlier attempt at this fix outright.
 *
 * So the two questions get two readers rather than one reader with a flag, and a caller picks by
 * naming which question it is asking. Nothing else about the shared reader changes.
 */
export function getNativeSideExitProvenance({ matchUp }: { matchUp?: MatchUp }): SideExitProvenance | undefined {
  const native = matchUp?.sideExitProvenance;
  return native && Object.keys(native).length ? native : undefined;
}

/**
 * The exit status a side CARRIES into the matchUp its provenance entry sits on.
 *
 * An entry records where a side came from, and not every origin is an exit: `buildSideExitProvenance`
 * deliberately records a `COMPLETED` opponent, because "this side arrived by winning" is a real fact
 * about the convergence. Reading `entry.matchUpStatus` as though it were always an exit status is
 * what wrote `COMPLETED` onto a matchUp in the same call that passed `removeWinningSide: true`,
 * producing `COMPLETED_WITHOUT_WINNING_SIDE` on 41 seeds of one census arm. So the test comes first
 * and the value second.
 *
 * `RETIRED` maps to `WALKOVER`, which is `progressExitStatus`'s own `carryOverMatchUpStatus` rule:
 * a retirement is a result, not something to propagate onward under its own name.
 *
 * Returns undefined when the side did not exit — including when it has no entry at all.
 */
export function carriedExitStatus(entry?: SideExitProvenanceEntry): string | undefined {
  const status = entry?.matchUpStatus;
  if (!isAnyExit(status)) return undefined;
  return status === RETIRED ? WALKOVER : status;
}

/**
 * RE-DERIVE a matchUp's exit state from the provenance that REMAINS on it.
 *
 * The inverse of `progressExitStatus`, and deliberately a mirror of its RULES 2, 3 and 4 rather than
 * a second opinion about them:
 *
 *  - TWO sides carry an exit — RULE 4, the convergence. The matchUp is a double exit and nobody wins
 *    it; WHICH double exit is `collapseDoubleExitStatus`' decision, not a hardcoded
 *    `DOUBLE_WALKOVER`.
 *  - ONE side carries an exit — RULES 2 and 3, which resolve identically. The matchUp holds that
 *    side's carried exit and the OTHER side wins it, whether that side is a present opponent or an
 *    empty slot still waiting for one.
 *  - NO side carries an exit — nothing derived remains, and the matchUp is not this function's to
 *    describe. The caller reverts it.
 *
 * WHY RE-DERIVE RATHER THAN INFER. A partial unwind — withdrawing one of two origins — has to leave
 * the target in the state it was in before the withdrawn origin ever arrived. That state was
 * produced by the forward path from the origins that remain, so replaying that derivation restores
 * it exactly. Six earlier attempts at this fix GUESSED instead (take the surviving exit's status;
 * make the winner the other side) and each broke `DO_UNDO_IDENTITY`, because a guess can agree with
 * the prior state without being derived from the same facts. This is not a weaker form of that
 * property — it is what makes it satisfiable.
 *
 * BYE is NOT decided here. A BYE-held drawPosition reverts to `BYE` whatever provenance survives,
 * and that test reads the positionAssignment rather than any status; it belongs to the caller, which
 * has the structure. `doubleExitUnwindRestoresBye` pins it.
 */
export function deriveExitStateFromProvenance(
  provenance?: SideExitProvenance,
): { matchUpStatus: string; winningSide?: number } | undefined {
  if (!provenance) return undefined;

  const exitingSides = ([1, 2] as const).filter((sideNumber) => carriedExitStatus(provenance[sideNumber]));
  if (!exitingSides.length) return undefined;

  if (exitingSides.length === 2) {
    return { matchUpStatus: collapseDoubleExitStatus(exitingSides.map((s) => carriedExitStatus(provenance[s]))) };
  }

  const exitingSideNumber = exitingSides[0];
  return {
    matchUpStatus: carriedExitStatus(provenance[exitingSideNumber]) as string,
    winningSide: exitingSideNumber === 1 ? 2 : 1,
  };
}

/**
 * The entries of `provenance` whose origin is NOT going away.
 *
 * Identity-keyed, exactly as `withdrawProducedExits` is: an origin is withdrawn because the matchUp
 * that produced it is being unwound, never because of how it looks. An entry naming no source at all
 * is RETAINED — it predates source identity, and dropping it would delete a fact on the strength of
 * its age.
 */
export function retainForeignProvenance(
  provenance: SideExitProvenance | undefined,
  withdrawnSourceIds: Set<string>,
): SideExitProvenance | undefined {
  if (!provenance) return undefined;
  const retained: SideExitProvenance = {};
  for (const sideNumber of [1, 2] as const) {
    const entry = provenance[sideNumber];
    if (!entry) continue;
    if (entry.sourceMatchUpId && withdrawnSourceIds.has(entry.sourceMatchUpId)) continue;
    retained[sideNumber] = entry;
  }
  return Object.keys(retained).length ? retained : undefined;
}

/**
 * The legacy `matchUpStatusCodes` array, GENERATED from provenance.
 *
 * CA, 2026-09-11: *"I don't think we can reasonably build our propagation logic on LEGACY
 * matchUpStatusCodes… we shouldn't try."* The destination that follows from it is that propagation
 * reads and writes `sideExitProvenance` and the legacy array becomes a PROJECTION of it — not a
 * structure anyone parses to decide behaviour.
 *
 * Why a projection removes a whole class of defect rather than one instance of it. The propagation
 * writers used to build the two structures INDEPENDENTLY from whatever each site happened to have in
 * scope, so they could disagree, and did:
 *
 *  - `handleEmptyExitLoser` wrote `{ matchUpStatus: <the arriving exit>, previousMatchUpStatus: <the
 *    CONVERGED status of the target> }` at side 1 — a walkover origin recorded as producing a
 *    default in the mixed case, which is not a fact about either side.
 *  - the same site replaced the array wholesale while provenance ACCUMULATED, so the earlier
 *    arrival's entry survived in one structure and was overwritten in the other.
 *
 * Both are impossible once one structure is a function of the other. Order-invariance and internal
 * consistency are inherited rather than separately maintained.
 *
 * SHAPE. Positional, index 0 = side 1, and BOTH slots are always emitted once there is any
 * provenance at all — which is what the previous builder did and is not cosmetic. A side with no
 * origin yet gets a bare `{ sideNumber }`, and that stub is a RESERVED SLOT, not noise:
 * `updateMatchUpStatusCodes` is the site that learns a side's origin late, and it stamps by mapping
 * over the elements that already exist. Drop the stub and the origin it learns has nowhere to land —
 * measured, as two suite failures, when this projection first padded with `''` instead.
 *
 * `sourceMatchUpId` is deliberately NOT projected. CA decided 2026-09-09 not to add source identity
 * to `matchUpStatusCodes`, which ships on every matchUp; the identity lives in `sideExitProvenance`,
 * whose contents were ours to define from the start.
 */
export function projectExitStatusCodes(provenance?: SideExitProvenance): any[] {
  // An entry that carries ONLY `byeClaims` describes a BYE this cascade claims, not an exit — and
  // the legacy array is the projection of EXIT provenance. Testing mere presence emitted a pair of
  // empty reserved slots (`[{sideNumber:1},{sideNumber:2}]`) onto matchUps that had none, which a
  // clear then left behind: DO_UNDO_IDENTITY failed on six property cells and
  // `byeMeetingAProducedExit` on the same residue.
  const describesExit = (sideNumber: number) =>
    !!(provenance?.[sideNumber]?.matchUpStatus ?? provenance?.[sideNumber]?.previousMatchUpStatus);
  const hasProvenance = [1, 2].some(describesExit);
  if (!hasProvenance) return [];

  return [1, 2].map((sideNumber) =>
    definedAttributes({
      previousMatchUpStatus: provenance?.[sideNumber]?.previousMatchUpStatus,
      matchUpStatus: provenance?.[sideNumber]?.matchUpStatus,
      sideNumber,
    }),
  );
}

/**
 * Whether this matchUp's exit was PRODUCED by upstream propagation rather than played.
 *
 * **A PROVENANCE test, and the counterpart to `isExit`, which is a STATUS test.** CA asked for the
 * split by name, 2026-09-13, for the reason `isDoubleExit` was split out before it: readers reach
 * for the predicate whose name is nearest, and `isExit` is nearest to everything.
 *
 * The two answer different questions and the difference is not cosmetic. `isExit(status)` is true of
 * any `WALKOVER`, `DEFAULTED` or `RETIRED` **however it arose** — one a referee recorded and one the
 * cascade wrote are indistinguishable to it. Every rule that exempts "a pending propagated exit"
 * from a detector, or refuses a mutation "because there is a propagated exit downstream", means THIS
 * predicate and cannot be expressed by that one. `hasPropagatedExitDownstream` spelled its question
 * with `isExit` and refused every undo of an exit the clear would itself have removed — 15 of 15
 * cells across 5 draw types, measured 2026-09-13.
 *
 * The discriminator is `sideExitProvenance`: the cascade stamps it, nothing else does. A matchUp
 * with none was PLAYED.
 *
 * When the question is narrower — "was it produced by THIS matchUp", which is what an undo has to
 * ask — use {@link exitProducedBy}, which additionally requires every side to name that source.
 */
export function isPropagatedExit({ matchUp }: { matchUp?: MatchUp }): boolean {
  return !!getSideExitProvenance({ matchUp });
}

/**
 * @deprecated Use {@link isPropagatedExit}. Retained for one release so an external caller that
 * reached for the old name is not broken silently; it has always been a re-export of the same
 * function, never a second implementation.
 */
export const exitProducedByPropagation = isPropagatedExit;

/**
 * Whether this matchUp's exit is WHOLLY produced by one named source.
 *
 * The question a guard on an undo has to ask. `isPropagatedExit` answers "was this derived
 * at all", which is enough to exempt a matchUp from a detector but not enough to decide whether a
 * particular clear may proceed: the clear can only take back what its own matchUp produced, so an
 * exit that ALSO rests on some other source must still block it.
 *
 * EVERY entry must name the source, not merely one of them. The convergence `progressExitStatus`
 * RULE 4 creates has two carried exits from different upstreams meeting in one matchUp; withdrawing
 * one of them leaves the matchUp an exit on the strength of the other, so the clear would not
 * restore the prior state and must be refused as it always was.
 *
 * An exit with NO provenance returns false — it was played, and nothing upstream is entitled to take
 * it back.
 */
export function exitProducedBy({ sourceMatchUpId, matchUp }: { sourceMatchUpId?: string; matchUp?: MatchUp }): boolean {
  if (!sourceMatchUpId) return false;
  const provenance = getSideExitProvenance({ matchUp });
  if (!provenance) return false;

  const entries = [1, 2].map((sideNumber) => provenance[sideNumber]).filter(Boolean);
  return entries.length > 0 && entries.every((entry: any) => entry.sourceMatchUpId === sourceMatchUpId);
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

/**
 * Withdraw the exits a matchUp PRODUCED, when that matchUp's own result is removed or replaced.
 *
 * This is the inverse of `progressExitStatus` and `doubleExitAdvancement`, and until now it did not
 * exist. Those two write an exit onto a downstream matchUp and stamp `sourceMatchUpId` on the side
 * that carries it; nothing read that stamp back to take the exit away. `removeDirectedLoser`
 * removed the PARTICIPANT from the target's position assignment and rewrote `matchUpStatusCodes`,
 * but left `matchUpStatus` and `winningSide` exactly as the cascade had written them — so the
 * consolation matchUp stayed a WALKOVER, awarded to a side that no longer had an opponent.
 *
 * WHY THAT WENT UNSEEN. `hasPropagatedExitDownstream` refuses the clear outright
 * (`ERR_PROPAGATED_EXITS_DOWNSTREAM`), so the broken unwind was never reached from the TD-facing
 * path. Measured 2026-09-13 over 5 loser-linked draw types × {RETIRED, WALKOVER, DEFAULTED}: the
 * apply succeeds in 15 of 15 and the clear is refused in 15 of 15. Suppressing the refusal alone —
 * the "just make the predicate ask about provenance" fix — permits the clear in all 15 and leaves
 * residue in all 15. **The refusal is load-bearing**: it was standing in for an unwind the engine
 * could not perform. So the unwind comes first and the predicate second.
 *
 * IDENTITY, NOT STATUS. A produced exit is identified by `sourceMatchUpId` matching the matchUp
 * whose result is going away — never by its status, which is indistinguishable from a walkover that
 * was played. This is the whole reason `sideExitProvenance` carries source identity; see
 * {@link isPropagatedExit}.
 *
 * IT CASCADES, because propagation does. A produced exit can itself propagate: B's exit is stamped
 * with A as its source, and the exit B produces at C is stamped with B. Withdrawing A's exit at B
 * therefore makes C's exit sourceless too, so the withdrawal iterates to a fixpoint over the
 * frontier of matchUps it has just reset. Bounded by the number of matchUps in the draw, which is
 * also the longest possible chain.
 *
 * WHAT IT WILL NOT TOUCH. A matchUp with no provenance was PLAYED, and its status is a record of
 * something that happened rather than something derived; it is left alone however it looks. A side
 * whose provenance names a DIFFERENT source is likewise left alone — that exit is still true — and
 * a matchUp retaining such a side keeps its exit status, with only the withdrawn side's entry
 * dropped. That is the convergence case `progressExitStatus` RULE 4 creates, where two carried
 * exits meet.
 *
 * IT DOES NOT RELEASE THE ADVANCEMENT ITSELF, and that omission was measured before it was fixed.
 * A resolved produced exit has a winner who has already advanced into later rounds; resetting the
 * status without pulling that advancement back leaves a participant sitting in a slot they no longer
 * earned, and the next arrival is refused with `ERR_EXISTING_POSITION_ASSIGNMENT` — *after* the
 * mutation has already written, which is an `ERROR_IMPLIES_NO_MUTATION` atomicity violation.
 * Measured over the 600-seed frozen-schedule census: doing only the status reset moved
 * `ERR_ACTIVE_DRAW_POSITION` from 13 to 9 while moving `ERR_EXISTING_POSITION_ASSIGNMENT` from 5 to
 * 9 — one atomicity class traded for another, which is the signature of a half-finished unwind.
 * So each fully-withdrawn matchUp is reported with the drawPosition that needs releasing, and the
 * caller — which owns the structure-level mutation vocabulary — performs the release.
 *
 * Returns one record per matchUp it reset, so a caller can release and emit notices for exactly
 * those.
 */
export type WithdrawnExit = {
  /** the winner's drawPosition, which advanced out of the exit and must be released */
  winnerDrawPosition?: number;
  roundNumber?: number;
  structureId: string;
  matchUpId: string;
};

/**
 * Withdraw one matchUp's entries, if any of them name a source in `sources`.
 *
 * Extracted so `withdrawProducedExits` stays inside the cognitive-complexity budget; it is the
 * whole per-matchUp decision. Returns the withdrawal record when the matchUp reverted to undecided,
 * and `undefined` when it either kept an exit from another source or had nothing to withdraw.
 */
function withdrawFromMatchUp(matchUp: MatchUp, sources: Set<string>, structureId: string): WithdrawnExit | undefined {
  const provenance = getSideExitProvenance({ matchUp });
  if (!provenance) return undefined;

  const retained: SideExitProvenance = {};
  let removedAny = false;
  for (const sideNumber of [1, 2] as const) {
    const entry = provenance[sideNumber];
    if (!entry) continue;
    if (entry.sourceMatchUpId && sources.has(entry.sourceMatchUpId)) removedAny = true;
    else retained[sideNumber] = entry;
  }
  if (!removedAny) return undefined;

  if (Object.keys(retained).length) {
    // A side carried here by a DIFFERENT source is still true, so the matchUp remains an exit and
    // only the withdrawn side's entry is dropped.
    //
    // `matchUpStatusCodes` is deliberately NOT rewritten from the retained provenance here.
    // `projectExitStatusCodes` is a projection of provenance alone, and the legacy array is not only
    // that: it also carries the scoring policy's vocabulary and `{ code }` wrappers, and it carries
    // provenance shapes the native builder refuses to stamp — `buildSideExitProvenance` rejects a
    // `TO_BE_PLAYED` origin as undecided, while a legacy record may hold one. Rewriting wholesale
    // therefore DELETES elements that were never this function's to remove; measured as
    // `sourceMatchUpStatus.test.ts` losing a `previousMatchUpStatus: TO_BE_PLAYED` element that no
    // withdrawal had touched.
    setSideExitProvenance({ provenance: retained, matchUp });
    return undefined;
  }

  // Nothing derived remains: the matchUp reverts to undecided, which is the state it was in before
  // the cascade reached it. Blanking the codes is safe HERE and only here — the matchUp is no longer
  // an exit at all, so no element of that array can still be describing one. It is the same blanking
  // `removeDirectedLoser` already performs one link away.
  //
  // The winner's position is read BEFORE `winningSide` is deleted, because it is the index of the
  // side that was about to advance out of an exit that is no longer happening.
  // Derives a side from drawPosition ORDER — valid only because drawPositions are stored ascending.
  // See the canonical statement in `getOrderedDrawPositions`.
  const winnerDrawPosition = matchUp.winningSide ? matchUp.drawPositions?.[matchUp.winningSide - 1] : undefined;
  clearSideExitProvenance(matchUp);
  matchUp.matchUpStatusCodes = [];
  matchUp.matchUpStatus = TO_BE_PLAYED;
  delete matchUp.winningSide;

  return {
    roundNumber: matchUp.roundNumber,
    matchUpId: matchUp.matchUpId,
    winnerDrawPosition,
    structureId,
  };
}

export function withdrawProducedExits({
  mappedMatchUps,
  sourceMatchUpId,
}: {
  mappedMatchUps?: { [structureId: string]: { matchUps: MatchUp[] } };
  sourceMatchUpId?: string;
}): WithdrawnExit[] {
  if (!sourceMatchUpId || !mappedMatchUps) return [];

  const structureEntries = Object.entries(mappedMatchUps);
  const matchUpCount = structureEntries.reduce((count, [, value]) => count + (value?.matchUps?.length ?? 0), 0);

  const withdrawn: WithdrawnExit[] = [];
  let frontier = [sourceMatchUpId];
  // the chain cannot be longer than the draw, so this is a fixpoint with a structural bound rather
  // than a `while (true)` that trusts the data to terminate
  let guard = matchUpCount + 1;

  while (frontier.length && guard-- > 0) {
    const sources = new Set(frontier);
    frontier = [];

    for (const [structureId, structureMatchUps] of structureEntries) {
      for (const matchUp of structureMatchUps?.matchUps ?? []) {
        const record = withdrawFromMatchUp(matchUp, sources, structureId);
        if (!record) continue;
        withdrawn.push(record);
        // whatever THIS matchUp produced is now sourceless too
        frontier.push(record.matchUpId);
      }
    }
  }

  return withdrawn;
}
