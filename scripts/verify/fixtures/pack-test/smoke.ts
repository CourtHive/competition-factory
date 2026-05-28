/**
 * Standalone consumer smoke for the published factory dist.
 *
 * Imports a representative slice of the public surface from the installed
 * tarball (NOT from the source tree). If any of these imports fail to type,
 * the dist `.d.ts` is referencing something that didn't make it into the
 * published artifact — caught here, before users hit it.
 */

import {
  tournamentEngine,
  syncEngine,
  mocksEngine,
  globalState,
  forge,
  factoryConstants,
  topicConstants,
  // Exported as `version` (the source name `factoryVersion` is aliased at the
  // package boundary). Aliased to `factoryVersion` here to avoid shadowing.
  version as factoryVersion,
} from 'tods-competition-factory';

import type {
  FactoryEngineTyped,
  FactoryEngineMethod,
  MethodSignatures,
  Tournament,
  Event,
  MatchUp,
  Participant,
  DrawDefinition,
  Venue,
  HydratedMatchUp,
  HydratedParticipant,
} from 'tods-competition-factory';

// --- Cast to the typed engine surface ---

const engine = tournamentEngine as unknown as FactoryEngineTyped;

// --- Engine method via the typed surface (typed param + return) ---

const result = engine.getEvents({ tournamentRecord: { tournamentId: 't' } as Tournament });
const events: Event[] | undefined = result.events;
void events;

// --- engine.q.* returns typed values without casts ---

const eventList: Event[] = engine.q.events();
const oneEvent: Event | undefined = engine.q.event();
const tournament: Tournament | undefined = engine.q.tournament();
const matchUps: HydratedMatchUp[] = engine.q.matchUps();
void eventList;
void oneEvent;
void tournament;
void matchUps;

// --- engine.inspect() returns the typed snapshot ---

const snap = engine.inspect();
const version: string = snap.version;
const counts = snap.loaded.counts;
void version;
void counts.matchUps;

// --- engine.on returns Unsubscribe and is per-topic typed ---
// The handler's `payload` is inferred from the topic literal — no annotation
// needed. FactoryEngineTyped inlines the generic so contextual typing flows
// through the cast.

const off = engine.on('addMatchUps', (payload) => {
  const tid: string = payload.tournamentId;
  const items: MatchUp[] = payload.matchUps;
  void tid;
  void items;
});
off();

// --- engine.build.event is chainable + .toRequest typed ---

const request = engine.build.event({ eventName: 'Smoke' }).singles().draw(8).toRequest();
const eventId: string = request.eventId;
const drawIds: string[] = request.drawIds;
void eventId;
void drawIds;

// --- closed surface: unknown methods fail at compile time ---

// @ts-expect-error — `notAMethod` is not in FactoryEngineMethod
const _unknown = engine.notAMethod;
void _unknown;

// --- type-only smoke for the rest of the dist surface ---

const _typedMethod: keyof MethodSignatures = 'getEvents';
const _knownMethod: FactoryEngineMethod = 'getEvent';
const _participants: Participant[] | undefined = undefined;
const _drawDefinitions: DrawDefinition[] | undefined = undefined;
const _venues: Venue[] | undefined = undefined;
const _hydrated: HydratedParticipant[] | undefined = undefined;
void _typedMethod;
void _knownMethod;
void _participants;
void _drawDefinitions;
void _venues;
void _hydrated;

// --- legacy / non-typed engine exports still importable ---

void syncEngine;
void mocksEngine;
void globalState;
void forge;
void factoryConstants;
void topicConstants;
void factoryVersion;

console.log('verify:pack — smoke imports compiled');
