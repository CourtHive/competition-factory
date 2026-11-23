/**
 * What part of a tournament record a mutation reads and may write: its FOOTPRINT. A storage layer that keeps a
 * record in parts (a shell, one row per drawDefinition, one row per participant) loads only these before running
 * the method, and writes back only these after.
 *
 * - `shell`             the tournament without its participants, its events without their drawDefinitions. Every
 *                       footprint holds it: policies, entries and extensions resolve from it, and the engine stamps
 *                       the record it modified.
 * - `draw`              the drawDefinitions named by `drawIds`.
 * - `drawParticipants`  the participants those draws reference, with their individuals and groupings
 *                       (`getReferencedParticipants`).
 * - `eventDraws`        every drawDefinition of the events named by `eventIds`.
 * - `participants`      every participant.
 * - `tournament`        the whole record.
 *
 * A footprint is a function of the method AND its params: `entryStatus`, `proConflictDetection`, and a `drawId`
 * versus an `eventId` move one method between draw, event and tournament scope. A method with no entry here is the
 * whole record, so the map grows one method at a time and an unknown method is never under-loaded: a missing entry
 * costs speed, never a wrong answer.
 *
 * Declared against the engine's code and checked by `src/tests/mutations/footprint/`, which runs each declared method
 * on a record reduced to its footprint and on the whole record and fails when they differ, or when the whole-record
 * run writes outside the footprint.
 */
export type FootprintShard = 'shell' | 'draw' | 'drawParticipants' | 'eventDraws' | 'participants' | 'tournament';
