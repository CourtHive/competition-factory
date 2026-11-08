import { BLANK_SCORE, SINGLE_EXITS, indexed, onwardFrom, positionsOf, scoreless, sideOf } from './planShared';
import { buildCarriedExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getOrderedDrawPositions } from '@Query/matchUps/getOrderedDrawPositions';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { carriedByeDualSides } from './teamPlan';

// constants and types
import { BYE, DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { DrawDefinition, SideExitProvenanceEntry } from '@Types/tournamentTypes';
import type { HydratedMatchUp, HydratedSide } from '@Types/hydrated';
import type { OutcomeView } from '../types';
import type { OutcomeOp } from '../ops';

type Placement = NonNullable<ReturnType<typeof onwardFrom>>;
export type CarriedByeSeat = {
  home: HydratedMatchUp;
  drawPosition: number;
  carrier: HydratedSide;
  origin: SideExitProvenanceEntry & { matchUpStatus: typeof WALKOVER | typeof DEFAULTED };
  matchUpIds: string[];
  landing?: { entry: HydratedMatchUp; placement: Placement; side: 1 | 2; onward?: Placement };
};

/** C26: a loser BYE replaces an empty awardee. The standing carrier goes through the BYE,
 * then its exit is reconciled onto a direct clean landing. A final has no carry reconciliation.
 * Linked withdrawals, overlapping BYE programs and policy-off convergence remain separate writers. */
export function carriedByeSeat(view: OutcomeView): CarriedByeSeat | undefined {
  const { targets } = view;
  const { loserTargetSeat: seat, loserTargetDrawPosition: drawPosition, loserStructureId } = targets;
  const home = indexed(view, targets.loserMatchUpId);
  if (!view.draw.doubleExitPropagatesBye || targets.loserLink?.linkCondition || !seat?.free || seat.opponentBye)
    return undefined;
  if (!home || !drawPosition || !loserStructureId || home.structureId !== loserStructureId) return undefined;
  if (home.matchUpStatus !== WALKOVER && home.matchUpStatus !== DEFAULTED) return undefined;
  if (!scoreless(home) || home.matchUpStatusCodes?.length || home.loserMatchUpId || home.sides?.some((s) => s.bye))
    return undefined;
  const arrivalSide = sideOf(home, drawPosition);
  if (!arrivalSide || home.winningSide !== arrivalSide) return undefined;
  const arrival = home.sides?.find((side) => side.sideNumber === arrivalSide);
  const carrier = home.sides?.find((side) => side.sideNumber === 3 - arrivalSide);
  if (arrival?.participantId || !carrier?.participantId || !carrier.drawPosition) return undefined;
  if (positionsOf(home).length !== 2 || !positionsOf(home).includes(drawPosition)) return undefined;
  const provenance = home.sideExitProvenance ?? {};
  const origin = provenance[(3 - arrivalSide) as 1 | 2];
  if (Object.keys(provenance).length !== 1 || origin?.matchUpStatus !== home.matchUpStatus) return undefined;
  if (!SINGLE_EXITS.has(origin.previousMatchUpStatus) || !origin.sourceMatchUpId) return undefined;
  const source = indexed(view, origin.sourceMatchUpId);
  if (!source || hasReason(source) || hasReason(home)) return undefined;
  const result: CarriedByeSeat = {
    home,
    drawPosition,
    carrier,
    origin: { ...origin, matchUpStatus: home.matchUpStatus },
    matchUpIds: [home.matchUpId],
  };
  if (!home.winnerMatchUpId) return result;
  const placement = onwardFrom(view, home, carrier.drawPosition);
  const next = indexed(view, home.winnerMatchUpId);
  if (!placement || !cleanLanding(next)) return undefined;
  const entry = projectLanding(view, next, placement, carrier);
  const side = sideOf(entry, carrier.drawPosition);
  if (!side) return undefined;
  const opponent = entry.sides?.find((candidate) => candidate.sideNumber === 3 - side && candidate.participantId);
  const onward = opponent?.drawPosition ? onwardFrom(view, entry, opponent.drawPosition) : undefined;
  if (opponent && entry.winnerMatchUpId && (!onward || !cleanLanding(indexed(view, entry.winnerMatchUpId))))
    return undefined;
  result.landing = { entry, placement, side, onward };
  result.matchUpIds.push(entry.matchUpId, ...(onward ? [onward.matchUpId] : []));
  return result;
}

const hasReason = (entry: HydratedMatchUp) => Object.values(entry.sideStatusCodes ?? {}).some(Boolean);
const cleanLanding = (entry?: HydratedMatchUp): entry is HydratedMatchUp =>
  !!entry &&
  entry.matchUpStatus === TO_BE_PLAYED &&
  !entry.winningSide &&
  scoreless(entry) &&
  !entry.matchUpStatusCodes?.length &&
  !hasReason(entry) &&
  !entry.loserMatchUpId &&
  !Object.keys(entry.sideExitProvenance ?? {}).length &&
  !entry.sides?.some((side) => side.bye);

/** Resolve side numbers through the same round-profile ordering as hydration; a compact lone
 * position does not determine its side. Existing landing detail and the arriving carrier stay by position. */
function projectLanding(
  view: OutcomeView,
  entry: HydratedMatchUp,
  placement: Placement,
  carrier: HydratedSide,
): HydratedMatchUp {
  const matchUps = view.inContextDrawMatchUps
    ?.filter((matchUp) => matchUp.structureId === entry.structureId)
    .map((matchUp) =>
      matchUp.matchUpId === entry.matchUpId ? { ...matchUp, drawPositions: placement.drawPositions } : matchUp,
    );
  const { roundProfile } = getRoundMatchUps({ matchUps });
  const { orderedDrawPositions, displayOrder } = getOrderedDrawPositions({
    drawPositions: placement.drawPositions,
    roundProfile: roundProfile ?? {},
    roundNumber: entry.roundNumber!,
  });
  const reversed = displayOrder[0] !== orderedDrawPositions[0];
  const sides = orderedDrawPositions
    .concat(undefined, undefined)
    .slice(0, 2)
    .map((drawPosition, index) => {
      if (!drawPosition) return entry.sides?.[index] ?? {};
      const original =
        drawPosition === carrier.drawPosition
          ? carrier
          : (entry.sides?.find((side) => side.drawPosition === drawPosition && side.participantId) ??
            entry.sides?.find((side) => side.drawPosition === drawPosition));
      const sideNumber = index + 1;
      return { ...original, drawPosition, sideNumber, displaySideNumber: reversed ? 3 - sideNumber : sideNumber };
    });
  return { ...entry, drawPositions: placement.drawPositions, sides };
}

export function carriedByeSeatOps(
  seat: CarriedByeSeat,
  drawDefinition: DrawDefinition | undefined,
  isTeam: boolean,
): { ops: OutcomeOp[]; after: OutcomeOp[] } {
  const { home, drawPosition, landing, carrier, origin } = seat;
  const ops: OutcomeOp[] = [
    {
      op: 'assignBye',
      structureId: home.structureId!,
      drawPosition,
      byeFromPropagation: true,
    },
    { op: 'setMatchUpBye', matchUpId: home.matchUpId },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: home.matchUpId },
    ...(landing
      ? [
          {
            op: 'setMatchUpDrawPositions' as const,
            ...landing.placement,
            advancesThroughBye: true as const,
            announcesEvent: true as const,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: landing.entry.matchUpId },
        ]
      : []),
  ];
  const after: OutcomeOp[] = [];
  if (landing) {
    const provenance = (exitingSideNumber: number | undefined) =>
      buildCarriedExitProvenance({
        matchUpStatus: origin.matchUpStatus,
        previousMatchUpStatus: origin.matchUpStatus,
        sourceMatchUpId: origin.sourceMatchUpId,
        exitingSideNumber,
      })!;
    after.push(
      {
        op: 'mergeSideExitProvenance',
        matchUpId: home.matchUpId,
        provenance: provenance(carrier.sideNumber),
        announcedAs: 'progressExitStatus',
      },
      {
        op: 'setMatchUpResult',
        matchUpId: landing.entry.matchUpId,
        matchUpStatus: origin.matchUpStatus,
        winningSide: (3 - landing.side) as 1 | 2,
        matchUpStatusCodes: [],
        ...(origin.matchUpStatus === WALKOVER ? { score: { ...BLANK_SCORE } } : {}),
        ...(isTeam && drawDefinition ? { ensuredSides: carriedByeDualSides(drawDefinition, landing.entry) } : {}),
      },
      { op: 'mergeSideExitProvenance', matchUpId: landing.entry.matchUpId, provenance: provenance(landing.side) },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: landing.entry.matchUpId },
      ...(landing.onward
        ? [
            { op: 'setMatchUpDrawPositions' as const, ...landing.onward },
            { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: landing.onward.matchUpId },
          ]
        : []),
    );
  }
  if (home.schedule?.scoredTime)
    after.push(
      { op: 'setMatchUpResult', matchUpId: home.matchUpId, matchUpStatus: BYE, announcedAs: 'reconcileScoredTimes' },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: home.matchUpId },
    );
  return { ops, after };
}
