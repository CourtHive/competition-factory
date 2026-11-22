import type { MatchUp, TeamCompetitor } from '@Types/tournamentTypes';

// An assignment updates an existing numbered side in place. On first assignment both side
// objects are numbered. These operations also preserve the behavior of borrowed documents.
export function commitAssignedLineUp(matchUp: MatchUp, sideNumber: number | undefined, lineUp?: TeamCompetitor[]) {
  if (sideNumber && matchUp.sides?.some((side) => side.sideNumber === sideNumber)) {
    for (const side of matchUp.sides) if (side.sideNumber === sideNumber) side.lineUp = lineUp;
    return;
  }
  matchUp.sides = [1, 2].map((number) => ({
    ...(matchUp.sides?.find((each) => each.sideNumber === number) ?? {}),
    sideNumber: number,
  }));
  const target = matchUp.sides.find((side) => side.sideNumber === sideNumber);
  if (target) target.lineUp = lineUp;
}
