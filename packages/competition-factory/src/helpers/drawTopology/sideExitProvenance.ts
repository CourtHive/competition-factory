import { isAnyExit } from '@Validators/isExit';

// constants and types
import type { MatchUp, MatchUpStatusUnion, SideExitProvenance, SideExitProvenanceEntry } from '@Types/tournamentTypes';
import { BYE, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * Readers of a matchUp's side exit provenance: which side carries an exit, from where, and whether it arrived by a
 * result. Pure reads of the draw record, below the queries and mutations that consult them; the writers stay with the
 * outcome code (mutate/matchUps/matchUpStatus/sideExitProvenance.ts).
 */

/**
 * Did this side's participant get here by WINNING its origin?
 *
 * An arrival records its origin and no decided status (F9, CA 2026-10-07): `{ previousMatchUpStatus, sourceMatchUpId }`.
 * Records written before that carry the origin's status as `matchUpStatus` too, so a non-exit, non-BYE status is
 * accepted as the same answer. A BYE's own arrival (`{ BYE, BYE }`) is not a result.
 */
export function arrivedByResult(entry?: SideExitProvenanceEntry): boolean {
  if (!entry) return false;
  if (!entry.matchUpStatus) return !!entry.previousMatchUpStatus && entry.previousMatchUpStatus !== BYE;
  return !isAnyExit(entry.matchUpStatus) && entry.matchUpStatus !== BYE;
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
 * The sides of this matchUp that CARRY AN EXIT — read from what each entry says, not from its
 * being there.
 *
 * **Punch-list P19.** `sideExitProvenance` holds three different facts under one key, and only one
 * of them is an exit:
 *
 *  - a CARRIED EXIT — `matchUpStatus` is an exit status; the cascade delivered it to this side;
 *  - an ARRIVAL — `matchUpStatus: COMPLETED` or `BYE`; this side's occupant got here by winning or
 *    by advancing through a BYE, recorded because it is a real fact about a convergence;
 *  - (until 2026-10-22) a BYE CLAIM LEDGER — `byeClaims` and nothing else; retired (Mentat P58), ignored if stored.
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
