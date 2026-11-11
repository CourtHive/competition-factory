import { getDrawCompositionConstraints } from './getDrawCompositionConstraints';
import tournamentSchema from '@Global/schema/tournament.schema.json';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import addFormats from 'ajv-formats';
import Ajv from 'ajv';

// constants and types
import { SANCTIONING_CONSTRAINTS } from '@Constants/extensionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

function fixture(overrideLimits?: { drawSize?: number }) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    nonRandom: 1,
    setState: false,
    participantsProfile: { participantsCount: 2 },
    eventProfiles: [{ eventName: 'Qualifying permissions' }],
  });
  const event = tournamentRecord.events![0];
  tournamentRecord.sanction = {
    sanctioningId: 'test-sanction',
    constraints: {
      definedBy: { providerId: 'test-provider' },
      events: [{ match: { eventType: event.eventType! }, drawSize: 32, ...(overrideLimits && { overrideLimits }) }],
    },
  };
  return { tournamentRecord, event };
}

describe('sanction-record override contract', () => {
  it('keeps the base limit until an override is explicitly requested', () => {
    const args = fixture({ drawSize: 128 });
    let result: any = getDrawCompositionConstraints(args);
    expect(result.constraints.drawSize).toBe(32);
    expect(result.overrideLimits.drawSize).toBe(128);
  });
  it('accepts a bounded request and preserves the record and request', () => {
    const args = { ...fixture({ drawSize: 128 }), constraintOverrides: { drawSize: 64 } };
    const before = structuredClone(args);
    let result: any = getDrawCompositionConstraints(args);
    expect(result.constraints.drawSize).toBe(64);
    expect(args).toEqual(before);
  });
  it('denies missing permission, including a caller escape flag', () => {
    let result: any = getDrawCompositionConstraints({
      ...fixture(),
      constraintOverrides: { drawSize: 64 },
      sanctioned: false,
    } as any);
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.constraints).toBeUndefined();
  });
  it('denies requests above the record ceiling and malformed requests', () => {
    for (const constraintOverrides of [
      { drawSize: 256 },
      { drawSize: -1 },
      { drawSize: 40.5 },
      { unknown: 64 },
      { drawSize: Infinity },
    ]) {
      let result: any = getDrawCompositionConstraints({ ...fixture({ drawSize: 128 }), constraintOverrides } as any);
      expect(result.error).toEqual(INVALID_VALUES);
    }
  });
  it('does not grant authority from an unauthored or legacy permission', () => {
    const args = fixture({ drawSize: 128 });
    delete (args.tournamentRecord.sanction!.constraints as any).definedBy;
    let result: any = getDrawCompositionConstraints({ ...args, constraintOverrides: { drawSize: 64 } });
    expect(result.error).toEqual(INVALID_VALUES);
    args.tournamentRecord.sanction = undefined;
    args.tournamentRecord.extensions = [
      {
        name: SANCTIONING_CONSTRAINTS,
        value: { events: [{ eventType: args.event.eventType, drawSize: 32, overrideLimits: { drawSize: 128 } }] },
      },
    ];
    result = getDrawCompositionConstraints({ ...args, constraintOverrides: { drawSize: 64 } });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

it('validates numeric permission ceilings in the canonical tournament schema', () => {
  const ajv = new Ajv({ allowUnionTypes: true });
  addFormats(ajv);
  const validate = ajv.compile(tournamentSchema);
  const args = fixture({ drawSize: 64 });
  expect(validate(args.tournamentRecord), JSON.stringify(validate.errors)).toBe(true);
  const event = args.tournamentRecord.sanction!.constraints!.events[0];
  for (const overrideLimits of [{ drawSize: true }, { drawSize: -1 }, { drawSize: 32.5 }, { fictional: 64 }]) {
    (event as any).overrideLimits = overrideLimits;
    expect(validate(args.tournamentRecord)).toBe(false);
  }
});
