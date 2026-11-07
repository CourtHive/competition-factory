import { collapseDoubleExitStatus, deriveStatusCodes } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { isDoubleExit } from '@Validators/isExit';
import { producedTarget } from './producedTarget';
import { unwoundOps } from './unwindPath';
import {
  BLANK_SCORE,
  SINGLE_EXITS,
  carriedStatus,
  indexed,
  scoreless,
  sideOf,
  unplaced,
  unwoundClean,
} from './planShared';

// constants and types
import { BYE, RETIRED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { ExitReasonArgs, OutcomeView, RebuildView } from '../types';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { ProducedTarget } from './producedTarget';
import type { Convergence } from './convergence';

/**
 * A produced exit superseding a stale relay on its own side (C15): the original propagated BYE withdrawn, then a
 * genuine convergence replacing the stale origin.
 */

/** The old produced origin passes through this landing and occupies the same side of its next matchUp. */
function supersededRelayOrigin(view: OutcomeView, home: HydratedMatchUp, target: ProducedTarget) {
  const origins = Object.entries(home.sideExitProvenance ?? {});
  if (origins.length !== 1) return undefined;
  const [side, origin] = origins[0];
  const foreign = indexed(view, origin.sourceMatchUpId);
  if (!foreign || !isDoubleExit(foreign.matchUpStatus) || Object.keys(foreign.sideExitProvenance ?? {}).length)
    return undefined;
  const produced = producedTarget(view, foreign, foreign.matchUpStatus);
  if (produced?.entry.matchUpId !== home.matchUpId || String(produced.fedSide) !== side) return undefined;
  if (origin.matchUpStatus !== produced.matchUpStatus || origin.previousMatchUpStatus !== foreign.matchUpStatus)
    return undefined;
  const entry = indexed(view, target.entry.matchUpId);
  if (!entry || Object.keys(entry.sideExitProvenance ?? {}).length !== 1) return undefined;
  if (JSON.stringify(entry.sideExitProvenance?.[target.fedSide]) !== JSON.stringify(origin)) return undefined;
  return { origin, side };
}

/** Original own propagated BYE, actually withdrawn, then a genuine convergence superseding its stale relay. */
export function supersededOwnRelayConvergence(
  args: ExitReasonArgs,
  after: NonNullable<ReturnType<RebuildView>>,
): Convergence | undefined {
  const { view, request, write } = args;
  if (view.isTeam || view.group) return undefined;
  if (
    !write?.winningSide ||
    write.matchUpStatusCodes?.length ||
    !after.direction?.loser?.arrives ||
    !SINGLE_EXITS.has(request.matchUpStatus ?? '') ||
    request.matchUpStatus === RETIRED
  )
    return undefined;
  const seat = view.targets.loserTargetSeat;
  const home = indexed(view, view.targets.loserMatchUpId);
  const landing = indexed(after.view, home?.matchUpId);
  const position = view.targets.loserTargetDrawPosition;
  if (!seat?.bye || !seat.byeFromPropagation || home?.matchUpStatus !== BYE || !landing || !position) return undefined;
  const own = unwoundOps(view, request, 'winner', args.drawDefinition).seatPrograms[0];
  if (
    !own?.some((op) => op.op === 'withdrawBye' && op.structureId === home.structureId && op.drawPosition === position)
  )
    return undefined;
  const clear = own.find(
    (op) =>
      op.op === 'clearMatchUpBye' &&
      op.matchUpId === home.matchUpId &&
      op.drawPosition === position &&
      op.rederived?.matchUpStatus === landing.matchUpStatus,
  );
  const sideNumber = sideOf(landing, position);
  if (
    !clear ||
    !sideNumber ||
    landing.winningSide ||
    landing.loserMatchUpId ||
    !scoreless(landing) ||
    landing.matchUpStatusCodes?.length ||
    landing.sideStatusCodes ||
    !after.view.targets.loserTargetSeat?.free ||
    after.view.targets.loserTargetSeat.opponentBye
  )
    return undefined;
  const matchUpStatus = collapseDoubleExitStatus([carriedStatus(request.matchUpStatus), landing.matchUpStatus]);
  if (after.direction?.loser?.converged !== matchUpStatus) return undefined;
  const target = producedTarget(after.view, landing, matchUpStatus);
  if (!target || target.feed) return undefined;
  const retained = supersededRelayOrigin(view, home, target);
  if (!retained || JSON.stringify(landing.sideExitProvenance) !== JSON.stringify(home.sideExitProvenance))
    return undefined;
  if (retained.side !== String(3 - sideNumber)) return undefined;
  const original = indexed(view, target.entry.matchUpId);
  const entry = target.entry;
  if (
    !original ||
    JSON.stringify(original.sideExitProvenance) !== JSON.stringify(entry.sideExitProvenance) ||
    (['winningSide', 'score', 'matchUpStatusCodes', 'sideStatusCodes', 'schedule'] as const).some(
      (key) => JSON.stringify(original[key]) !== JSON.stringify(entry[key]),
    ) ||
    original.matchUpStatus !== entry.matchUpStatus ||
    JSON.stringify(original.drawPositions) !== JSON.stringify(entry.drawPositions)
  )
    return undefined;
  if (
    entry.matchUpStatus !== retained.origin.matchUpStatus ||
    entry.winningSide ||
    !unplaced(entry) ||
    !scoreless(entry)
  )
    return undefined;
  if (
    entry.matchUpStatusCodes?.length ||
    entry.sideStatusCodes ||
    entry.loserMatchUpId ||
    entry.sides?.some((side) => side.bye || side.qualifier || side.participantId)
  )
    return undefined;
  const paired = after.view.inContextDrawMatchUps?.find(
    (matchUp) =>
      matchUp.structureId === landing.structureId &&
      matchUp.roundNumber === landing.roundNumber &&
      matchUp.roundPosition === (landing.roundPosition! % 2 ? landing.roundPosition! + 1 : landing.roundPosition! - 1),
  );
  if (
    !paired ||
    paired.winnerMatchUpId !== entry.matchUpId ||
    paired.matchUpStatus !== TO_BE_PLAYED ||
    !unwoundClean(paired, new Set())
  )
    return undefined;
  return {
    matchUpId: landing.matchUpId,
    sideNumber,
    matchUpStatus,
    matchUpStatusCodes: deriveStatusCodes(landing),
    score: BLANK_SCORE,
    target,
  };
}
