/**
 * Compile-time assertions for `assignSeedPositions`' `event` parameter, checked by `pnpm check-types`.
 *
 * The parameter once resolved to the DOM `Event` because the CODES type was not imported, so a CODES
 * event did not compile as an argument. Type-only and imported by nothing (see structureUnions.ts).
 */
import type { assignSeedPositions } from '@Mutate/events/assignSeedPositions';
import type { Event } from '@Types/tournamentTypes';

type Assignable<A, B> = [A] extends [B] ? true : false;
type Expect<T extends true> = T;
type ExpectNot<T extends false> = T;

type EventParam = Parameters<typeof assignSeedPositions>[0]['event'];

export type AssignSeedPositionsEventAssertions = [
  // a CODES event is what the method takes
  Expect<Assignable<Event, EventParam>>,
  // a DOM event is not
  ExpectNot<Assignable<globalThis.Event, EventParam>>,
];
