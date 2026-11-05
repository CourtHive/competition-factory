import type { MatchUp, PositionAssignment, Structure } from '@Types/tournamentTypes';

/**
 * What a structure holds, read without asking which kind of structure it is.
 *
 * `Structure` is a discriminated union (`ItemStructure | ContainerStructure`). In its soft form every reader
 * may still write `structure.matchUps`; in the 8.0.0 form that read does not compile until the code has
 * narrowed (Mentat/planning/FACTORY_STRUCTURE_UNIONS_8_0_0.md). These accessors are the bridge: each returns
 * EXACTLY what the property read returns today, on every record, so a site converted to them changes no
 * behaviour, and each narrows through `in`, which compiles under both forms.
 *
 * They deliberately do not consult `structureType`. Stored records mostly omit it on items, and some readers
 * test a container by the presence of `structures` rather than by its type; an accessor that switched on
 * `structureType` would answer differently for exactly those records.
 */
export function matchUpsOf(structure?: Structure): MatchUp[] | undefined {
  return structure && 'matchUps' in structure ? structure.matchUps : undefined;
}

export function positionAssignmentsOf(structure?: Structure): PositionAssignment[] | undefined {
  return structure && 'positionAssignments' in structure ? structure.positionAssignments : undefined;
}

export function structuresOf(structure?: Structure): Structure[] | undefined {
  return structure && 'structures' in structure ? structure.structures : undefined;
}
