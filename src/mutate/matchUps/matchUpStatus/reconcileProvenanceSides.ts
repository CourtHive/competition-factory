import { carriedExitStatus, setSideExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { settleUnlessIdle } from './indexPrecheck';

// constants and types
import { completedMatchUpStatuses, WALKOVER, DEFAULTED } from '@Constants/matchUpStatusConstants';
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import type { MatchUpsMap } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';

// A single exit without a winning side can still be pending on an empty seat (the census target is WALKOVER).
const completedStatuses = new Set<string>(
  completedMatchUpStatuses.filter((status) => status !== WALKOVER && status !== DEFAULTED),
);

/**
 * A PROVENANCE ENTRY FOLLOWS ITS FEEDER'S SIDE AS THE SEATS SETTLE (CA ruling (1), 2026-10-20; Mentat P59).
 *
 * `sideExitProvenance` is keyed by side number, and a feeder's side is read two ways: with both positions present, by
 * drawPosition order (`draw-positions.md` rule 3, `getExitArrivalSideNumber`); with one or none, by feeder order. Where
 * fed and advanced numbering interleave, a feeder's side flips as positions arrive and leave, and an entry keeps the side
 * it was written on. Census Phase B, MODIFIED_FEED_IN_CHAMPIONSHIP 32/32 policy-off 30030527: `Consolation|3|4` held dp
 * [8, 21] when `Consolation|1|7`'s produced walkover was relayed past `Consolation|2|7`'s BYE, so rule 3 put it on side 2
 * (dp 21's side); dp 21 then went, and dp 8, `Consolation|2|8`'s, read side 2 by feeder order, beside an entry that
 * named the other feeder's exit on the same side. Every other entry order, and the probe's clear, record it on side 1.
 *
 * Asked of the settled draw, only where nothing depends on the side yet: an undecided matchUp with exactly two winner
 * feeders and one entry, a carried exit, whose source reaches it through one of them. The entry moves to that feeder's
 * side as the seats now read it: the side of a position the feeder seats, else the side opposite a position the other
 * feeder seats, else feeder order.
 */
export function reconcileProvenanceSides({
  tournamentRecord,
  drawDefinition,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  event?: Event;
}): void {
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  if (!provenanceCandidates(matchUpsMap).length) return;
  // nothing misplaced on the structural index: the pass's hydration would find the same, and write nothing
  settleUnlessIdle({
    detect: (inContextDrawMatchUps) => findMisplacedProvenance({ inContextDrawMatchUps, matchUpsMap }),
    run: () => rekeyMisplaced({ tournamentRecord, drawDefinition, matchUpsMap, event }),
    site: 'reconcileProvenanceSides',
    idle: undefined,
    drawDefinition,
  });
}

function rekeyMisplaced({
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  event?: Event;
}): void {
  const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? [];
  for (const { stored, expected, entry } of findMisplacedProvenance({ inContextDrawMatchUps, matchUpsMap })) {
    setSideExitProvenance({ matchUp: stored, provenance: { [expected]: entry } });
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: 'reconcileProvenanceSides',
      eventId: event?.eventId,
      matchUp: stored,
      drawDefinition,
      event,
    });
  }
}

type Provenance = NonNullable<MatchUp['sideExitProvenance']>;
type ProvenanceEntry = NonNullable<Provenance[keyof Provenance]>;

function provenanceCandidates(matchUpsMap: MatchUpsMap) {
  return matchUpsMap.drawMatchUps.filter((matchUp) => {
    if (matchUp.winningSide || completedStatuses.has(matchUp.matchUpStatus ?? '') || checkScoreHasValue({ matchUp }))
      return false;
    const sides = Object.keys(matchUp.sideExitProvenance ?? {});
    return sides.length === 1 && !!carriedExitStatus(matchUp.sideExitProvenance?.[sides[0]]);
  });
}

/**
 * THE PASS'S DETECTOR: every carried exit keyed to the wrong side for the feeder that reached it. The pass re-keys each;
 * v2's has-work predicate (`outcome/settleWork.ts`) asks it of the working view, so the two cannot drift.
 */
export function findMisplacedProvenance({
  inContextDrawMatchUps,
  matchUpsMap,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  matchUpsMap: MatchUpsMap;
}) {
  const misplaced: { stored: MatchUp; expected: number; entry: ProvenanceEntry }[] = [];
  const byId = new Map(inContextDrawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  for (const stored of provenanceCandidates(matchUpsMap)) {
    const target = byId.get(stored.matchUpId);
    if (!target) continue;
    const [current] = Object.keys(stored.sideExitProvenance ?? {}).map(Number);
    const entry = stored.sideExitProvenance?.[current];
    const feeders = inContextDrawMatchUps
      .filter((matchUp) => matchUp.winnerMatchUpId === target.matchUpId && matchUp.structureId === target.structureId)
      .sort((a, b) => (a.roundPosition ?? 0) - (b.roundPosition ?? 0));
    if (feeders.length !== 2 || !entry?.sourceMatchUpId) continue;
    const feeder = feederReached(entry.sourceMatchUpId, target, byId);
    const index = feeders.findIndex((candidate) => candidate.matchUpId === feeder?.matchUpId);
    if (index === -1) continue;
    const expected = feederSide(target, feeders[index], feeders[1 - index], index);
    if (!expected || expected === current) continue;
    misplaced.push({ stored, expected, entry });
  }
  return misplaced;
}

/** the matchUp feeding `target` that the source's winner path passes through, within the target's structure */
function feederReached(sourceMatchUpId: string, target: HydratedMatchUp, byId: Map<string, HydratedMatchUp>) {
  let current = byId.get(sourceMatchUpId);
  for (let hops = 0; current && hops < 64; hops++) {
    if (current.structureId !== target.structureId) return undefined;
    if (current.winnerMatchUpId === target.matchUpId) return current;
    current = current.winnerMatchUpId ? byId.get(current.winnerMatchUpId) : undefined;
  }
  return undefined;
}

/** the side a feeder's seat occupies as the target's seats now read */
function feederSide(target: HydratedMatchUp, feeder: HydratedMatchUp, other: HydratedMatchUp, index: number) {
  const seatedFrom = (source: HydratedMatchUp) => {
    const positions = new Set(source.drawPositions ?? []);
    return target.sides?.find((side) => side?.drawPosition && positions.has(side.drawPosition))?.sideNumber;
  };
  const own = seatedFrom(feeder);
  if (own === 1 || own === 2) return own;
  const opposite = seatedFrom(other);
  if (opposite === 1 || opposite === 2) return 3 - opposite;
  return index + 1;
}
