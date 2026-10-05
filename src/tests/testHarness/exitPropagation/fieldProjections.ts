import tournamentEngine from '@Engines/syncEngine';

/**
 * WHAT THE COMPARISON ORACLES COULD NOT SEE — coverage assessment gap G14.
 *
 * `projectDraw`, `projectByCoordinate` (the route differential) and `matchUpSignature` (the deep
 * correction oracle) each project the fields the propagation pipeline is MEANT to write: status,
 * winner, score, positions, provenance, positionAssignments. A divergence anywhere else passed every
 * comparison. Measured blind, 2026-09-16 (`ERROR_ATOMICITY_ROUTES_ASSESSED.md`): `updatedAt`,
 * `lineUp`, `schedule`, `seedAssignments`, `entries` and `extensions`. G13 put `schedule` under test
 * with an arm of its own. This module projects the rest, one projection per field, so a difference is
 * reported against the field that holds it.
 *
 * ## Keys survive regeneration; ids are rewritten
 *
 * Both oracles compare two draws GENERATED SEPARATELY from one seed. Under `nonRandom` the
 * participantIds, `eventId` and `structureId`s repeat, but every `matchUpId` is fresh (measured
 * 2026-10-05), so nothing is keyed on an id and any matchUp, structure or event id found inside a
 * projected VALUE is rewritten to its coordinate or name. An extension that records a matchUpId would
 * otherwise differ on every cell, which is UUID churn rather than signal.
 *
 * ## `updatedAt` is deliberately NOT a field here
 *
 * Two runs stamp different clocks, so every cross-path comparison of `updatedAt` differs and none is
 * information. What `updatedAt` can testify to is atomicity — a refused write that stamps the draw
 * has mutated it — and that question belongs to the per-step property (`checkErrorAtomicity`), which
 * compares one draw with itself. See `touchedStamps` below for the reading that property needs.
 *
 * Measured with it 2026-10-05 (`dev` `16be693480`, the first 150 seeds of each frozen census window,
 * 2,348 refused writes): the stamps moved on ONE refusal, census w2 9100023, the DOUBLE_ELIMINATION
 * `ERR_EXISTING_POSITION_ASSIGNMENT` already caught as `ERROR_IMPLIES_NO_MUTATION` because `hash`
 * moved with them. No refusal stamped the draw without also changing what `hash` sees, so the stamps
 * are not wired into that property yet. Stamps are millisecond strings, so a write and its read inside
 * one millisecond would hide; the count is a floor.
 *
 * ## A zero is only as good as its input
 *
 * The draws both oracles generate are UNSEEDED and none is TEAM, so `seedAssignments` and `lineUp`
 * project empty on every cell: their zero is vacuous there and `exercised` says so. The planted
 * divergences in `fieldProjections.test.ts` prove each projection and its wiring see a change; they
 * cannot make an oracle's inputs exercise a field it never populates.
 */

export const FIELD_NAMES = ['entries', 'seedAssignments', 'extensions', 'lineUp'] as const;
export type FieldName = (typeof FIELD_NAMES)[number];
export type FieldProjection = Record<FieldName, Record<string, string>>;
export type FieldDivergence = { field: FieldName; key: string; a: string; b: string };

const VOLATILE_KEY = /(createdAt|updatedAt|timeStamp|TimeStamp)$/;

const coordinate = (matchUp: any, structureName: string) =>
  `${structureName}|${matchUp.roundNumber ?? '-'}|${matchUp.roundPosition ?? '-'}`;

/** Every generated id in the event, mapped to a name that survives regeneration. */
function idNames(event: any, drawDefinition: any): Map<string, string> {
  const names = new Map<string, string>();
  if (event?.eventId) names.set(event.eventId, 'EVENT');
  const walk = (structures: any[]) => {
    for (const structure of structures ?? []) {
      names.set(structure.structureId, `S:${structure.structureName}`);
      for (const matchUp of structure.matchUps ?? []) {
        names.set(matchUp.matchUpId, `M:${coordinate(matchUp, structure.structureName)}`);
        for (const tieMatchUp of matchUp.tieMatchUps ?? []) {
          names.set(
            tieMatchUp.matchUpId,
            `M:${coordinate(matchUp, structure.structureName)}#${tieMatchUp.collectionId}.${tieMatchUp.collectionPosition}`,
          );
        }
      }
      if (structure.structures?.length) walk(structure.structures);
    }
  };
  walk(drawDefinition?.structures ?? []);
  return names;
}

