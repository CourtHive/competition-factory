import { OUTCOME_DEFAULT, OUTCOME_RETIREMENT, OUTCOME_WALKOVER } from '@Helpers/keyValueScore/constants';
import { getSideDrawPosition, getWinningSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { writeNativeEnabled } from '@Global/state/globalState';
import { definedAttributes } from '@Tools/definedAttributes';
import { isAnyExit, isDoubleExit } from '@Validators/isExit';

// constants and types
import { MappedMatchUps } from '@Types/factoryTypes';
import {
  DrawDefinition,
  MatchUp,
  SideExitProvenance,
  SideExitProvenanceEntry,
  MatchUpStatusUnion,
} from '@Types/tournamentTypes';
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
export function collapseDoubleExitStatus(sideStatuses: (MatchUpStatusUnion | undefined)[]): MatchUpStatusUnion {
  const known = sideStatuses.filter(Boolean);
  if (!known.length) return DOUBLE_WALKOVER;
  const isDefaultFlavoured = (status?: MatchUpStatusUnion) => status === DEFAULTED || status === DOUBLE_DEFAULT;
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
  const admitted = admissibleOn(matchUp, provenance);
  if (!admitted || !Object.keys(admitted).length) return;
  matchUp.sideExitProvenance = { ...matchUp.sideExitProvenance, ...admitted };
}

/**
 * What a BYE may record about how a side got there — and an ARRIVAL BY RESULT is not among it.
 *
 * **Punch-list P19.** CA, 2026-09-29: *"a BYE should not carry COMPLETED provenance"*, and of the
 * other kind of arrival, agreeing that `BYE -> BYE` *"is legitimate and should stay"* — it records
 * that a BYE arrived from a BYE, which is the rule that two BYEs meeting produce one.
 *
 * So on a BYE an entry is kept when it is a CARRIED EXIT, a BYE arriving through a BYE, or a claim
 * ledger, and dropped when it says the side's occupant got there by winning. That participant
 * advanced THROUGH the BYE; nothing was contested there for their arrival to explain.
 *
 * Traced 2026-09-29 on COMPASS 16/16 with three first-round double exits: `North|1|2` completes, its
 * winner advances into `North|2|1` — already a BYE, holding `[2, _]` — and the placement recorded
 * `{ COMPLETED, previousMatchUpStatus: COMPLETED }` against side 2. 664 matchUp-states across 1,440
 * draws played to exhaustion. When this entry was filed the same shape was recorded as having *"no
 * reproduction on `dev`"*.
 *
 * Decided HERE rather than at each caller because every writer merges through this function, and a
 * rule enforced at one site cannot be missed by the next one that is added.
 */
function admissibleOn(matchUp: MatchUp, provenance?: SideExitProvenance): SideExitProvenance | undefined {
  if (!provenance || matchUp.matchUpStatus !== BYE) return provenance;

  const admitted: SideExitProvenance = {};
  for (const [sideNumber, entry] of Object.entries(provenance)) {
    const arrivedByResult = !!entry?.matchUpStatus && !isAnyExit(entry.matchUpStatus) && entry.matchUpStatus !== BYE;
    if (!arrivedByResult) admitted[Number(sideNumber)] = entry;
  }
  return admitted;
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
  if (!matchUp) return;
  delete matchUp.sideExitProvenance;

  /**
   * P37, ASYMMETRY 2. The clear has to take the PROJECTION with it, or it does not hold.
   *
   * This used to delete the native field alone. `getSideExitProvenance` falls back to the provenance
   * shape inside `matchUpStatusCodes`, so the very next reader RESURRECTED what was just deliberately
   * cleared — and the writers' union is built with that fallback reader on purpose, so the resurrected
   * entry propagated onward. A clear that any subsequent read can undo is not a clear.
   *
   * Only the EXIT tenant goes. `matchUpStatusCodes` also carries the scoring policy's vocabulary, which
   * belongs to the match and has nothing to do with provenance; `withdrawFromMatchUp` blanks the array
   * wholesale one call away and says it is "safe HERE and only here", which is true of the status but
   * has always been careless about the policy codes. Filtering is strictly better than blanking and is
   * why `isProjectedExitCode` exists.
   */
  const codes = matchUp.matchUpStatusCodes as any[] | undefined;
  // Written ONLY when there is an exit element to remove. Assigning unconditionally turned `undefined`
  // into `[]` and mutated matchUps that had nothing to clear, which surfaced as spurious
  // `modifyMatchUpNotice` entries — `teamAdvancement.test.ts` §"does not propagate matchUpStatusCodes
  // from SINGLE/DOUBLES to TEAM matchUps on DOUBLE_WALKOVER" compares the notice list exactly.
  if (codes?.some((code: any) => isProjectedExitCode(code))) {
    matchUp.matchUpStatusCodes = codes.filter((code: any) => !isProjectedExitCode(code));
  }
}

/**
 * The BYE CLAIM ledger alone, with every exit fact dropped.
 *
 * P41. `applyScoreAndStatus` blanks a matchUp via the `toBePlayed` fixture and rescues provenance only
 * when `isAnyExit(matchUpStatus)`, which excludes BYE — so a BYE target lost its whole record, and what
 * carried the facts through that call was the legacy `matchUpStatusCodes` array, which is not blanked.
 *
 * Rescuing the WHOLE record on a BYE is wrong, and that is measured rather than assumed: it keeps exit
 * provenance a BYE must not hold, and produced `DO_UNDO_IDENTITY` on six FIRST_MATCH_LOSER_CONSOLATION
 * property cells plus a fed round *gaining* an origin in `byeHeldCarryPendingFeeder`.
 *
 * What a BYE legitimately keeps is the CLAIM ledger — the same thing `clearResolvedSideExitProvenance`
 * exempts BYE in order to protect, for the reason recorded there: without it "the BYE claim ledger is
 * wiped by the next placement or score to touch the matchUp, and the unwind is blind again". An entry
 * carrying ONLY `byeClaims` describes a BYE this cascade claims, not an exit, which is the same
 * distinction `projectExitStatusCodes` draws.
 */
export function retainByeClaimsOnly(provenance?: SideExitProvenance): SideExitProvenance | undefined {
  if (!provenance) return undefined;
  const retained: SideExitProvenance = {};
  for (const sideNumber of [1, 2] as const) {
    const claims = provenance[sideNumber]?.byeClaims;
    if (claims?.length) retained[sideNumber] = { byeClaims: [...claims] } as SideExitProvenanceEntry;
  }
  return Object.keys(retained).length ? retained : undefined;
}

/**
 * Blank a matchUp's exit reason codes — the legacy positional `matchUpStatusCodes` and the side-keyed
 * `sideStatusCodes` — for a writer that is about to re-derive the exit and re-stamp its codes. Lives
 * here because this file is the legacy array's sanctioned writer (`verify:exit-tenant`). Used by
 * `settleRederivedDoubleExit`: a converged double exit's `['WO', 'WO']` left behind on what is now a
 * single exit put an exit code on the winning side (census w2 9100514, EXIT_CODE_ON_WINNER_SIDE).
 */
export function blankExitCodes(matchUp: MatchUp): void {
  matchUp.matchUpStatusCodes = [];
  delete matchUp.sideStatusCodes;
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
 * Read a matchUp's side-keyed exit provenance.
 *
 * **P37 REMOVED THE LEGACY FALLBACK.** This function used to prefer the native field and, when it was
 * absent, DERIVE provenance from the provenance-shaped elements of `matchUpStatusCodes` — for records
 * written before the native field existed, or by a `LEGACY`-mode writer.
 *
 * CA settled it, 2026-09-27: *"we don't need to carry forward legacy equivalence at this point, and not
 * supporting LEGACY for bugs we are closing with provenance should not be considered a breaking change.
 * Any client that wants the resolutions should be moving to full NATIVE support."* So there is no
 * hydration boundary to negotiate and no cutover to stage: the fallback goes.
 *
 * Three reasons it was load-bearing, and why none of them survives:
 *
 *  - it carried an earlier arrival's origin into the accumulating union at the propagation write sites.
 *    Those sites no longer WRITE the projection, so there is nothing in the array for it to find.
 *  - it defeated an intentional clear. `clearSideExitProvenance` cleared the native field only, and the
 *    very next read resurrected what had just been deliberately removed — the asymmetry that needed
 *    `getNativeSideExitProvenance` to exist as a second reader at all.
 *  - it answered *"is this matchUp an exit that came from somewhere"* for stored 6.x records. That is
 *    now the consumer's problem and it is already handled where it matters: `courthive-components`
 *    renders `sideExitProvenance` first and keeps its OWN `matchUpStatusCodes` fallback for records
 *    written before the field.
 *
 * `getNativeSideExitProvenance` went with it. It existed ONLY to be the fallback-free reader — the two
 * questions *"is this matchUp an exit that came from somewhere"* and *"did an origin survive THIS
 * withdrawal"* needed different answers only because one reader consulted the array. With the array out
 * of it there is one question and one reader, and keeping two names would advertise a distinction that
 * no longer exists.
 *
 * `projectExitStatusCodes` went too. It was what WROTE the exit tenant into `matchUpStatusCodes`, and
 * after the seven write sites moved to {@link deriveStatusCodes} it had no callers at all.
 */
export function getSideExitProvenance({ matchUp }: { matchUp?: MatchUp }): SideExitProvenance | undefined {
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
export function carriedExitStatus(entry?: SideExitProvenanceEntry): MatchUpStatusUnion | undefined {
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
): { matchUpStatus: MatchUpStatusUnion; winningSide?: number } | undefined {
  if (!provenance) return undefined;

  const exitingSides = ([1, 2] as const).filter((sideNumber) => carriedExitStatus(provenance[sideNumber]));
  if (!exitingSides.length) return undefined;

  if (exitingSides.length === 2) {
    return { matchUpStatus: collapseDoubleExitStatus(exitingSides.map((s) => carriedExitStatus(provenance[s]))) };
  }

  const exitingSideNumber = exitingSides[0];
  return {
    matchUpStatus: carriedExitStatus(provenance[exitingSideNumber]) as MatchUpStatusUnion,
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
 * Is this matchUp already part of the exit cascade, and so a place a late-learned origin belongs?
 *
 * **P37's last legacy-array decision read, converted.** Two sites — `drawPositionPlacement` and
 * `removeSubsequentRoundsParticipant` — gated `recordSourceSideProvenance` on
 * `matchUp.matchUpStatusCodes` being truthy. That is the LEGACY array deciding whether the NATIVE record
 * gets written, the inversion class `MATCHUP_STATUS_CODES_PER_SIDE.md` names, and the last one standing.
 *
 * **What the array was standing in for.** Not "has codes" — the field is set to `[]` by every blanking
 * site and by `attemptToSetMatchUpStatusBYE`, so truthiness meant *"some scoring or propagation write has
 * already touched this matchUp"*. Measured over 30 sweep seeds, 854 matchUps: with the gate simply
 * REMOVED, matchUps carrying `sideExitProvenance` went 162 → 202 and those on a matchUp that is neither an
 * exit nor a BYE went 14 → 53. An ordinary advancement was getting an origin stamped on it, and
 * `sideExitProvenance` is PRESENCE-read (**P19**: *"one bad writer silently flips every exclusion"*), so
 * every rule exempting "a matchUp with provenance" began exempting matchUps that were simply played — 58
 * test failures, 54 of them `transitionProperties` cells, none of them about codes.
 *
 * **The three native facts that carry the same meaning**, and each was measured:
 *
 * | condition | failures on the six affected files |
 * |---|---|
 * | no gate at all | 58 |
 * | provenance OR exit/BYE status OR `isAnyExit(sourceMatchUpStatus)` | 19 — the source clause fires on a fresh target the array gate would not have |
 * | **provenance OR exit/BYE status** | **1**, and that one is an IMPROVEMENT |
 *
 * The surviving difference is `correctionDivergence`'s baseline moving the right way:
 * `provenanceOnly` **120 → 0** and `identical` **44 → 164**, with `severe` unchanged at 28. Those 120 cells
 * were ones where the corrected path left a STALE provenance entry the direct path did not have — the
 * array gate was permitting exactly the writes that produced them. So converting this read does not merely
 * remove the last array dependence; it closes 120 cells of CA's re-score invariant.
 *
 * `BYE` is included deliberately: `attemptToSetMatchUpStatusBYE` writes `matchUpStatusCodes = []`, so a BYE
 * matchUp passed the old gate, and CA's rule is that a BYE legitimately carries a claim ledger.
 */
export function participatesInExitCascade({ matchUp }: { matchUp?: MatchUp }): boolean {
  if (getSideExitProvenance({ matchUp })) return true;
  return isAnyExit(matchUp?.matchUpStatus) || matchUp?.matchUpStatus === BYE;
}

/**
 * Place `code` at `sideNumber`'s index, padding earlier slots with `''`.
 *
 * `matchUpStatusCodes` is POSITIONAL: index 0 is side 1. A code for side 2 must be `['', 'W1']` and
 * never `['W1']`, which would mis-map to the opponent. Padding uses `??=` so an existing code is
 * never overwritten by the padding itself.
 *
 * Lifted out of `progressExitStatus` when {@link deriveStatusCodes} gave a second site the same job.
 */
export function placeCodeAtSide(statusCodes: string[], sideNumber: number, code?: string): void {
  if (code === undefined) return;
  const index = sideNumber - 1;
  for (let i = 0; i < index; i++) statusCodes[i] ??= '';
  statusCodes[index] = code;
}

/**
 * The `matchUpStatusCodes` a propagation write should store: the POLICY tenant retained, plus one
 * exit OUTCOME code per side that CARRIES an exit, at that side's index.
 *
 * **P37. This is what replaces the projection.** `projectExitStatusCodes` wrote provenance-shaped
 * OBJECTS into the array, which made the array a second copy of provenance and made every reader of
 * it a reader of provenance. What the array is actually FOR is the positional string contract
 * clients consume and `EXIT_CODE_ON_WINNER_SIDE` polices — `['WO', 'W1']`: the exiting side's outcome
 * code, and the policy vocabulary that refines it.
 *
 * TWO SITES, ONE RULE. Both had their own answer and both were wrong in the same direction:
 *
 *  - `progressExitStatus` re-derived the outcome codes by mapping `exitOutcomeCode` over the array's
 *    PROJECTED elements, so the strings existed only as a side effect of the projection being there.
 *  - `removeDirectedParticipants` wrote the hardcoded pair `['WO', 'WO']` for a `DOUBLE_WALKOVER`
 *    source and `[]` for anything else — positional, asymmetric (a `DOUBLE_DEFAULT` fell through to
 *    `[]`), and blind to which side had actually exited. CA named it on 2026-09-11: *"a hardcoded
 *    legacy string pair… this is propagation logic expressed in the legacy array."* Measured
 *    2026-09-27, it is what `EXIT_CODE_ON_WINNER_SIDE` catches once the projection stops masking it:
 *    `['WO', 'WO']` on a matchUp whose provenance records ONE exiting side, so the winner's slot
 *    carried a walkover code.
 *
 * WHICH SIDE, AND WHETHER AT ALL, is provenance's answer and not a guess. `P41` proposed deriving the
 * value from `sourceMatchUpStatus` and measured 2 `EXIT_CODE_ON_WINNER_SIDE` errors on census 9100583
 * for it, because that puts a code on the ARRIVING side — sometimes the winner. A code belongs on a
 * side iff `carriedExitStatus` says that side exited, which is the reader
 * {@link deriveExitStateFromProvenance} and RULE 4's collapse already use, so the three agree by
 * construction.
 *
 * A policy code already at a side WINS. `W1` is *which* walkover — the more specific statement of the
 * same fact — and `productionStatusCodeSurvival` guards its survival. The two tenants could not
 * collide per side while the projection replaced the array wholesale; they can now.
 *
 * READ AFTER THE CLEAR, and it now holds. Both callers ask *"which sides carry an exit right now"*, and
 * `removeDirectedParticipants` asks it immediately after clearing provenance for an exit it just
 * removed. While `getSideExitProvenance` still fell back to the array, that read resurrected the
 * cleared entry and re-stamped a code for an exit that was gone; the fallback is removed, so there is
 * one reader and it answers the question asked.
 */
export function deriveStatusCodes(matchUp?: MatchUp): string[] {
  const provenance = getSideExitProvenance({ matchUp });
  const codes: string[] = ((matchUp?.matchUpStatusCodes as any[]) ?? [])
    .filter((code: any) => !isProjectedExitCode(code))
    .map(exitOutcomeCode);

  for (const sideNumber of [1, 2] as const) {
    const entry = provenance?.[sideNumber];
    const carried = carriedExitStatus(entry);
    // DELIVERED, NOT MERELY ARRIVED. An entry whose `previousMatchUpStatus` is a DOUBLE exit records
    // an exit the cascade DELIVERED into this side. An entry whose origin is a single exit or a
    // COMPLETED records that this side's occupant ARRIVED HAVING WON one upstream — a fact about the
    // convergence, and not an exit of theirs. The two are already named as provenance's two questions
    // in MATCHUP_STATUS_CODES_PER_SIDE.md, where conflating them reported correct draws as defects at
    // a measured 119 tests.
    //
    // A code for the second kind is a code on the WINNER's side, which is what
    // `EXIT_CODE_ON_WINNER_SIDE` exists to catch: traced 2026-09-27 on a `DEFAULTED` at `Main|1|4`
    // whose side 1 held a real participant and read `{ WALKOVER, previousMatchUpStatus: WALKOVER }` —
    // they won a walkover upstream — while side 2 held the delivered `DOUBLE_DEFAULT`.
    //
    // A SECOND GUARD WAS TRIED AND REFUTED, 2026-09-27: skipping the side that equals
    // `matchUp.winningSide` when the matchUp is a single exit — the write-side form of the rule
    // `EXIT_CODE_ON_WINNER_SIDE` reads. It does not work, because `winningSide` is not settled at
    // derivation time: `progressExitStatus` decides it BELOW this point, and the drawPositions re-sort
    // that the detector judges against happens later still. Measured: the three findings it was aimed
    // at all survived. The side has to come from provenance, which is what this loop does.
    if (!carried || !isDoubleExit(entry?.previousMatchUpStatus) || codes[sideNumber - 1]) continue;
    // THE REASON WINS OVER THE DERIVED OUTCOME CODE, because it already contains it: the policy's
    // display for `DM` is `Def [cond]` and for `DQ` is `Def [dq]`, so emitting `DEF` as well would put
    // two codes where the array has one slot per side. Where no reason was recorded, the outcome code
    // is still the right thing to show. The reason is read from `sideStatusCodes` — side-KEYED — so this
    // projection never consults the array it is building.
    const reason = matchUp?.sideStatusCodes?.[sideNumber];
    placeCodeAtSide(codes, sideNumber, reason ?? exitOutcomeCode({ matchUpStatus: carried }));
  }

  return codes;
}

export function retainPolicyCodes(matchUp?: MatchUp): any[] {
  return ((matchUp?.matchUpStatusCodes as any[]) ?? []).filter((code: any) => !isProjectedExitCode(code));
}

/**
 * The string value of a POLICY `matchUpStatusCodes` element.
 *
 * **P37 narrowed this from three shapes to one.** It used to end `?? code?.matchUpStatus`, which made
 * it read the EXIT tenant too — the projection of `sideExitProvenance` — so the branch below re-sited
 * a carried exit's status positionally in an array that is not where side identity lives.
 *
 * Measured at that branch over the exit-propagation and matchUpStatus suites (2026-09-27, 113
 * arrivals): where the array held anything it was the projected shape, its status equalled provenance
 * in 50 of 50, and in the other 63 the array was ALREADY EMPTY while provenance held the status. The
 * re-siting was redundant where it ran and silently lossy where it did not.
 *
 * MOVED HERE from `drawPositionPlacement`, where it was private, when `assignDrawPositionBye` — that
 * site's twin — needed the same reader. Both re-side the policy code onto the exiting participant, and
 * a second copy of this function is how the two tenants got confused to begin with.
 *
 * What remains is a real job, and the reason this function was not deleted with the rest: the POLICY
 * vocabulary (`POLICY_SCORING_USTA`'s `W1` and friends) belongs to the match, lands on the exiting
 * side, and must still follow that side through the sort. `propagateExitStatus.test.ts` §"FMLC
 * real-match fall-through" pins it, and deleting the re-siting outright left it reading `''`.
 *
 * Shapes read: a bare string, `{ matchUpStatusCode }` (the policy vocabulary), and `{ code }` (a
 * string an earlier `updateMatchUpStatusCodes` wrapped). NOT the provenance shape — callers filter it
 * out with {@link isProjectedExitCode} first, and this function no longer resolves it either, so the
 * eviction holds even if a caller forgets.
 */
export function policyCodeString(code: any): string | undefined {
  if (typeof code === 'string') return code || undefined;
  if (isProjectedExitCode(code)) return undefined;
  return code?.matchUpStatusCode ?? code?.code ?? undefined;
}

/**
 * Whether a `matchUpStatusCodes` element is the EXIT tenant — a projection of provenance, or the
 * reserved slot that stands in for a side whose origin is not known yet.
 *
 * **P37's eviction needs one predicate, in one place.** The array has two tenants and the exit one is
 * leaving: every site that used to rewrite the whole array now has to remove the exit elements and
 * leave the policy vocabulary (`matchUpStatusCode`, and codes `updateMatchUpStatusCodes` wrapped as
 * `{ code }`) untouched. Policy-code survival is a guarded property — see
 * `productionStatusCodeSurvival.test.ts` — and a filter written inline at each site is how the two
 * tenants got confused in the first place.
 *
 * A bare STRING reads as policy, i.e. it survives. Strings are ambiguous: the exit tenant was once
 * written as a bare string by `applyPositionToMatchUp`. Measured over the exit-propagation and
 * matchUpStatus suites (2026-09-27, 113 arrivals at that site): **no string ever reaches it, and no
 * policy code either** — only the projected shape and its stub. So the ambiguity is theoretical, and
 * where it is theoretical the conservative reading is the one that does not destroy a code.
 */
export function isProjectedExitCode(code: any): boolean {
  if (!code || typeof code !== 'object') return false;
  if (code.matchUpStatusCode || code.code) return false;
  return !!(code.matchUpStatus || code.previousMatchUpStatus || code.sideNumber);
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
 * ask — use {@link exitCarriedFrom}, which additionally requires a carried exit to name that source.
 */
export function isPropagatedExit({ matchUp }: { matchUp?: MatchUp }): boolean {
  return getExitSides({ matchUp }).length > 0;
}

/**
 * Whether a DIRECT write would change a matchUp that holds a carried or produced exit.
 *
 * CA, 2026-10-03: such an exit is not a result anybody recorded at this matchUp, so it cannot be
 * re-scored into another result here (a produced WALKOVER recorded as RETIRED 6-3, say) and it cannot be
 * removed here; the correction is made at its ORIGIN, whose clear or re-score re-derives this matchUp.
 * Left open, the re-score was accepted and kept the carried provenance, and clearing the origin later
 * withdrew the exit from under the director's score (census 9000184, UNDECIDED_WITH_SCORE).
 *
 * Only a write that changes nothing passes: the same status, the same winner or none, and no score.
 * The cascade's own writes (`propagatingExit`) are not direct and are never asked. `carriedExit` is
 * `isPropagatedExit` of the stored matchUp: v1 reads it there, v2 from its view.
 */
export function rewritesCarriedExit({
  existingWinningSide,
  existingStatus,
  matchUpStatus,
  carriedExit,
  winningSide,
  score,
}: {
  existingWinningSide?: number;
  existingStatus?: MatchUpStatusUnion;
  matchUpStatus?: MatchUpStatusUnion;
  carriedExit: boolean;
  winningSide?: number;
  score?: any;
}): boolean {
  if (!carriedExit) return false;
  const unchanged =
    matchUpStatus === existingStatus &&
    (!winningSide || winningSide === existingWinningSide) &&
    !checkScoreHasValue({ score });
  return !unchanged;
}

/**
 * The sides of this matchUp that CARRY AN EXIT — read from what each entry says, not from its
 * being there.
 *
 * **Punch-list P19.** `sideExitProvenance` holds three different facts under one key, and only one
 * of them is an exit:
 *
 *  - a CARRIED EXIT — `matchUpStatus` is an exit status; the cascade delivered it to this side;
 *  - an ARRIVAL — `matchUpStatus: COMPLETED` or `BYE`; this side's occupant got here by winning or
 *    by advancing through a BYE, recorded because it is a real fact about a convergence;
 *  - a BYE CLAIM LEDGER — `byeClaims` and nothing else; which double exits claim this BYE.
 *
 * Every reader that asked *"does this matchUp hold a propagated exit"* by testing that the field
 * was non-empty therefore answered yes for all three. Measured 2026-09-29 over 1,440 draws played
 * to exhaustion, every matchUp after every step: of 126,786 matchUp-states carrying provenance,
 * **38,318 carry no exit at all** — 37,654 a claim ledger alone and 664 an arrival alone, every one
 * of them on a `BYE`. The second group is the shape this entry recorded as having *"no reproduction
 * on `dev`"* when it was filed; it has one now (COMPASS 16/16, three first-round double exits,
 * `North|2|1`).
 *
 * A boolean derived from "is this field non-empty" cannot tell a legitimate record from an
 * accidental one, so its correctness rests on every writer in the system forever. This asks the
 * entry what it is.
 */
export function getExitSides({ matchUp }: { matchUp?: MatchUp }): number[] {
  const provenance = getSideExitProvenance({ matchUp });
  if (!provenance) return [];
  return [1, 2].filter((sideNumber) => carriedExitStatus(provenance[sideNumber]) !== undefined);
}

/**
 * Whether one of this matchUp's carried exits came from a named source — the source whose clear is in
 * question.
 *
 * The question a guard on an undo asks. `isPropagatedExit` answers "was this derived at all", which
 * exempts a matchUp from a detector but cannot decide whether a particular clear may proceed: the clear
 * takes back only what its own matchUp produced.
 *
 * ONE entry naming the source is enough (CA, 2026-10-03: *"clearing either origin of a converged
 * DOUBLE_EXIT cannot be refused if there is no downstream active matchUp"*). This asked that EVERY entry
 * name it, on the reasoning that withdrawing one of a convergence's two origins would not restore the
 * prior state. It does: `withdrawProducedExits` is keyed on the source, and what is retained re-derives
 * (`deriveExitStateFromProvenance`) to the single carried exit the matchUp held before the second
 * arrived. Whether anything downstream is ACTIVE is `isActiveDownstream`'s question, asked separately.
 *
 * Judged on EXIT entries only: a BYE claim or an arrival on the other side is not an exit, and the v2
 * pipeline judges its own product the same way. An exit with no provenance returns false — it was
 * played, and nothing upstream is entitled to take it back.
 */
export function exitCarriedFrom({
  sourceMatchUpId,
  matchUp,
}: {
  sourceMatchUpId?: string;
  matchUp?: MatchUp;
}): boolean {
  if (!sourceMatchUpId) return false;
  const provenance = getSideExitProvenance({ matchUp });
  if (!provenance) return false;
  return getExitSides({ matchUp }).some((sideNumber) => provenance[sideNumber]?.sourceMatchUpId === sourceMatchUpId);
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
  /**
   * Set when the matchUp RE-DERIVED from retained provenance rather than reverting to undecided: one
   * of its two origins went away and the other is still true, so it is still an exit — of a different
   * kind. Distinguishes a partial unwind from a full one, which the caller needs because only a
   * partial one can still be producing an exit downstream.
   */
  rederived?: boolean;
  roundNumber?: number;
  structureId: string;
  matchUpId: string;
};

/** Does a BYE hold one of this matchUp's drawPositions? Read from the structure's assignments. */
function holdsBye({
  drawDefinition,
  structureId,
  matchUp,
}: {
  drawDefinition?: DrawDefinition;
  structureId: string;
  matchUp: MatchUp;
}): boolean {
  const structure = drawDefinition?.structures?.find((candidate) => candidate.structureId === structureId);
  const byePositions = structure?.positionAssignments?.filter((a) => a.bye).map((a) => a.drawPosition);
  return !!matchUp.drawPositions?.some((drawPosition) => !!drawPosition && !!byePositions?.includes(drawPosition));
}

/**
 * The entries that record an EXIT on their side, leaving out a participant's own ORIGIN.
 *
 * An entry is also written for a participant who WON their way here from a matchUp decided by an exit, and it
 * carries that matchUp's status: the winner of a DEFAULTED match arrives with `DEFAULTED>DEFAULTED` (P19:
 * provenance records arrivals as well as exits). By status alone it reads as an exit THEY carried, so re-deriving
 * from it after another entry was withdrawn made the winner the defaulter and awarded the match to whoever stood
 * opposite (census w2 9100303, DE 16/11 `Backdraw|3|1`; reached once the entry was keyed to its participant's
 * real side, CA 2026-10-05). Read by identity: a source in this structure whose WINNING position is the position
 * on the entry's side delivered a winner, not an exit.
 */
function withoutWinnersOrigins({
  drawDefinition,
  structureId,
  provenance,
  matchUp,
}: {
  drawDefinition?: DrawDefinition;
  provenance: SideExitProvenance;
  structureId: string;
  matchUp: MatchUp;
}): SideExitProvenance {
  const structure = drawDefinition?.structures?.find((candidate) => candidate.structureId === structureId);
  const exits: SideExitProvenance = {};
  for (const sideNumber of [1, 2] as const) {
    const entry = provenance[sideNumber];
    if (!entry) continue;
    const source = structure?.matchUps?.find((candidate) => candidate.matchUpId === entry.sourceMatchUpId);
    const sourceWinner = source && getWinningSideDrawPosition({ drawDefinition, structureId, matchUp: source });
    const here = getSideDrawPosition({ drawDefinition, structureId, matchUp, sideNumber });
    if (sourceWinner && sourceWinner === here) continue;
    exits[sideNumber] = entry;
  }
  return exits;
}

/**
 * Withdraw one matchUp's entries, if any of them name a source in `sources`.
 *
 * Extracted so `withdrawProducedExits` stays inside the cognitive-complexity budget; it is the
 * whole per-matchUp decision. Returns the withdrawal record when the matchUp reverted to undecided,
 * and `undefined` when it either kept an exit from another source or had nothing to withdraw.
 */
function withdrawFromMatchUp(
  matchUp: MatchUp,
  sources: Set<string>,
  structureId: string,
  drawDefinition?: DrawDefinition,
): WithdrawnExit | undefined {
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

  /**
   * What remains must still CARRY AN EXIT for the matchUp to remain one (P19: provenance also records
   * arrivals and BYE claims, which are not exits). This tested only that something remained, so a
   * WALKOVER whose one carried exit was withdrawn kept its status and winningSide on the strength of a
   * `BYE` arrival entry beside it — and the next participant to arrive took the walkover. Census seed
   * 9300405 (DOUBLE_ELIMINATION 8/5), three steps: the stale DOUBLE_WALKOVER origin at `Backdraw|3|1`
   * was withdrawn by `reconcileStaleExitOrigins`, the side-1 BYE arrival kept the matchUp a WALKOVER,
   * and the flipped Main loser arriving on side 2 was recorded as its winner (EXIT_WITHOUT_LOSER,
   * WINNER_NOT_ADVANCED). Such a matchUp reverts below exactly as one with nothing retained does.
   * A matchUp that is not an exit — a BYE holding only its claim ledger — is not reverted.
   */
  const exitsRetained = withoutWinnersOrigins({ provenance: retained, matchUp, structureId, drawDefinition });
  const retainsAnExit = !!deriveExitStateFromProvenance(exitsRetained) || !isAnyExit(matchUp.matchUpStatus);

  if (Object.keys(retained).length && retainsAnExit) {
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
    // A matchUp holding a BYE stays a BYE whatever provenance survives: `deriveExitStateFromProvenance`
    // leaves that to the caller, which has the structure. Re-deriving it to an exit labelled a BYE
    // matchUp WALKOVER beside the BYE with nobody opposite (CA, 2026-09-20 and 2026-10-02, "the BYE
    // remains a BYE"; caught by v2's held-exit invariant on sweep seed 6161873, where clearing a West
    // result withdrew one side's entry from a South BYE matchUp whose BYE side still carried an exit).
    if (holdsBye({ matchUp, structureId, drawDefinition })) return undefined;
    // STAGE 1 EXPERIMENT: re-derive, and report that the matchUp is no longer a double exit
    const derived = deriveExitStateFromProvenance(exitsRetained);
    if (derived && derived.matchUpStatus !== matchUp.matchUpStatus) {
      // read structurally, as the undecided branch below does: a lone position sits at index 0 whatever its side
      const previousWinnerDrawPosition = getWinningSideDrawPosition({ drawDefinition, structureId, matchUp });
      matchUp.matchUpStatus = derived.matchUpStatus as any;
      if (derived.winningSide) matchUp.winningSide = derived.winningSide;
      else delete matchUp.winningSide;
      return {
        winnerDrawPosition: previousWinnerDrawPosition,
        roundNumber: matchUp.roundNumber,
        matchUpId: matchUp.matchUpId,
        rederived: true,
        structureId,
      };
    }
    return undefined;
  }

  // A BYE matchUp whose last carried entry is withdrawn is still a BYE, for the reason given above; it
  // was never undecided. Census w2 9000477 (COMPASS 32/29): a settled convergence left `South|1|3` a
  // BYE carrying one exit through it, and when that exit's origin became a double exit the withdrawal
  // reverted the BYE to TO_BE_PLAYED, with BYEs on both sides once the double exit's BYE arrived.
  if (holdsBye({ matchUp, structureId, drawDefinition })) {
    clearSideExitProvenance(matchUp);
    matchUp.matchUpStatusCodes = [];
    return { roundNumber: matchUp.roundNumber, matchUpId: matchUp.matchUpId, structureId };
  }

  // Nothing derived remains: the matchUp reverts to undecided, which is the state it was in before
  // the cascade reached it. Blanking the codes is safe HERE and only here — the matchUp is no longer
  // an exit at all, so no element of that array can still be describing one. It is the same blanking
  // `removeDirectedLoser` already performs one link away.
  //
  // The winner's position is read BEFORE `winningSide` is deleted, because it names the side that was
  // about to advance out of an exit that is no longer happening.
  const winnerDrawPosition = getWinningSideDrawPosition({ drawDefinition, structureId, matchUp });
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
  drawDefinition,
}: {
  mappedMatchUps?: MappedMatchUps;
  sourceMatchUpId?: string;
  drawDefinition?: DrawDefinition;
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
        const record = withdrawFromMatchUp(matchUp, sources, structureId, drawDefinition);
        if (!record) continue;
        const { rederived } = record;
        withdrawn.push(record);
        /**
         * A matchUp that reverted to undecided produces no exit, so every carried exit it stamped is
         * void and the cascade continues through it.
         *
         * A RE-DERIVED one is NOT decided here. It is still an exit — of a different kind — and whether
         * it still PRODUCES one downstream turns on whether its new winning side is occupied, which is
         * not yet settled at this point in the mutation. `reconcileStaleExitOrigins` asks that at the end
         * of `setMatchUpStatus`, once the draw has settled, and continues the cascade from the ones that
         * now deliver an advancement (#5018).
         */
        if (!rederived) frontier.push(record.matchUpId);
      }
    }
  }

  return withdrawn;
}
