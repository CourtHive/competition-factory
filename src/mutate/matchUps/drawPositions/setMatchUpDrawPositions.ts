import { normalizeDrawPositions } from '@Mutate/matchUps/drawPositions/normalizeDrawPositions';
import { getDrawPositionSideNumber } from '@Query/matchUps/getDrawPositionSides';

// types
import type { DrawDefinition, MatchUp } from '@Types/tournamentTypes';

type SetMatchUpDrawPositionsArgs = {
  drawPositions: (number | undefined)[];
  drawDefinition?: DrawDefinition;
  /** false where the caller assigns `winningSide` itself, from the side the arrival takes (the arrival path) */
  rekeyWinningSide?: boolean;
  structureId?: string;
  matchUp: MatchUp;
};

/**
 * THE ONE WRITER OF A MATCHUP'S `drawPositions`, AND WHAT IT CARRIES WITH IT (CA, 2026-10-05: option R).
 *
 * A lone position sits on its BRACKET side; two positions sort ASCENDING. In every paired round of a feed-in
 * structure those disagree, so the participant already in a matchUp changes side when the other seat fills or
 * empties (`draw-positions.md` § 2; `Mentat/planning/EXIT_CASCADE_DE_GRAND_FINAL_AND_SIDE_KEY_DESIGN.md` § 1).
 * Everything a matchUp records BY SIDE must change side with them, or it goes on naming a side that now holds the
 * other participant:
 *
 *  - `sideExitProvenance`: which side an exit arrived at, and from where;
 *  - `sideStatusCodes`: the reason code a side's exit carries (the badge beside the participant);
 *  - `matchUpStatusCodes`: the same reasons, positionally, for display;
 *  - `winningSide`, except where the caller assigns it itself.
 *
 * `winningSide` was the only one re-keyed, on arrival. The census found the rest stale eight times in 1,800 seeds,
 * six of them wrong in effect: a relabel at the exit's source did not reach the carry, and a re-score to a played
 * win did not withdraw it (`sideFactsFollowTheSeat.test.ts`).
 *
 * The persistent occupant is the one position present both before and after. Its side is read STRUCTURALLY at each
 * state (`getDrawPositionSideNumber`): by index when both positions are present, through the round profile when it
 * is alone. Hydrated `sides` are withheld from that read, because they describe the state being replaced.
 */
export function setMatchUpDrawPositions(args: SetMatchUpDrawPositionsArgs) {
  const { sideChanged } = rekeySideFacts(args);
  args.matchUp.drawPositions = normalizeDrawPositions(args.drawPositions);
  return { sideChanged };
}

/**
 * The re-keying half alone, for a writer that must swap the side facts BEFORE its own logic reads them and writes
 * `drawPositions` later (the arrival, which rebuilds the exit's codes for the side the arrival takes).
 */
export function rekeySideFacts({
  rekeyWinningSide = true,
  drawDefinition,
  drawPositions,
  structureId,
  matchUp,
}: SetMatchUpDrawPositionsArgs) {
  const before: (number | undefined)[] = matchUp.drawPositions ?? [];
  const after = normalizeDrawPositions(drawPositions);
  const sideChanged = occupantChangesSide({ matchUp, before, after, drawDefinition, structureId });
  if (sideChanged) swapSideFacts(matchUp, rekeyWinningSide);
  return { sideChanged };
}

function occupantChangesSide({ matchUp, before, after, drawDefinition, structureId }): boolean {
  if (!drawDefinition || !structureId) return false;
  const held = (positions: (number | undefined)[]) => positions.filter((position): position is number => !!position);
  const present = new Set(held(after));
  const stayed = held(before).filter((position) => present.has(position));
  // nobody stayed, or nobody left and nobody arrived: no participant can have moved
  if (stayed.length !== 1 || held(before).length === held(after).length) return false;

  const [drawPosition] = stayed;
  const sideAt = (drawPositions: (number | undefined)[]) =>
    getDrawPositionSideNumber({
      matchUp: { ...matchUp, sides: undefined, drawPositions },
      drawDefinition,
      drawPosition,
      structureId,
    });
  const sideBefore = sideAt(before);
  const sideAfter = sideAt(after);
  return !!sideBefore && !!sideAfter && sideBefore !== sideAfter;
}

const swapKeys = (record?: Record<string | number, any>) => {
  if (!record) return record;
  const swapped: Record<number, any> = {};
  for (const [key, value] of Object.entries(record)) {
    const sideNumber = Number(key);
    const other = sideNumber === 1 || sideNumber === 2 ? 3 - sideNumber : sideNumber;
    swapped[other] = value?.sideNumber ? { ...value, sideNumber: other } : value;
  }
  return swapped;
};

function swapSideFacts(matchUp: MatchUp, rekeyWinningSide: boolean) {
  if (matchUp.sideExitProvenance) matchUp.sideExitProvenance = swapKeys(matchUp.sideExitProvenance);
  if (matchUp.sideStatusCodes) matchUp.sideStatusCodes = swapKeys(matchUp.sideStatusCodes);
  if (matchUp.matchUpStatusCodes?.length) {
    const [side1, side2] = matchUp.matchUpStatusCodes;
    matchUp.matchUpStatusCodes = [side2 ?? '', side1 ?? ''];
  }
  if (rekeyWinningSide && (matchUp.winningSide === 1 || matchUp.winningSide === 2)) {
    matchUp.winningSide = 3 - matchUp.winningSide;
  }
}
