import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';

// types
import { MatchUp, Tournament } from '@Types/tournamentTypes';

export type MatchUpLocation = {
  /** the structure that holds the matchUp: for a round robin, the group */
  structureId: string;
  /** the round robin the group belongs to, the structure in `drawDefinition.structures` */
  containerStructureId?: string;
  eventId: string;
  drawId: string;
};

type MatchUpLocationIndex = {
  /** ids held by more than one stored matchUp; their hydrated order decides which one is found */
  duplicated: Set<string>;
  /** a matchUp whose own record names an eventId or drawId: hydration lets that name win */
  selfNamed: Set<string>;
  locations: Map<string, MatchUpLocation>;
};

/**
 * WHERE EVERY STORED MATCHUP LIVES, READ WITHOUT HYDRATING ANY OF THEM.
 *
 * A lookup by a bare matchUpId used to hydrate every matchUp in the tournament (`allTournamentMatchUps`) only to
 * read `eventId` and `drawId` off the one it wanted. This walks the stored structures instead: the same members
 * `getMatchUpsMap` reads (a round robin's groups rather than its container, and every dual's tieMatchUps), so
 * whatever the hydrated walk could find, this finds.
 *
 * The index belongs to ONE invocation. It is built from the record as it is now and is never cached: a
 * mutation between two lookups cannot leave a stale entry behind, and asyncEngine's per-request state stays
 * the only state there is.
 */
export function getMatchUpLocationIndex({ tournamentRecord }: { tournamentRecord: Tournament }): MatchUpLocationIndex {
  const locations = new Map<string, MatchUpLocation>();
  const duplicated = new Set<string>();
  const selfNamed = new Set<string>();

  const add = (matchUp: MatchUp, location: MatchUpLocation, container?: MatchUp) => {
    const { matchUpId } = matchUp;
    if (locations.has(matchUpId)) duplicated.add(matchUpId);
    else locations.set(matchUpId, location);
    const named = (m?: MatchUp & { eventId?: string; drawId?: string }) =>
      m?.eventId !== undefined || m?.drawId !== undefined;
    if (named(matchUp) || named(container)) selfNamed.add(matchUpId);
  };

  const addMatchUps = (matchUps: MatchUp[] | undefined, location: MatchUpLocation) => {
    for (const matchUp of matchUps ?? []) {
      add(matchUp, location);
      for (const tieMatchUp of matchUp.tieMatchUps ?? []) add(tieMatchUp, location, matchUp);
    }
  };

  for (const event of tournamentRecord?.events ?? []) {
    const { eventId } = event;
    for (const drawDefinition of event.drawDefinitions ?? []) {
      const { drawId } = drawDefinition;
      for (const structure of drawDefinition.structures ?? []) {
        if (!structure || typeof structure !== 'object') continue;
        const { structureId } = structure;
        const groups = structuresOf(structure);
        if (Array.isArray(groups)) {
          for (const group of groups) {
            const location = { eventId, drawId, structureId: group.structureId, containerStructureId: structureId };
            addMatchUps(matchUpsOf(group), location);
          }
        } else {
          addMatchUps(matchUpsOf(structure), { eventId, drawId, structureId });
        }
      }
    }
  }

  return { locations, duplicated, selfNamed };
}

type LocateMatchUpResult = {
  location?: MatchUpLocation;
  /**
   * false when the hydrated walk might answer differently, and only it can say how: the id is held twice, the
   * matchUp names its own event or draw, or it is one of the tournament's standalone matchUps. The caller then
   * takes the hydrated walk. Otherwise the location (or its absence) is exactly what that walk would report.
   */
  exact: boolean;
};

export function locateMatchUp({
  tournamentRecord,
  matchUpId,
}: {
  tournamentRecord: Tournament;
  matchUpId: string;
}): LocateMatchUpResult {
  const { locations, duplicated, selfNamed } = getMatchUpLocationIndex({ tournamentRecord });
  if (duplicated.has(matchUpId) || selfNamed.has(matchUpId)) return { exact: false };

  const location = locations.get(matchUpId);
  if (location) return { location, exact: true };

  const standalone = tournamentRecord?.matchUps?.some((matchUp) => matchUp?.matchUpId === matchUpId);
  return { exact: !standalone };
}
