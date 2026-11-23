import { findMissedLinkAdvancements } from '@Mutate/matchUps/matchUpStatus/reconcileMissedLinkAdvancements';
import { findReservationWork } from '@Mutate/matchUps/matchUpStatus/reconcileConsolationReservations';
import { hasStaleExitOrigins } from '@Mutate/matchUps/matchUpStatus/reconcileStaleExitOrigins';
import { findOwedCarry } from '@Mutate/matchUps/matchUpStatus/reconcileCarriesPastByes';
import { carriedExitStatus } from '@Helpers/drawTopology/sideExitProvenance';
import { indexed, onwardFrom, scoreless, sideOf } from './planShared';
import { carriedContinuation } from './carriedContinuation';
import { isDoubleExit } from '@Validators/isExit';
import { carriedByeDualSides } from './teamPlan';

// constants and types
import { BYE, DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { CarriedLanding } from './carriedContinuation';
import type { WorkingView } from '../overlay';
import type { OutcomeView } from '../types';
import type { OutcomeOp } from '../ops';

/** Replay only the carry v1 selects from the completed immediate draw, in stored order.
 * No landing is predicted before the seats/produced exit write. Unsupported work refuses the whole plan. */
export function carriedByeReplay(view: OutcomeView, working: WorkingView): OutcomeOp[] | undefined {
  const ops: OutcomeOp[] = [];
  if (!findOwedCarry(working)) return ops;
  // These passes precede carry replay. A later carry cannot be used to erase their obligations.
  // Include the root: oweDissolvedConvergencesTheirByes does not exclude it.
  const current = new Map(working.matchUpsMap.drawMatchUps.map((entry) => [entry.matchUpId, entry]));
  if (
    view.inContextDrawMatchUps?.some(
      (entry) => isDoubleExit(entry.matchUpStatus) && !isDoubleExit(current.get(entry.matchUpId)?.matchUpStatus),
    )
  )
    return undefined;
  if (hasStaleExitOrigins(working) || findMissedLinkAdvancements(working).length || findReservationWork(working).length)
    return undefined;
  const carriedOn = new Set<string>();
  for (let pass = 0; pass < 16; pass += 1) {
    const carry = findOwedCarry({ ...working, carriedOn });
    if (!carry) return ops;
    const current = { ...view, inContextDrawMatchUps: working.inContextDrawMatchUps };
    const source = indexed(current, carry.sourceMatchUpId);
    if (!source || Object.values(source.sideStatusCodes ?? {}).some(Boolean)) return undefined;
    if (carry.matchUpStatus !== WALKOVER && carry.matchUpStatus !== DEFAULTED) return undefined;
    const landing = replayLanding(current, carry);
    if (!landing) return undefined;
    if (view.isTeam) {
      const entry = indexed(current, landing.matchUpId)!;
      landing.ensuredSides = carriedByeDualSides(working.drawDefinition, entry);
    }
    const replay = carriedContinuation(carry.matchUpStatus, {
      kind: 'carry',
      lineage: { sourceMatchUpId: carry.sourceMatchUpId, previousMatchUpStatus: carry.matchUpStatus },
      landing,
    });
    if (!replay) return undefined;
    // The settle call supplies the real event after eventless immediate BYE advancement.
    const next = [...replay.relay, ...replay.landing].map((op): OutcomeOp =>
      op.op === 'setMatchUpResult' ? { ...op, restoresNoticeIdentity: true } : op,
    );
    if (working.apply(next).error) return undefined;
    ops.push(...next);
    carriedOn.add(carry.byeMatchUp.matchUpId);
  }
  return findOwedCarry({ ...working, carriedOn }) ? undefined : ops;
}

function replayLanding(
  view: OutcomeView,
  carry: NonNullable<ReturnType<typeof findOwedCarry>>,
): CarriedLanding | undefined {
  const relays: NonNullable<CarriedLanding['relays']> = [];
  const seen = new Set<string>();
  let entry = indexed(view, carry.byeMatchUp.matchUpId);
  const structureId = entry?.structureId;
  while (entry?.matchUpStatus === BYE) {
    if (seen.has(entry.matchUpId) || entry.structureId !== structureId) return undefined;
    seen.add(entry.matchUpId);
    const side = entry.sides?.find((candidate) => candidate.participantId === carry.carrierId);
    if (
      !side?.sideNumber ||
      !side.drawPosition ||
      !entry.sides?.find((other) => other.sideNumber === 3 - side.sideNumber!)?.bye
    )
      return undefined;
    const origin = entry.sideExitProvenance?.[side.sideNumber];
    if (
      Object.keys(entry.sideExitProvenance ?? {}).length !== 1 ||
      origin?.sourceMatchUpId !== carry.sourceMatchUpId ||
      carriedExitStatus(origin) !== carry.matchUpStatus ||
      !scoreless(entry) ||
      entry.matchUpStatusCodes?.length ||
      Object.values(entry.sideStatusCodes ?? {}).some(Boolean)
    )
      return undefined;
    relays.push({ matchUpId: entry.matchUpId, sideNumber: side.sideNumber });
    entry = indexed(view, entry.winnerMatchUpId);
  }
  if (
    !entry ||
    entry.structureId !== structureId ||
    entry.matchUpStatus !== TO_BE_PLAYED ||
    entry.winningSide ||
    !scoreless(entry) ||
    entry.matchUpStatusCodes?.length ||
    entry.loserMatchUpId ||
    Object.keys(entry.sideExitProvenance ?? {}).length ||
    Object.values(entry.sideStatusCodes ?? {}).some(Boolean) ||
    entry.sides?.some((side) => side.bye)
  )
    return undefined;
  const carrier = entry.sides?.find((side) => side.participantId === carry.carrierId);
  const sideNumber = sideOf(entry, carrier?.drawPosition);
  if (!sideNumber) return undefined;
  const opponent = entry.sides?.find((side) => side.sideNumber === 3 - sideNumber && side.participantId);
  const onward = opponent?.drawPosition ? onwardFrom(view, entry, opponent.drawPosition) : undefined;
  if (opponent && entry.winnerMatchUpId && !onward) return undefined;
  return { matchUpId: entry.matchUpId, sideNumber, relays, onward, passes: 1, carriesOn: false, opponentHeld: false };
}
