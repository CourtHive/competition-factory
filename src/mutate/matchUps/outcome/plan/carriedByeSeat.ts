import { BLANK_SCORE, SINGLE_EXITS, indexed, onwardFrom, positionsOf, scoreless, sideOf } from './planShared';
import { buildCarriedExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getOrderedDrawPositions } from '@Query/matchUps/getOrderedDrawPositions';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
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
  relays: { entry: HydratedMatchUp; side: number }[];
  matchUpIds: string[];
  landing?: { entry: HydratedMatchUp; carrierArrival: Placement; side: 1 | 2; onward?: Placement };
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
    relays: [],
    matchUpIds: [home.matchUpId],
  };
  if (!home.winnerMatchUpId) return result;
  const relays = carriedByeRelays(view, result, source);
  if (!relays) return undefined;
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
  result.relays = relays;
  result.landing = { entry, carrierArrival: placement, side, onward };
  result.matchUpIds.push(
    ...relays.map((relay) => relay.entry.matchUpId),
    entry.matchUpId,
    ...(onward ? [onward.matchUpId] : []),
  );
  return result;
}

/** The carrier can already have passed BYEs before reaching the home. Reconciliation
 * revisits that path; each relay must hold this one origin beside its existing BYE. */
function carriedByeRelays(view: OutcomeView, seat: CarriedByeSeat, source: HydratedMatchUp) {
  const { home, carrier, origin } = seat;
  const relays: CarriedByeSeat['relays'] = [];
  const seen = new Set([home.matchUpId]);
  let entry = indexed(view, source.loserMatchUpId);
  while (entry?.matchUpId !== home.matchUpId) {
    if (!entry || seen.has(entry.matchUpId) || entry.structureId !== home.structureId) return undefined;
    if (entry.matchUpStatus !== BYE || entry.winningSide || entry.loserMatchUpId || entry.schedule?.scoredTime)
      return undefined;
    if (!scoreless(entry) || entry.matchUpStatusCodes?.length || hasReason(entry)) return undefined;
    const side = entry.sides?.find((candidate) => candidate.participantId === carrier.participantId);
    if (!side?.sideNumber || side.drawPosition !== carrier.drawPosition) return undefined;
    if (!entry.sides?.find((candidate) => candidate.sideNumber === 3 - side.sideNumber!)?.bye) return undefined;
    const provenance = entry.sideExitProvenance ?? {};
    const held = provenance[side.sideNumber];
    if (Object.keys(provenance).length !== 1 || held?.sourceMatchUpId !== origin.sourceMatchUpId) return undefined;
    if (held.matchUpStatus !== origin.matchUpStatus || !SINGLE_EXITS.has(held.previousMatchUpStatus)) return undefined;
    relays.push({ entry, side: side.sideNumber });
    seen.add(entry.matchUpId);
    entry = indexed(view, entry.winnerMatchUpId);
  }
  return relays;
}

/** v1 starts at the first eligible BYE in stored order, then follows the carrier.
 * A home stored before an earlier relay resolves the landing without revisiting that relay. */
function replayedByes(seat: CarriedByeSeat, drawDefinition: DrawDefinition) {
  const relays = [...seat.relays, { entry: seat.home, side: seat.carrier.sideNumber }];
  const ids = new Set(relays.map(({ entry }) => entry.matchUpId));
  const first = getMatchUpsMap({ drawDefinition }).drawMatchUps.find((entry) => ids.has(entry.matchUpId))!;
  return relays.slice(relays.findIndex(({ entry }) => entry.matchUpId === first.matchUpId));
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
  drawDefinition: DrawDefinition,
  isTeam: boolean,
): { ops: OutcomeOp[]; after: OutcomeOp[] } {
  const { home, drawPosition, landing, origin } = seat;
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
            ...landing.carrierArrival,
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
      ...replayedByes(seat, drawDefinition).flatMap(({ entry, side }): OutcomeOp[] => [
        {
          op: 'mergeSideExitProvenance',
          matchUpId: entry.matchUpId,
          provenance: provenance(side),
          announcedAs: 'progressExitStatus',
        },
        { op: 'stampUpdatedAt', entity: 'matchUp', id: entry.matchUpId },
      ]),
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