/** Volatile keys dropped, object keys sorted, generated ids renamed: one stable string per value. */
function render(value: any, names: Map<string, string>): string {
  const canonical = (node: any): any => {
    if (typeof node === 'string') return names.get(node) ?? node;
    if (Array.isArray(node)) return node.map(canonical);
    if (node && typeof node === 'object') {
      const out: Record<string, any> = {};
      for (const key of Object.keys(node).sort((a, b) => a.localeCompare(b))) {
        if (VOLATILE_KEY.test(key) || node[key] === undefined) continue;
        out[key] = canonical(node[key]);
      }
      return out;
    }
    return node;
  };
  return JSON.stringify(canonical(value));
}

function eachStructure(drawDefinition: any, visit: (structure: any) => void) {
  const walk = (structures: any[]) => {
    for (const structure of structures ?? []) {
      visit(structure);
      if (structure.structures?.length) walk(structure.structures);
    }
  };
  walk(drawDefinition?.structures ?? []);
}

const entryKey = (scope: string, entry: any) => `${scope}|${entry.participantId}|${entry.entryStage ?? '-'}`;

/** Project one event's draw by field. Pure: callers hand it the records, so a test can plant into copies. */
export function projectFieldsOf({ event, drawDefinition }: { event: any; drawDefinition: any }): FieldProjection {
  const names = idNames(event, drawDefinition);
  const projection: FieldProjection = { entries: {}, seedAssignments: {}, extensions: {}, lineUp: {} };
  const put = (field: FieldName, key: string, value: any) => {
    projection[field][key] = render(value, names);
  };
  const putExtensions = (scope: string, extensions: any[] | undefined) => {
    for (const extension of extensions ?? []) put('extensions', `${scope}|${extension.name}`, extension.value);
  };

  for (const entry of event?.entries ?? []) put('entries', entryKey('event', entry), entry);
  for (const entry of drawDefinition?.entries ?? []) put('entries', entryKey('draw', entry), entry);

  putExtensions('event', event?.extensions);
  putExtensions('draw', drawDefinition?.extensions);

  eachStructure(drawDefinition, (structure) => {
    const { structureName } = structure;
    for (const seed of structure.seedAssignments ?? [])
      put('seedAssignments', `${structureName}|${seed.seedNumber}`, seed);
    putExtensions(`S:${structureName}`, structure.extensions);
    for (const assignment of structure.positionAssignments ?? [])
      putExtensions(`A:${structureName}|${assignment.drawPosition}`, assignment.extensions);
    for (const matchUp of structure.matchUps ?? []) {
      const at = coordinate(matchUp, structureName);
      putExtensions(`M:${at}`, matchUp.extensions);
      for (const side of matchUp.sides ?? []) {
        if (side?.lineUp?.length) {
          const lineUp = side.lineUp
            .slice()
            .sort((a: any, b: any) => String(a.participantId).localeCompare(String(b.participantId)));
          put('lineUp', `${at}|${side.sideNumber}`, lineUp);
        }
      }
    }
  });

  return projection;
}

/** Project the draw `drawId` names in the engine's current state. */
export function projectFields(drawId: string): FieldProjection {
  const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
  return projectFieldsOf({ event, drawDefinition });
}

export function diffFields(a: FieldProjection, b: FieldProjection): FieldDivergence[] {
  const divergences: FieldDivergence[] = [];
  for (const field of FIELD_NAMES) {
    const keys = new Set([...Object.keys(a[field]), ...Object.keys(b[field])]);
    for (const key of keys) {
      const left = a[field][key] ?? 'ABSENT';
      const right = b[field][key] ?? 'ABSENT';
      if (left !== right) divergences.push({ field, key, a: left, b: right });
    }
  }
  return divergences.sort((x, y) => `${x.field}|${x.key}`.localeCompare(`${y.field}|${y.key}`));
}

export const renderFieldDivergence = ({ field, key, a, b }: FieldDivergence) => `F:${field}:${key} A=${a} B=${b}`;

/** Which fields hold anything at all — the control that says whether a zero meant something. */
export function exercised(projection: FieldProjection): Record<FieldName, boolean> {
  return Object.fromEntries(FIELD_NAMES.map((field) => [field, Object.keys(projection[field]).length > 0])) as Record<
    FieldName,
    boolean
  >;
}

/**
 * Every `updatedAt` in the draw, keyed by name — for a property comparing ONE draw before and after a
 * step. Cross-path oracles must not use it (see the docblock above).
 */
export function touchedStamps(drawDefinition: any): Record<string, string | undefined> {
  const stamps: Record<string, string | undefined> = { draw: drawDefinition?.updatedAt };
  eachStructure(drawDefinition, (structure) => {
    stamps[`S:${structure.structureName}`] = structure.updatedAt;
    for (const matchUp of structure.matchUps ?? [])
      stamps[`M:${coordinate(matchUp, structure.structureName)}`] = matchUp.updatedAt;
  });
  return stamps;
}
