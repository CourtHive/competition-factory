import { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
import { getSideExitProvenance } from '@Helpers/drawTopology/sideExitProvenance';
import { producedExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { producedTarget } from '../plan/producedTarget';
import { unwoundOps } from '../plan/unwindPath';
import { isDoubleExit } from '@Validators/isExit';
import { indexed } from '../plan/planShared';

import type { OutcomeRequest, OutcomeView, Route } from '../types';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeOp } from '../ops';

export function doubleWithdrawal(
  view: OutcomeView,
  request: OutcomeRequest,
  route: Route,
  draw: DrawDefinition,
): OutcomeOp[] {
  if (!isDoubleExit(view.existing.matchUpStatus) || isDoubleExit(request.matchUpStatus)) return [];
  if (!['clear', 'clear-score', 'winner'].includes(route) || !request.matchUpId) return [];
  const known = unwoundOps(view, request, route === 'clear' ? 'clear-score' : route, draw);
  if (known.ops.length && !known.reannounced.length) return known.ops;
  const root = indexed(view, request.matchUpId);
  if (!root) return [];
  const first = producedTarget(view, root, root.matchUpStatus);
  if (!first) return [];
  const marks = getSideExitProvenance({ matchUp: first.entry });
  const old = marks?.[first.fedSide];
  if (
    old?.sourceMatchUpId !== root.matchUpId ||
    old.previousMatchUpStatus !== root.matchUpStatus ||
    old.matchUpStatus !== producedExitStatus(root.matchUpStatus) ||
    first.entry.matchUpStatus !== old.matchUpStatus
  )
    return [];
  if (Object.entries(marks ?? {}).some(([side, mark]) => Number(side) !== first.fedSide && mark.matchUpStatus))
    return [];
  // An ordinary entrant opposite the produced exit may have advanced through this holder. The
  // unwind visits its next winner even when no participant advanced (an observable blank reset).
  // Release only the position that this holder actually sent; a separately produced terminal survives.
  return resetPlainPath(view, root, first.entry);
}

function resetPlainPath(view: OutcomeView, root: HydratedMatchUp, entry: HydratedMatchUp): OutcomeOp[] {
  const levels: OutcomeOp[][] = [];
  const seen = new Set<string>();
  let previous = root;
  let at = entry;
  while (at.structureId === root.structureId && !seen.has(at.matchUpId)) {
    seen.add(at.matchUpId);
    const provenance = getSideExitProvenance({ matchUp: at });
    if (at !== entry && provenance) break;
    if (
      checkScoreHasValue({ score: at.score }) ||
      (at !== entry && (at.winningSide || at.matchUpStatus !== TO_BE_PLAYED))
    )
      break;
    const batch: OutcomeOp[] = [];
    if (at !== entry) {
      const holder = previous.sides?.find((side) => side.sideNumber === previous.winningSide);
      const pos = holder?.drawPosition;
      if (pos && at.drawPositions?.includes(pos)) {
        const same = at.sides?.find((side) => side.drawPosition === pos);
        if (!holder?.participantId || same?.participantId !== holder.participantId) break;
        batch.push({
          op: 'setMatchUpDrawPositions',
          matchUpId: at.matchUpId,
          drawPositions: at.drawPositions.filter((p) => p && p !== pos),
          clearsScore: true,
        });
      }
    }
    batch.push({
      op: 'setMatchUpResult',
      matchUpId: at.matchUpId,
      matchUpStatus: TO_BE_PLAYED,
      resetsScore: true,
      removesWinningSide: true,
      score: toBePlayed.score,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      ...(at !== entry ? { announcesContext: false as const } : {}),
    });
    if (provenance) batch.push({ op: 'setSideExitProvenance', matchUpId: at.matchUpId });
    batch.push({ op: 'stampUpdatedAt', entity: 'matchUp', id: at.matchUpId });
    levels.push(batch);
    const next = indexed(view, at.winnerMatchUpId);
    if (!next) break;
    previous = at;
    at = next;
  }
  return levels.reverse().flat();
}
