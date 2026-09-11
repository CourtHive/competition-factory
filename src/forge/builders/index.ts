/**
 * engine.build — fluent builders facade (developer-JOY #6).
 *
 * v1 surface:
 *   - `engine.build.event(seed?)`       → EventBuilder
 *   - `engine.build.participant()`      → ParticipantBuilder
 *
 * Deferred to v2: playoffs builder, full tieFormat chain, multi-flight draws
 * within one EventBuilder, separate person registry. See
 * `Mentat/planning/FACTORY_DEVELOPER_JOY_6_FLUENT_BUILDERS_DESIGN.md`.
 *
 * Mounted on the engine in `assemblies/engines/parts/engineStart.ts` after
 * the other forge facades; takes an `engine` reference so terminal verbs
 * dispatch through `engine.executionQueue` (and thus fire bus notices).
 */

import { EventBuilder } from './EventBuilder';
import { ParticipantBuilder } from './ParticipantBuilder';

import type { EventSeed } from './types';
import type { FactoryEngine } from '@Types/factoryTypes';

export interface BuildFacade {
  event(seed?: Partial<EventSeed>): EventBuilder;
  participant(): ParticipantBuilder;
}

export function buildFacade(engine: FactoryEngine): BuildFacade {
  return {
    event: (seed) => new EventBuilder(engine, seed),
    participant: () => new ParticipantBuilder(engine),
  };
}

export { EventBuilder, ParticipantBuilder };
export type {
  BuildResult,
  DrawOpts,
  EntriesOpts,
  EventSeed,
  GenderInput,
  ParticipantBuildResult,
  PersonInput,
} from './types';
