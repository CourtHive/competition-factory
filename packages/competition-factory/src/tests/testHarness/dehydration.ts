import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';

/**
 * Test harness for matchUp dehydration.
 *
 * A stored matchUp and the matchUp a query returns are different shapes. Queries HYDRATE: they copy event, draw and
 * structure context onto every matchUp, resolve each side's participant (and, in a TEAM event, the side's team), and
 * derive a collection matchUp's drawPositions and round from its tie. A record assembled from query output — the
 * public `getEventData` payload is one — carries all of that, and a TEAM event carries it once per collection
 * matchUp per side, which is how a 5.5 MB record arrived at 19.7 MB.
 *
 * Dehydration must undo exactly that and nothing more. The harness checks it against a record whose stored shape is
 * known (a mocksEngine record), by hydrating it the two ways the factory hydrates and requiring the dehydrated result
 * to equal the original.
 */

/** Keys that appear only on a hydrated matchUp; one surviving dehydration is a defect wherever it is found. */
export const HYDRATION_ONLY_MATCHUP_KEYS = [
  'abbreviatedRoundName',
  'allParticipantsCheckedIn',
  'checkedInParticipantIds',
  'containerStructureId',
  'drawId',
  'drawName',
  'drawPositionsRange',
  'drawType',
  'eventDrawsCount',
  'eventId',
  'eventName',
  'eventType',
  'feedRound',
  'gender',
  'hasContext',
  'isRoundRobin',
  'matchUpTieId',
  'preFeedRound',
  'readyToScore',
  'roundFactor',
  'roundOfPlay',
  'stage',
  'stageSequence',
  'structureId',
  'structureName',
  'tournamentId',
];

/** Keys that appear only on a hydrated side. */
export const HYDRATION_ONLY_SIDE_KEYS = ['participant', 'teamParticipant', 'bye', 'qualifier', 'seedValue'];

export function structuresOf(tournamentRecord: any): any[] {
  const out: any[] = [];
  const walk = (structure: any) => {
    out.push(structure);
    for (const child of structure.structures ?? []) walk(child);
  };
  for (const event of tournamentRecord.events ?? [])
    for (const drawDefinition of event.drawDefinitions ?? [])
      for (const structure of drawDefinition.structures ?? []) walk(structure);
  return out;
}

/** Every matchUp in the record, collection matchUps included, as stored (no copies). */
export function storedMatchUpsOf(tournamentRecord: any): any[] {
  const out: any[] = [];
  for (const structure of structuresOf(tournamentRecord))
    for (const matchUp of structure.matchUps ?? []) {
      out.push(matchUp);
      for (const tieMatchUp of matchUp.tieMatchUps ?? []) out.push(tieMatchUp);
    }
  return out;
}

/**
 * Replace every stored matchUp with its hydrated (`inContext`) version, as a record assembled from query output
 * would hold it. Returns a new record; the input is not touched.
 */
export function hydrateRecord(tournamentRecord: any): any {
  const record = structuredClone(tournamentRecord);
  const hydrated = allTournamentMatchUps({ tournamentRecord: record, inContext: true }).matchUps ?? [];
  const byId = new Map(hydrated.map((m: any) => [m.matchUpId, structuredClone(m)]));
  for (const structure of structuresOf(record)) {
    if (!structure.matchUps) continue;
    structure.matchUps = structure.matchUps.map((m: any) => byId.get(m.matchUpId) ?? m);
  }
  return record;
}

export interface HydrationLeftover {
  matchUpId: string;
  where: 'matchUp' | 'side' | 'lineUp';
  key: string;
}

/** Every hydration-only key still present anywhere in the record's matchUps. */
export function hydrationLeftovers(tournamentRecord: any): HydrationLeftover[] {
  const found: HydrationLeftover[] = [];
  for (const matchUp of storedMatchUpsOf(tournamentRecord)) {
    for (const key of HYDRATION_ONLY_MATCHUP_KEYS)
      if (key in matchUp) found.push({ matchUpId: matchUp.matchUpId, where: 'matchUp', key });
    for (const side of matchUp.sides ?? []) {
      for (const key of HYDRATION_ONLY_SIDE_KEYS)
        if (key in side) found.push({ matchUpId: matchUp.matchUpId, where: 'side', key });
      for (const competitor of side.lineUp ?? [])
        if ('participant' in competitor)
          found.push({ matchUpId: matchUp.matchUpId, where: 'lineUp', key: 'participant' });
    }
  }
  return found;
}

