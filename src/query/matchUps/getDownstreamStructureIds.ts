import { positionTargets } from '@Query/matchUp/positionTargets';

// constants and types
import { DrawDefinition } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

type GetDownstreamStructureIdsArgs = {
  inContextDrawMatchUps: HydratedMatchUp[];
  includeConvergenceTargets?: boolean;
  drawDefinition: DrawDefinition;
  excludeStructureId?: string;
  matchUpId: string;
};

/**
 * Every structure reachable DOWNSTREAM of one matchUp, by walking the links the engine itself uses.
 *
 * ## Why this exists
 *
 * "Which structures does a result affect?" was being answered by a stage/`stageSequence` heuristic:
 * same-stage structures with a greater `stageSequence`, plus this matchUp's own loser/winner target,
 * plus structures in that target's stage with a greater sequence. That is a PROXY for the links, and
 * it was wrong in both directions.
 *
 * It under-reached: a structure fed by a DIFFERENT ROUND of the same source sits at the SAME
 * `stageSequence`, so it was never visited — COMPASS `East` feeds `West` (r1), `North` (r2) and
 * `Northeast` (r3), all at sequence 2, and only the flipped round's own target was corrected
 * ([#4884(factory)](https://github.com/CourtHive/competition-factory/pull/4884)).
 *
 * And it over-reached: widening it to "every structure this structure feeds" then reached
 * DOUBLE_ELIMINATION's `Backdraw` — fed by `Main` rounds 1-3 — when the FINAL was flipped, a
 * structure settled by results the flip does not touch. That needed two hand-added bounds to
 * suppress.
 *
 * **A walk makes the round bound structural. The second exclusion is real but is NOT about winner
 * links — that cost two measured wrong turns to establish.** Going forward only does mean a
 * structure fed by an earlier round is unreachable rather than excluded. But some downstream
 * structures still must not be relabelled, and identifying them by link TYPE is wrong in both
 * directions. `DOUBLE_ELIMINATION` supplies both counterexamples:
 *
 *   Main r4 --WINNER--> Decider   and   Main r4 --LOSER--> Decider
 *   Backdraw r4 --WINNER--> Main r4
 *
 * Reaching the Decider and relabelling it opened census seed 9100424 (`EXIT_WITHOUT_LOSER`).
 * Excluding every cross-structure WINNER edge to stop that also excluded `Main`, which the Backdraw
 * legitimately feeds — opening 9000402 (`WINNING_SIDE_ADVANCEMENT_MISMATCH`, the losing participant
 * advanced into the winnerMatchUp). Both are the same mistake: treating "winner edge" as the
 * property that matters.
 *
 * **The property that matters is CONVERGENCE.** When both sides of ONE matchUp feed the same target
 * — as `Main r4` does into the Decider — that target receives the pair together, and their places in
 * it are determined by which of them won. Exchanging two participants who are both already there is
 * not a relabel of an occupant; it is a claim about their roles, and the swap has no basis for it.
 * Where only one side feeds a target, the occupant is unambiguous and the relabel is exactly right —
 * which is why `Backdraw r4 --WINNER--> Main` must be followed and corrected like any other feed.
 *
 * ## What it returns
 *
 * Structure ids only. The traversal visits matchUps, but callers act per structure (they correct
 * `positionAssignments`), and the same structure is typically reached by several matchUps — so the
 * set is the useful shape and de-duplication is the point.
 *
 * `excludeStructureId` is for the common case where the caller must NOT treat the SOURCE structure
 * as downstream of itself. A chain re-enters its own structure immediately (the winner target is the
 * next round), and in DOUBLE_ELIMINATION it re-enters after a detour — `Backdraw r4 --WINNER-->
 * Main r4`. Passing the source id keeps that from being mistaken for a downstream effect.
 */
export function getDownstreamStructureIds({
  includeConvergenceTargets = false,
  inContextDrawMatchUps,
  excludeStructureId,
  drawDefinition,
  matchUpId,
}: GetDownstreamStructureIdsArgs): { structureIds: string[] } {
  const structureIdOf = (id: string) => inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === id)?.structureId;

  const structureIds = new Set<string>();
  const visited = new Set<string>();
  const queue: string[] = [matchUpId];

  while (queue.length) {
    const currentMatchUpId = queue.shift() as string;
    // The graph is a DAG in practice, but a cycle would hang the pipeline rather than fail it, so
    // the visited set is a guard and not only an optimisation.
    if (visited.has(currentMatchUpId)) continue;
    visited.add(currentMatchUpId);

    const currentStructureId = structureIdOf(currentMatchUpId);
    const targets: any = positionTargets({
      matchUpId: currentMatchUpId,
      inContextDrawMatchUps,
      drawDefinition,
    });

    const { loserMatchUp, winnerMatchUp } = targets?.targetMatchUps ?? {};

    // Convergence — both sides of one matchUp feeding the same structure — only disqualifies a
    // relabel AT THE ORIGIN, and getting that wrong cost a measured regression in each direction.
    //
    // When the ORIGIN matchUp's own two sides both feed a structure, that structure receives the
    // PAIR, and their places in it are decided by which of them won. Exchanging two participants who
    // are both already there is a claim about their roles, not a relabel of an occupant, and the
    // swap has no basis for it.
    //
    // Further down the chain it is a different situation entirely. Walking from `Main|1|1` in
    // DOUBLE_ELIMINATION reaches `Main r4`, whose sides both feed the Decider — but the origin's two
    // participants are not that pair, and at most ONE of them can be in the Decider, so the relabel
    // is unambiguous and REQUIRED. Excluding it left the Decider holding a participant who no longer
    // reached the final (`WINNING_SIDE_ADVANCEMENT_MISMATCH`, census seed 9000402 and two
    // `progressionPatterns` topologies); including it unconditionally broke seed 9100424
    // (`EXIT_WITHOUT_LOSER`). The origin test is what separates the two.
    const convergesOn =
      currentMatchUpId === matchUpId &&
      loserMatchUp?.structureId &&
      winnerMatchUp?.structureId &&
      loserMatchUp.structureId === winnerMatchUp.structureId &&
      loserMatchUp.structureId !== currentStructureId
        ? loserMatchUp.structureId
        : undefined;

    for (const targetMatchUp of [loserMatchUp, winnerMatchUp]) {
      if (!targetMatchUp?.matchUpId) continue;
      const isConvergenceTarget = !!convergesOn && targetMatchUp.structureId === convergesOn;
      if (targetMatchUp.structureId && (includeConvergenceTargets || !isConvergenceTarget)) {
        structureIds.add(targetMatchUp.structureId);
      }
      queue.push(targetMatchUp.matchUpId);
    }
  }

  if (excludeStructureId) structureIds.delete(excludeStructureId);

  return { structureIds: Array.from(structureIds) };
}
