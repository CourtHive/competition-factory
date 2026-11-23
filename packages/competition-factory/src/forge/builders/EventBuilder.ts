/**
 * EventBuilder — chainable composition of addEvent → generateDrawDefinition
 * → addDrawDefinition → addEventEntries into a single executionQueue.
 *
 * State machine: each chainable method mutates internal state and returns
 * `this`. Three terminals end the chain:
 *   - `.create(opts?)` — runs the directives now via engine.executionQueue
 *   - `.toRequest()`   — returns `{ directives, eventId, drawIds }` for the
 *                        server-bound payload
 *   - `.toDirectives()` — raw directive array, no execution
 *
 * Pre-assigns `eventId` and each `drawId` so downstream consumers can
 * reference them before `.create()` resolves. The directives use the
 * executionQueue `pipe` mechanism to thread `event` and `drawDefinition`
 * results between steps without forcing the caller to materialize them.
 */

import { DOUBLES, HYBRID, SINGLES, TEAM } from '@Constants/eventConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { UUID } from '@Tools/UUID';

import type { DrawOpts, EntriesOpts, EventSeed, GenderInput, BuildResult } from './types';
import type { Directives, FactoryEngine } from '@Types/factoryTypes';

type DrawSpec = { drawId: string; drawSize: number; opts: DrawOpts };

export class EventBuilder {
  private readonly engine: FactoryEngine;
  private readonly _eventId: string;
  private eventState: EventSeed & { eventType?: string; gender?: string; tieFormat?: any; tieFormatName?: string } = {};
  private drawSpec: DrawSpec | undefined;
  private entriesSpec: { participantIds: string[]; opts?: EntriesOpts } | undefined;

  constructor(engine: FactoryEngine, seed?: Partial<EventSeed>) {
    this.engine = engine;
    this._eventId = UUID();
    if (seed) Object.assign(this.eventState, seed);
  }

  // ---- event-type sugar (mutually exclusive; last call wins) ----

  singles(): this {
    this.eventState.eventType = SINGLES;
    return this;
  }
  doubles(): this {
    this.eventState.eventType = DOUBLES;
    return this;
  }
  team(tieFormat?: any | string): this {
    this.eventState.eventType = TEAM;
    if (typeof tieFormat === 'string') this.eventState.tieFormatName = tieFormat;
    else if (tieFormat) this.eventState.tieFormat = tieFormat;
    return this;
  }
  hybrid(): this {
    this.eventState.eventType = HYBRID;
    return this;
  }

  // ---- metadata ----

  named(eventName: string): this {
    this.eventState.eventName = eventName;
    return this;
  }
  gender(gender: GenderInput): this {
    this.eventState.gender = gender;
    return this;
  }
  category(category: EventSeed['category']): this {
    this.eventState.category = category;
    return this;
  }
  dates(startDate: string, endDate: string): this {
    this.eventState.startDate = startDate;
    this.eventState.endDate = endDate;
    return this;
  }
  tieFormat(tieFormat: any | string): this {
    if (typeof tieFormat === 'string') this.eventState.tieFormatName = tieFormat;
    else this.eventState.tieFormat = tieFormat;
    return this;
  }

  // ---- entries ----

  entries(participantIds: string[], opts?: EntriesOpts): this {
    this.entriesSpec = { participantIds, opts };
    return this;
  }

  // ---- draw ----

  draw(drawSize: number, opts: DrawOpts = {}): this {
    if (this.drawSpec) {
      throw new Error(
        'EventBuilder.draw() can be called once per event in v1. Multi-flight builders are a v2 addition.',
      );
    }
    this.drawSpec = { drawId: UUID(), drawSize, opts };
    return this;
  }

  // ---- terminals ----

  get eventId(): string {
    return this._eventId;
  }

  get drawIds(): string[] {
    return this.drawSpec ? [this.drawSpec.drawId] : [];
  }

  toDirectives(): Directives {
    const directives: Directives = [];

    const eventPayload: any = { eventId: this._eventId, ...this.eventState };
    directives.push({ method: 'addEvent', params: { event: eventPayload } });

    if (this.drawSpec) {
      const { drawId, drawSize, opts } = this.drawSpec;
      directives.push({
        method: 'generateDrawDefinition',
        params: { eventId: this._eventId, drawId, drawSize, ...opts },
        pipe: { event: true },
      });
      directives.push({
        method: 'addDrawDefinition',
        params: { eventId: this._eventId },
        pipe: { drawDefinition: true },
      });
    }

    if (this.entriesSpec) {
      const { participantIds, opts } = this.entriesSpec;
      const entriesParams: any = {
        eventId: this._eventId,
        participantIds,
        entryStage: opts?.entryStage ?? MAIN,
        entryStatus: opts?.entryStatus ?? DIRECT_ACCEPTANCE,
      };
      // Pass through only when explicitly set so addEventEntries' own defaults
      // (enforceGender: true, enforceCategory: false) apply otherwise.
      if (opts?.enforceGender !== undefined) entriesParams.enforceGender = opts.enforceGender;
      if (opts?.enforceCategory !== undefined) entriesParams.enforceCategory = opts.enforceCategory;
      directives.push({ method: 'addEventEntries', params: entriesParams });
    }

    return directives;
  }

  toRequest(): { directives: Directives; eventId: string; drawIds: string[] } {
    return { directives: this.toDirectives(), eventId: this._eventId, drawIds: this.drawIds };
  }

  create(opts?: { rollbackOnError?: boolean }): BuildResult {
    const directives = this.toDirectives();
    const queueResult = this.engine.executionQueue(directives, opts?.rollbackOnError);
    if (queueResult?.error) {
      return {
        success: false,
        error: queueResult.error,
        eventId: this._eventId,
        drawIds: this.drawIds,
        directives,
        results: queueResult.results,
      };
    }
    return {
      success: !!queueResult?.success,
      eventId: this._eventId,
      drawIds: this.drawIds,
      directives,
      results: queueResult?.results,
    };
  }
}
