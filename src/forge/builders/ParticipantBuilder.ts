/**
 * ParticipantBuilder — chainable composition over addParticipant.
 *
 * Three subject sugars cover the common participant shapes:
 *   - `.individual({ givenName, familyName, ... })`
 *   - `.pair([individualId1, individualId2], name?)`
 *   - `.team(name, individualParticipantIds?)`
 *
 * Defaults: participantRole = COMPETITOR. Override with `.role(...)`.
 *
 * Terminals mirror EventBuilder: `.create()`, `.toRequest()`, `.toDirectives()`.
 */

import { COMPETITOR } from '@Constants/participantRoles';
import { INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import { UUID } from '@Tools/UUID';

import type { ParticipantBuildResult, PersonInput } from './types';
import type { Directives, FactoryEngine } from '@Types/factoryTypes';

type ParticipantShape =
  | { kind: 'individual'; person: PersonInput }
  | { kind: 'pair'; ids: [string, string]; name?: string }
  | { kind: 'team'; name: string; ids?: string[] };

export class ParticipantBuilder {
  private readonly engine: FactoryEngine;
  private readonly _participantId: string;
  private shape: ParticipantShape | undefined;
  private participantRole: string = COMPETITOR;

  constructor(engine: FactoryEngine) {
    this.engine = engine;
    this._participantId = UUID();
  }

  individual(person: PersonInput): this {
    this.shape = { kind: 'individual', person };
    return this;
  }

  pair(individualParticipantIds: [string, string], name?: string): this {
    this.shape = { kind: 'pair', ids: individualParticipantIds, name };
    return this;
  }

  team(name: string, individualParticipantIds?: string[]): this {
    this.shape = { kind: 'team', name, ids: individualParticipantIds };
    return this;
  }

  role(role: string): this {
    this.participantRole = role;
    return this;
  }

  get participantId(): string {
    return this._participantId;
  }

  private buildParticipant(): any {
    if (!this.shape) throw new Error('ParticipantBuilder requires .individual()/.pair()/.team() before terminating.');

    if (this.shape.kind === 'individual') {
      const { givenName, familyName, sex, nationalityCode, personId } = this.shape.person;
      return {
        participantId: this._participantId,
        participantType: INDIVIDUAL,
        participantRole: this.participantRole,
        person: {
          personId: personId ?? UUID(),
          standardGivenName: givenName,
          standardFamilyName: familyName,
          sex,
          nationalityCode,
        },
      };
    }
    if (this.shape.kind === 'pair') {
      return {
        participantId: this._participantId,
        participantType: PAIR,
        participantRole: this.participantRole,
        individualParticipantIds: this.shape.ids,
        participantName: this.shape.name,
      };
    }
    return {
      participantId: this._participantId,
      participantType: TEAM,
      participantRole: this.participantRole,
      individualParticipantIds: this.shape.ids ?? [],
      participantName: this.shape.name,
    };
  }

  toDirectives(): Directives {
    return [{ method: 'addParticipant', params: { participant: this.buildParticipant() } }];
  }

  toRequest(): { directives: Directives; participantId: string } {
    return { directives: this.toDirectives(), participantId: this._participantId };
  }

  create(opts?: { rollbackOnError?: boolean }): ParticipantBuildResult {
    const directives = this.toDirectives();
    const queueResult = this.engine.executionQueue(directives, opts?.rollbackOnError);
    if (queueResult?.error) {
      return {
        success: false,
        error: queueResult.error,
        participantId: this._participantId,
        directives,
        results: queueResult.results,
      };
    }
    return {
      success: !!queueResult?.success,
      participantId: this._participantId,
      directives,
      results: queueResult?.results,
    };
  }
}