/**
 * JSON with object keys sorted, so two records compare by content rather than by key order. An empty array is
 * dropped: an empty `matchUpStatusCodes` and an absent one record the same fact, and hydration does not keep empties.
 * So is an empty `schedule`, which migration writes and hydration adds.
 */
export function canonical(value: any): string {
  const sort = (v: any): any => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.keys(v)
          .filter((k) => !(Array.isArray(v[k]) && v[k].length === 0))
          .filter((k) => !(k === 'schedule' && v[k] && typeof v[k] === 'object' && !Object.keys(v[k]).length))
          .sort((a, b) => a.localeCompare(b))
          .map((k) => [k, sort(v[k])]),
      );
    return v;
  };
  return JSON.stringify(sort(value));
}

/** The record's matchUps keyed by matchUpId, canonicalised: the unit two records are compared in. */
export function matchUpsById(tournamentRecord: any): Record<string, any> {
  return Object.fromEntries(storedMatchUpsOf(tournamentRecord).map((m) => [m.matchUpId, JSON.parse(canonical(m))]));
}

/**
 * Remove every value the engine would derive anyway: a matchUpFormat equal to its structure's, draw's or event's (a
 * collection matchUp's: its collectionDefinition's), a tie's tieFormat equal to its draw's or event's, an individual
 * matchUp's matchUpType equal to its event's, and the sides of a non-collection matchUp that hold nothing but their
 * numbering (the engine stores an unplayed tie both with and without them). Stored or derived, these mean the same
 * thing — invariant 5 of the harness proves the engine reads them identically — and a hydrated record cannot say
 * which it was. Returns a copy.
 */
export function withoutDerivedValues(tournamentRecord: any): any {
  const record = structuredClone(tournamentRecord);
  const same = (a: any, b: any) => canonical(a) === canonical(b);
  for (const event of record.events ?? []) {
    for (const drawDefinition of event.drawDefinitions ?? []) {
      const walk = (structure: any, format?: string, tieFormat?: any) => {
        const matchUpFormat = structure.matchUpFormat || format;
        const inheritedTieFormat = structure.tieFormat || tieFormat;
        for (const matchUp of structure.matchUps ?? []) {
          if (matchUpFormat && matchUp.matchUpFormat === matchUpFormat) delete matchUp.matchUpFormat;
          const isTie = Array.isArray(matchUp.tieMatchUps);
          if (!isTie && matchUp.matchUpType === (drawDefinition.matchUpType || event.eventType))
            delete matchUp.matchUpType;
          if (isTie && inheritedTieFormat && matchUp.tieFormat && same(matchUp.tieFormat, inheritedTieFormat)) {
            delete matchUp.tieFormat;
          }
          const numberingOnly = (side: any) =>
            Object.keys(side).every((k) => ['sideNumber', 'drawPosition', 'displaySideNumber'].includes(k));
          if (Array.isArray(matchUp.sides) && matchUp.sides.every(numberingOnly)) delete matchUp.sides;
          const ownTieFormat = matchUp.tieFormat || inheritedTieFormat;
          for (const collectionMatchUp of matchUp.tieMatchUps ?? []) {
            const definition = ownTieFormat?.collectionDefinitions?.find(
              (d: any) => d.collectionId === collectionMatchUp.collectionId,
            );
            if (definition?.matchUpFormat && collectionMatchUp.matchUpFormat === definition.matchUpFormat) {
              delete collectionMatchUp.matchUpFormat;
            }
          }
        }
        for (const child of structure.structures ?? []) walk(child, matchUpFormat, inheritedTieFormat);
      };
      for (const structure of drawDefinition.structures ?? [])
        walk(
          structure,
          drawDefinition.matchUpFormat || event.matchUpFormat,
          drawDefinition.tieFormat || event.tieFormat,
        );
    }
  }
  return record;
}
