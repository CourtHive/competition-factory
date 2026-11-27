import { arrivedByResult, carriedExitStatus, getSideExitProvenance } from '@Helpers/drawTopology/sideExitProvenance';
import { getSideDrawPosition, getWinningSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { cameDownLoserLink } from '@Mutate/matchUps/drawPositions/cameDownLoserLink';
import { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
import { writeNativeEnabled } from '@Global/state/globalState';
import { isAnyExit, isDoubleExit } from '@Validators/isExit';
import { definedAttributes } from '@Tools/definedAttributes';

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
  WALKOVER,
  BYE,
} from '@Constants/matchUpStatusConstants';

/**
 * Paired writer/reader for `matchUp.sideExitProvenance`: which side exited, and the exit that produced it, keyed by
 * `sideNumber`, in one fixed shape, carrying `sourceMatchUpId`.
 *
 * WRITE MODE. Native writes are gated on `writeNativeEnabled()` (true for NATIVE and BRIDGE), so the field follows the
 * same switch as the other CODES first-class transitions.
 */

/**
 * What a matchUp PRODUCES downstream, given the status that produced it.
 *
 * A UNIFORM double exit produces its own flavour: `DOUBLE_WALKOVER` produces `WALKOVER`,
 * `DOUBLE_DEFAULT` produces `DEFAULTED`: a DOUBLE_DEFAULT produces a side record DEF, just as a
 * DOUBLE_WALKOVER produces a WO / WALKOVER.
 *
 * The unattributed case is a MIXED convergence, and it is decided upstream of this function by
 * `collapseDoubleExitStatus` — when two exits of differing origin meet, the converged matchUp is a
 * `DOUBLE_WALKOVER`, so what it produces here is a `WALKOVER`: a WALKOVER and a DEFAULT produce a
 * WALKOVER, not a DEF. That is where the "not attributable to any upstream individual"
 * rule lives; this mapping stays a faithful per-flavour projection.
 */
export function producedExitStatus(previousMatchUpStatus?: MatchUpStatusUnion): MatchUpStatusUnion | undefined {
  if (previousMatchUpStatus === DOUBLE_WALKOVER) return WALKOVER;
  if (previousMatchUpStatus === DOUBLE_DEFAULT) return DEFAULTED;
  return previousMatchUpStatus;
}

/**
 * Does an origin that ended this way DECIDE something for the side it feeds?
 *
 * A double exit does: nobody arrives, and the exit it produced stands pending on that side. A BYE does: the side
 * holds a BYE. A played result or a single exit does NOT: its winner arrived and is waiting, so the entry records
 * the origin (`previousMatchUpStatus`) and no `matchUpStatus`: nothing was decided when they arrived, they were
 * just waiting.
 */
export function decidesForTheSide(previousMatchUpStatus?: MatchUpStatusUnion): boolean {
  return isDoubleExit(previousMatchUpStatus) || previousMatchUpStatus === BYE;
}

/**
 * The status for a matchUp where two exits MEET, from the exits each side carried.
 *
 * A WALKOVER and a DEFAULT produce a WALKOVER, not a DEF, and a DOUBLE_WALKOVER and a DOUBLE_DEFAULT,
 * producing a WALKOVER and a DEFAULT, produce a WALKOVER. So a convergence is `DOUBLE_DEFAULT` only
 * when EVERY side's exit is default-flavoured;
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
  //
  // `matchUpStatus` is what was decided on the side (`decidesForTheSide`). A side whose origin was a played or
  // single-exit result ARRIVED: its participant won that matchUp and is waiting here, so the entry carries the
  // origin and no status. Writing `producedExitStatus(origin)` for an arrival made "won a
  // DEFAULTED" the same entry as "lost a DEFAULTED and carried the exit", and `carriedExitStatus` read both as
  // an exit.
  const isDecided = (status?: string) => !!status && status !== TO_BE_PLAYED;
  const decidedStatus = (status?: MatchUpStatusUnion) =>
    decidesForTheSide(status) ? producedExitStatus(status) : undefined;
  const provenance: SideExitProvenance = {
    ...(isDecided(sourceMatchUpStatus)
      ? {
          [sourceSideNumber]: definedAttributes({
            matchUpStatus: decidedStatus(sourceMatchUpStatus),
            previousMatchUpStatus: sourceMatchUpStatus,
            sourceMatchUpId,
          }) as SideExitProvenanceEntry,
        }
      : {}),
    ...(isDecided(pairedMatchUpStatus)
      ? {
          [pairedSideNumber]: definedAttributes({
            matchUpStatus: decidedStatus(pairedMatchUpStatus),
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
 *
 * Returns whether it wrote, so a caller that writes outside a notice-emitting path can announce the
 * matchUp it changed and only that one.
 */
export function mergeSideExitProvenance({
  provenance,
  matchUp,
}: {
  provenance?: SideExitProvenance;
  matchUp?: MatchUp;
}): boolean {
  if (!matchUp || !writeNativeEnabled()) return false;
  const admitted = admissibleOn(matchUp, provenance);
  if (!admitted || !Object.keys(admitted).length) return false;
  matchUp.sideExitProvenance = { ...matchUp.sideExitProvenance, ...admitted };
  return true;
}

/**
 * What a BYE may record about how a side got there — and an ARRIVAL BY RESULT is not among it.
 *
 * A BYE does not carry COMPLETED provenance. The other kind of arrival, `BYE -> BYE`, is legitimate
 * and stays — it records that a BYE arrived from a BYE, which is the rule that two BYEs meeting
 * produce one.
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
    if (!arrivedByResult(entry)) admitted[Number(sideNumber)] = entry;
  }
  return admitted;
}

/**
 * Take back the arrival record a feeder left on a matchUp, when the position it delivered leaves.
 *
 * An arrival (`arrivedByResult`) records that a side's occupant won their way here from `sourceMatchUpId`; it is a
 * fact about that position being here, so it goes when the position is released, whichever side the record is keyed
 * to by then. So does a BYE origin (`{ BYE, BYE }`) naming the same feeder: it records that the position came here
 * through that BYE, and once the position is gone it names a feeder that sent nobody, or one that is no longer a BYE
 * (census A1 int2 `aReleasedPositionTakesItsByeOriginWithIt`). A BYE claim on the same side stays: it is the ledger, not
 * the arrival (`withdrawArrivalsByResult`). Not gated on the write mode: the write mode decides whether a record is written, never whether a stale one goes.
 */
export function withdrawArrivalFrom({ sourceMatchUpId, matchUp }: { sourceMatchUpId?: string; matchUp: MatchUp }) {
  const provenance = matchUp.sideExitProvenance;
  if (!sourceMatchUpId || !provenance) return;
  for (const sideNumber of [1, 2] as const) {
    const entry = provenance[sideNumber];
    const originOfPosition = arrivedByResult(entry) || entry?.matchUpStatus === BYE;
    if (entry?.sourceMatchUpId !== sourceMatchUpId || !originOfPosition) continue;
    delete provenance[sideNumber];
  }
  if (!Object.keys(provenance).length) delete matchUp.sideExitProvenance;
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
 * A source re-scored with the SAME winner rewrites the arrival that winner left onward.
 *
 * An arrival entry (`previousMatchUpStatus` and no exit status: the side won its way here) is written once, when the
 * winner lands. A re-score that keeps the winner re-directs into the seat they already hold, so nothing rewrote it,
 * and a DEFAULTED win corrected to a played one still read DEFAULTED onward: an exit code on the winning side of the
 * produced exit it arrived at (census policy-off 20500008, COMPASS 16/16 `West|2|2`), where the same result entered
 * directly reads COMPLETED. Only arrivals are touched: a carried exit naming this source is the LOSER's, and is
 * settled by the relabel of the exit it carries.
 */
export function refreshArrivalsFrom({
  matchUpStatus,
  matchUpId,
  matchUps,
}: {
  matchUpStatus?: MatchUpStatusUnion;
  matchUps?: MatchUp[];
  matchUpId?: string;
}): MatchUp[] {
  const refreshed: MatchUp[] = [];
  if (!matchUpId || !matchUpStatus || !writeNativeEnabled()) return refreshed;
  for (const matchUp of matchUps ?? []) {
    const provenance = matchUp.sideExitProvenance;
    if (!provenance) continue;
    for (const sideNumber of [1, 2] as const) {
      const entry = provenance[sideNumber];
      if (entry?.sourceMatchUpId !== matchUpId || carriedExitStatus(entry) || !entry.previousMatchUpStatus) continue;
      if (entry.previousMatchUpStatus === matchUpStatus) continue;
      entry.previousMatchUpStatus = matchUpStatus;
      if (!refreshed.includes(matchUp)) refreshed.push(matchUp);
    }
  }
  // written in place, so no write announces them: the caller does
  return refreshed;
}

/**
 * Remove provenance from a matchUp.
 *
 * NOT gated on the write mode. Every site that unwinds an exit must also clear this, or an unwound matchUp keeps
 * provenance for an exit that no longer exists — a do/undo residue. The write mode decides whether the field is
 * WRITTEN; it must never decide whether stale state is removed.
 */
export function clearSideExitProvenance(matchUp?: MatchUp): void {
  if (!matchUp) return;
  delete matchUp.sideExitProvenance;
}

/**
 * Blank a matchUp's exit reason codes (`sideStatusCodes`) for a writer that is about to re-derive the exit. Used by
 * `settleRederivedDoubleExit`: a converged double exit's reasons left behind on what is now a single exit put a
 * reason on the winning side (census w2 9100514).
 */
export function blankExitCodes(matchUp: MatchUp): void {
  delete matchUp.sideStatusCodes;
}

/**
 * Blank ONE side's exit reason code, for a side whose exit was withdrawn while the other side's still stands. The
 * kept exit's reason stays where it is (`aWithdrawnExitTakesItsCode`).
 */
export function blankSideExitCode(matchUp: MatchUp, sideNumber: number): void {
  const sideCodes = matchUp.sideStatusCodes;
  if (sideCodes?.[sideNumber] === undefined) return;
  delete sideCodes[sideNumber];
  if (!Object.keys(sideCodes).length) delete matchUp.sideStatusCodes;
}

/**
 * Clear provenance ONLY when the matchUp is no longer an exit.
 *
 * `clearSideExitProvenance` is unconditional, which is right where the caller has just collapsed the
 * status — clearing a position, or writing a BYE. It is WRONG as an opportunistic clear, and it was
 * being used as one.
 *
 * Used as an opportunistic clear it wipes provenance off a matchUp that is still the exit that provenance
 * describes. Measured 2026-09-11 across the draws
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
 */
export function clearResolvedSideExitProvenance(matchUp?: MatchUp): void {
  // A BYE is not a RESOLVED result, so its record is not stale — the rule that a BYE is never
  // won and that in both cases the BYE remains a BYE, applied to the record rather than
  // the status. `isAnyExit` excludes BYE, so without this the BYE claim ledger below is wiped by the
  // next placement or score to touch the matchUp, and the unwind is blind again.
  if (!matchUp || isAnyExit(matchUp.matchUpStatus) || matchUp.matchUpStatus === BYE) return;
  clearSideExitProvenance(matchUp);
}

/**
 * What a matchUp's side record holds: its exit provenance and its reasons. Compared before and after a write that no
 * state write announces, so the caller announces the matchUp only when the write changed it.
 */
export function sideRecordOf(matchUp?: MatchUp): string {
  return JSON.stringify([matchUp?.sideExitProvenance, matchUp?.sideStatusCodes, matchUp?.matchUpStatusCode]);
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
 * **The exit tenant's last legacy-array decision read, converted.** Two sites — `drawPositionPlacement` and
 * `removeSubsequentRoundsParticipant` — gated `recordSourceSideProvenance` on
 * `matchUp.matchUpStatusCodes` being truthy. That is the LEGACY array deciding whether the NATIVE record
 * gets written, the inversion class `MATCHUP_STATUS_CODES_PER_SIDE.md` names, and the last one standing.
 *
 * **What the array was standing in for.** Not "has codes" — the field is set to `[]` by every blanking
 * site and by `attemptToSetMatchUpStatusBYE`, so truthiness meant *"some scoring or propagation write has
 * already touched this matchUp"*. Measured over 30 sweep seeds, 854 matchUps: with the gate simply
 * REMOVED, matchUps carrying `sideExitProvenance` went 162 → 202 and those on a matchUp that is neither an
 * exit nor a BYE went 14 → 53. An ordinary advancement was getting an origin stamped on it, and
 * `sideExitProvenance` is PRESENCE-read (*"one bad writer silently flips every exclusion"*), so
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
 * remove the last array dependence; it closes 120 cells of the re-score invariant.
 *
 * `BYE` is included deliberately: a BYE legitimately carries a claim ledger.
 */
export function participatesInExitCascade({ matchUp }: { matchUp?: MatchUp }): boolean {
  if (getSideExitProvenance({ matchUp })) return true;
  return isAnyExit(matchUp?.matchUpStatus) || matchUp?.matchUpStatus === BYE;
}

/**
 * Whether a DIRECT write would change a matchUp that holds a carried or produced exit.
 *
 * Such an exit is not a result anybody recorded at this matchUp, so it cannot be
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

/** The single exit a re-derivation leaves was PRODUCED by a double exit, and the seat it would award holds nobody. */
function awardsEmptySeat({
  drawDefinition,
  exitsRetained,
  structureId,
  derived,
  matchUp,
}: {
  derived: { winningSide?: number };
  exitsRetained: SideExitProvenance;
  drawDefinition?: DrawDefinition;
  structureId: string;
  matchUp: MatchUp;
}): boolean {
  const winningSide = derived.winningSide as 1 | 2;
  const exitEntry = exitsRetained[(3 - winningSide) as 1 | 2];
  if (!isDoubleExit(exitEntry?.previousMatchUpStatus)) return false;
  // ...but one that came straight down its source's LOSER link keeps its award to the seat that will receive the next
  // arrival, as direct entry writes it and as `positionClear`'s `awardStands` keeps it ("A convergence a correction
  // dissolves settles as the kept exit alone would leave it", exit-propagation.md). Taken back here, a dissolved
  // convergence left that exit pending and its reservation unmade, where entering the same results once each, in any
  // order, awards it (census A1 R9, COMPASS 32/31 policy-off 20551581: `South|1|3`, and `South|2|2`'s dp 6)
  if (
    drawDefinition &&
    cameDownLoserLink({ drawDefinition, targetMatchUp: matchUp, sourceMatchUpId: exitEntry?.sourceMatchUpId })
  )
    return false;
  const structure = drawDefinition?.structures?.find((candidate) => candidate.structureId === structureId);
  const seat = getSideDrawPosition({ drawDefinition, structureId, matchUp, sideNumber: winningSide });
  return !positionAssignmentsOf(structure)?.find((assignment) => assignment.drawPosition === seat)?.participantId;
}

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
  const byePositions = positionAssignmentsOf(structure)
    ?.filter((a) => a.bye)
    .map((a) => a.drawPosition);
  return !!matchUp.drawPositions?.some((drawPosition) => !!drawPosition && !!byePositions?.includes(drawPosition));
}

/**
 * The entries that record an EXIT on their side, leaving out a participant's own ORIGIN.
 *
 * An entry is also written for a participant who WON their way here from a matchUp decided by an exit, and it
 * carries that matchUp's status: the winner of a DEFAULTED match arrives with `DEFAULTED>DEFAULTED` (provenance
 * records arrivals as well as exits). By status alone it reads as an exit THEY carried, so re-deriving
 * from it after another entry was withdrawn made the winner the defaulter and awarded the match to whoever stood
 * opposite (census w2 9100303, DE 16/11 `Backdraw|3|1`; reached once the entry was keyed to its participant's
 * real side). Read by identity: a source in this structure whose WINNING position is the position
 * on the entry's side delivered a winner, not an exit.
 */
export function withoutWinnersOrigins({
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
    const source = matchUpsOf(structure)?.find((candidate) => candidate.matchUpId === entry.sourceMatchUpId);
    const sourceWinner = source && getWinningSideDrawPosition({ drawDefinition, structureId, matchUp: source });
    const here = getSideDrawPosition({ drawDefinition, structureId, matchUp, sideNumber });
    if (sourceWinner && sourceWinner === here) continue;
    exits[sideNumber] = entry;
  }
  return exits;
}

/**
 * Withdraw ONE matchUp's entries naming `sourceMatchUpId`, leaving the source's other entries alone.
 *
 * `withdrawProducedExits` withdraws every entry a source stamped, which is right when the source stops
 * producing an exit. A RELAYED entry can go stale while its source still produces one: the exit was carried
 * past a BYE (`doubleExitAdvancement`'s `carryExitOnward`, which keeps the origin's id across every hop), and
 * the BYE has since gone. The entry where the exit now rests is still true; the one beyond it is not.
 */
export function withdrawRelayedExit({
  sourceMatchUpId,
  drawDefinition,
  structureId,
  matchUp,
}: {
  drawDefinition?: DrawDefinition;
  sourceMatchUpId: string;
  structureId: string;
  matchUp: MatchUp;
}): WithdrawnExit[] {
  const record = withdrawFromMatchUp(matchUp, new Set([sourceMatchUpId]), structureId, drawDefinition);
  return record ? [record] : [];
}

/** Split a matchUp's provenance into the entries a withdrawal keeps and whether it removed any, or any exit. */
function splitWithdrawnEntries(provenance: SideExitProvenance, sources: Set<string>) {
  const retained: SideExitProvenance = {};
  let removedAny = false;
  let removedAnExit = false;
  for (const sideNumber of [1, 2] as const) {
    const entry = provenance[sideNumber];
    if (!entry) continue;
    if (entry.sourceMatchUpId && sources.has(entry.sourceMatchUpId)) {
      removedAny = true;
      if (isAnyExit(entry.matchUpStatus)) removedAnExit = true;
    } else retained[sideNumber] = entry;
  }
  return { retained, removedAny, removedAnExit };
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

  const { retained, removedAny, removedAnExit } = splitWithdrawnEntries(provenance, sources);
  if (!removedAny) return undefined;

  /**
   * What remains must still CARRY AN EXIT for the matchUp to remain one (provenance also records
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

  // On a BYE matchUp a BYE-status entry only ever accompanies a carried exit (the convergence that relays an exit past
  // the BYE records both sides). With every exit gone it describes nothing: the matchUp is simply a BYE again, as forward
  // play leaves it, and is handled as the last carried entry withdrawn below (census run-17 baseline, DOUBLE_ELIMINATION
  // 8/5 seed 20622028, policy off: `Backdraw|3|1` kept `{2: BYE from Backdraw|2|2}` after the exit it relayed went).
  const onlyByeEntriesLeft =
    holdsBye({ matchUp, structureId, drawDefinition }) &&
    Object.values(retained).every((entry) => entry?.matchUpStatus === BYE);

  if (Object.keys(retained).length && retainsAnExit && !onlyByeEntriesLeft) {
    // A side carried here by a DIFFERENT source is still true, so the matchUp remains an exit and
    // only the withdrawn side's entry is dropped.

    setSideExitProvenance({ provenance: retained, matchUp });
    // A matchUp holding a BYE stays a BYE whatever provenance survives: `deriveExitStateFromProvenance`
    // leaves that to the caller, which has the structure. Re-deriving it to an exit labelled a BYE
    // matchUp WALKOVER beside the BYE with nobody opposite (the BYE remains a BYE;
    // caught by v2's held-exit invariant on sweep seed 6161873, where clearing a West
    // result withdrew one side's entry from a South BYE matchUp whose BYE side still carried an exit).
    //
    // It stays a BYE, and when nothing retained carries an exit the withdrawal is still REPORTED: a pending produced
    // exit advances the empty seat opposite it as a reservation (`doubleExitAdvancement`, `yieldSquattingPropagatedBye`
    // names the shape), and a BYE then landing in that seat does not make the reservation the BYE's own. Returned
    // nothing, the exit went and the reservation stood (census 20178071, FEED_IN_CHAMPIONSHIP 8/7: `Consolation|2|2`'s
    // produced walkover was withdrawn with the convergence that produced it, and the BYE that had since taken dp 3
    // stayed advanced in `3|1`, which then met the carrier coming through — TWO_POSITIONS_FROM_ONE_FEEDER).
    if (holdsBye({ matchUp, structureId, drawDefinition })) {
      if (deriveExitStateFromProvenance(exitsRetained)) return undefined;
      return { roundNumber: matchUp.roundNumber, matchUpId: matchUp.matchUpId, structureId };
    }
    // STAGE 1 EXPERIMENT: re-derive, and report that the matchUp is no longer a double exit
    //
    // ...or that the same exit now goes to the OTHER side. A WALKOVER awarded to a participant standing opposite a
    // produced exit re-derives, once that exit is withdrawn, to a WALKOVER awarded to the empty seat (RULE 2): the
    // status is unchanged and the winner is not. Compared on status alone, the stale award stood and the participant
    // it had advanced stayed one round on (census S4 run 16, DOUBLE_ELIMINATION 16/14 seed 20617910 `on`:
    // `Backdraw|3|2` kept ws 2 when `Backdraw|2|3`'s double walkover dissolved, and the arrival forward play sends
    // into `Backdraw|4|2` was refused ERR_EXISTING_POSITION_ASSIGNMENT after the correction had written).
    const derived = deriveExitStateFromProvenance(exitsRetained);
    // Only an award that STOOD is re-read: a pending exit (no winningSide) is left pending, as forward play leaves it;
    // whether one waiting exit should have two representations is not this function's to settle.
    //
    // ...and only when an EXIT was withdrawn. Withdrawing an arrival record (the side a result now being taken back sent
    // somebody to) changes no exit here: that result's own withdrawal releases the position it sent. Re-read anyway, the
    // award moved onto a position that had arrived through the stale result and kept it as the winner (census S8
    // policy-off, CURTIS_CONSOLATION 16/13, 20669990: `Consolation 1|4|1` kept the loser `Main|1|2`'s correction sent
    // through `Consolation 1|3|1`, and the next result there was refused ERR_EXISTING_POSITION_ASSIGNMENT after a write).
    const winnerChanged =
      removedAnExit && !!derived && !!matchUp.winningSide && derived.winningSide !== matchUp.winningSide;
    if (derived && (derived.matchUpStatus !== matchUp.matchUpStatus || winnerChanged)) {
      // read structurally, as the undecided branch below does: a lone position sits at index 0 whatever its side
      const previousWinnerDrawPosition = getWinningSideDrawPosition({ drawDefinition, structureId, matchUp });
      matchUp.matchUpStatus = derived.matchUpStatus as any;
      // ...and a PRODUCED exit left alone awards no empty seat: it stands pending, as forward play lands it (census S8
      // policy-off, FEED_IN_CHAMPIONSHIP 16/11 21123326: `Consolation|5|1`, a double walkover dissolved to the walkover
      // `Consolation|3|1` produced, was awarded to the side nobody had reached)
      if (derived.winningSide && !awardsEmptySeat({ derived, exitsRetained, drawDefinition, structureId, matchUp }))
        matchUp.winningSide = derived.winningSide;
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
    // and an exit LABEL beside the BYE goes with the exit it described: a BYE is never won. Census w2 9100211
    // (FIRST_MATCH_LOSER_CONSOLATION 32/32, `doubleExitPropagateBye: false`): `Consolation|1|4`'s convergence produced
    // a WALKOVER into `Consolation|2|4` beside its BYE; when the convergence dissolved, the withdrawal left
    // `WALKOVER ws=2` over an empty seat, and the participant who then came through was moved on past it.
    if (isAnyExit(matchUp.matchUpStatus)) {
      matchUp.matchUpStatus = BYE;
      delete matchUp.winningSide;
    }
    return { roundNumber: matchUp.roundNumber, matchUpId: matchUp.matchUpId, structureId };
  }

  // Nothing derived remains: the matchUp reverts to undecided, which is the state it was in before
  // the cascade reached it.
  //
  // The winner's position is read BEFORE `winningSide` is deleted, because it names the side that was
  // about to advance out of an exit that is no longer happening.
  const winnerDrawPosition = getWinningSideDrawPosition({ drawDefinition, structureId, matchUp });
  clearSideExitProvenance(matchUp);
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
