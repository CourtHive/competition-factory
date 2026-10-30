import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { DrawDefinition, Event, MatchUp, Side } from '@Types/tournamentTypes';
import { HydratedMatchUp, HydratedSide } from '@Types/hydrated';
import { LINEUPS } from '@Constants/extensionConstants';

type EnsureSideLineUpsArgs = {
  inContextDualMatchUp?: HydratedMatchUp;
  drawDefinition: DrawDefinition;
  tournamentId?: string;
  dualMatchUp?: MatchUp;
  eventId?: string;
  /**
   * Required to resolve a CENTRALIZED tieFormat during hydration below. After
   * `aggregateTieFormats()` a matchUp carries `tieFormatId` rather than an inline
   * `tieFormat`, and resolving that reference needs `event.tieFormats[]`. Passing
   * only `eventId` is not enough — every caller already has the object.
   */
  event?: Event;
};
export function ensureSideLineUps({
  inContextDualMatchUp,
  drawDefinition,
  tournamentId,
  dualMatchUp,
  eventId,
  event,
}: EnsureSideLineUpsArgs) {
  if (dualMatchUp) {
    inContextDualMatchUp ??= findDrawMatchUp({
      matchUpId: dualMatchUp.matchUpId,
      inContext: true,
      drawDefinition,
      event,
    })?.matchUp;

    dualMatchUp.sides = ensuredDualSides({
      lineUps: firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }),
      contextSides: inContextDualMatchUp?.sides,
      rawSides: dualMatchUp.sides,
    });

    modifyMatchUpNotice({
      context: 'ensureSidLineUps',
      matchUp: dualMatchUp,
      drawDefinition,
      tournamentId,
      eventId,
      event,
    });
  }
}

/**
 * THE SIDES A DUAL STORES, given the sides in context and the draw's line-ups: each side's position details from its
 * context side, and its lineUp the stored one where it has one, else the team's reference lineUp from the draw. Pure:
 * `ensureSideLineUps` writes it, and the outcome view (S7) asks it whether that write would change anything.
 *
 * THE RAW SIDE IS MATCHED BY DRAWPOSITION, NOT BY SIDENUMBER — a side's number is not stable.
 *
 * A team that reaches a dual alone sits on side 1 (`draw-positions.md` rule 4), and its lineUp
 * is written to the raw side 1. When the lower position arrives — a fed BYE, a later-advanced
 * opponent — the sides re-sort and the team is side 2. Matching the raw side by number then hands
 * the team's lineUp to whoever now holds side 1, and the team's own side falls back to the
 * reference lineUp from the draw. Line hydration keys by drawPosition (`getCollectionAssignment`),
 * so the stale record put ONE player on both sides of every line, and the driver scored them.
 *
 * Measured 2026-10-01 on the TEAM arm of the exit-propagation matrix, FIRST_MATCH_LOSER_CONSOLATION
 * with lineups: `Consolation|2|1` reads `[BYE, team]` with the lineUp on side 1 — the BYE — and
 * `BYE_WON` on 56 of 60 cells (the consolation's auto-calc awarded the dual to its BYE side).
 * A side that holds no participant holds no lineUp, whatever the raw record says.
 */
/** a dual's stored side: the position details this rule writes onto it are not in the stored type */
type StoredDualSide = Side & { drawPosition?: number; displaySideNumber?: number };

export function ensuredDualSides({
  contextSides,
  rawSides = [],
  lineUps,
}: {
  contextSides?: HydratedSide[];
  rawSides?: StoredDualSide[];
  lineUps?: unknown;
}) {
  const referenceLineUps = makeDeepCopy(lineUps ?? {}, false, true);
  return contextSides?.map((contextSide) => {
    const { displaySideNumber, drawPosition, sideNumber, participantId } = contextSide;
    const referenceLineUp = (participantId && referenceLineUps[participantId]) || undefined;
    const rawSide =
      (drawPosition && rawSides.find((side) => side.drawPosition && side.drawPosition === drawPosition)) ??
      rawSides.find((side) => !side.drawPosition && side.sideNumber === sideNumber);
    const { lineUp: noContextLineUp, ...noContextSideDetail } = rawSide ?? {};
    const retainedLineUp = noContextLineUp?.length ? noContextLineUp : referenceLineUp;
    const lineUp = participantId ? retainedLineUp : undefined;
    return { ...noContextSideDetail, drawPosition, sideNumber, displaySideNumber, lineUp };
  });
}
