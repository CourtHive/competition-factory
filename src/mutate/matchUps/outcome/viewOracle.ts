import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { canonicalJson } from '@Tools/canonicalJson';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * THE VIEW ORACLE (executor plan § 3.2; S2). Test-only, `differential` only: after every complete plan, the working
 * view the plan was folded into is compared with one hydration of the shadow-applied record. A field that differs is
 * an invalidation the overlay missed, reported as a divergence keyed `view:<field>` before v2 ever writes.
 *
 * The fields are § 3.2's table: what the factory's queries or v2 read and a write can change.
 */
const SIDE_FIELDS = ['sideNumber', 'participantId', 'bye', 'qualifier', 'drawPosition'] as const;
const FIELDS = [
  'matchUpStatus',
  'winningSide',
  'score',
  'schedule',
  'drawPositions',
  'drawPositionsRange',
  'finishingPositionRange',
  'feedRound',
  'hasFedDrawPosition',
  'preFeedRound',
  'roundFactor',
  'readyToScore',
  'winnerMatchUpId',
  'loserMatchUpId',
  'sideExitProvenance',
  'byeClaims',
] as const;

type Json = Record<string, unknown>;
export type ViewComparison =
  { equal: true } | { equal: false; field: string; matchUp: string; view: string; record: string };

/** canonical, so key order is not a difference; `undefined` (an absent field) has no JSON form */
const canonical = (value: unknown) => (value === undefined ? 'absent' : canonicalJson(value));
const shown = (value: unknown) => (value === undefined ? 'absent' : JSON.stringify(value)?.slice(0, 120));
const coordinate = (matchUp: HydratedMatchUp) =>
  `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function fieldOf(matchUp: HydratedMatchUp | undefined, field: string): unknown {
  const value = (matchUp as unknown as Json | undefined)?.[field];
  if (field === 'drawPositions' && Array.isArray(value)) return value.filter(Boolean);
  return value;
}

function sidesOf(matchUp: HydratedMatchUp | undefined) {
  return (matchUp?.sides ?? []).map((side) =>
    Object.fromEntries(SIDE_FIELDS.map((field) => [field, (side as unknown as Json)?.[field]])),
  );
}

/** hydrate the shadow-applied record's draw once: the record as the plan says it stands */
export function hydrateShadow({ shadow, drawId }: { shadow: Json; drawId: string }): HydratedMatchUp[] | undefined {
  for (const event of (shadow.events as Json[] | undefined) ?? []) {
    const drawDefinition = ((event.drawDefinitions as Json[] | undefined) ?? []).find((draw) => draw.drawId === drawId);
    if (!drawDefinition) continue;
    return getAllDrawMatchUps({
      tournamentRecord: shadow as unknown as Tournament,
      drawDefinition: drawDefinition as unknown as DrawDefinition,
      event: event as unknown as Event,
      inContext: true,
    }).matchUps;
  }
  return undefined;
}

/** every matchUp of the record, every field of § 3.2, against the working view: the first difference */
export function compareViews({ record, view }: { record: HydratedMatchUp[]; view: HydratedMatchUp[] }): ViewComparison {
  const viewById = new Map(view.map((matchUp) => [matchUp.matchUpId, matchUp]));
  for (const recorded of record) {
    const viewed = viewById.get(recorded.matchUpId);
    const sides = [canonical(sidesOf(viewed)), canonical(sidesOf(recorded))];
    if (sides[0] !== sides[1])
      return { equal: false, field: 'sides', matchUp: coordinate(recorded), view: sides[0], record: sides[1] };
    for (const field of FIELDS) {
      const [a, b] = [canonical(fieldOf(viewed, field)), canonical(fieldOf(recorded, field))];
      if (a !== b)
        return {
          record: shown(fieldOf(recorded, field)),
          view: shown(fieldOf(viewed, field)),
          matchUp: coordinate(recorded),
          equal: false,
          field,
        };
    }
  }
  return { equal: true };
}
