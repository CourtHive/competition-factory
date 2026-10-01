import { canonicalJson } from '@Tools/canonicalJson';
import { describe, expect, it } from 'vitest';
import addFormats from 'ajv-formats';
import Ajv from 'ajv';
import fs from 'fs';

/**
 * The corpus envelope (corpus/corpus.schema.json) is the specification of the specification: a
 * scenario a port cannot parse is a scenario that pins nothing. So the same convention as
 * tournament.schema.json applies and is enforced here: every object definition states
 * `additionalProperties` explicitly, the default is `false`, and the only open value is a patch
 * op's `value`, which is a CODES fragment.
 */
const schema = JSON.parse(fs.readFileSync('./corpus/corpus.schema.json', { encoding: 'utf8' }));
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const objectDefinitions = Object.entries(schema.definitions as Record<string, any>).filter(
  ([, def]) => def.type === 'object',
);

const HASH = `sha256:${'0'.repeat(64)}`;

function scenario(overrides: Record<string, unknown> = {}) {
  return {
    corpusVersion: 1,
    factoryVersion: '7.4.0',
    schemaWriteMode: 'native',
    canonicalization: 'RFC8785',
    scenarioId: 'scoring/fmlc-16/seed-9000017',
    source: { kind: 'census', ref: 'SEED_START=9000017 SEED_COUNT=1' },
    seed: 9000017,
    tags: ['scoring', 'exit-propagation'],
    initial: { record: { tournamentId: 't1' }, hash: HASH },
    steps: [
      {
        directive: {
          method: 'setMatchUpStatus',
          params: { drawId: 'd1', matchUpId: 'm1', outcome: { winningSide: 1 } },
        },
        coordinates: { structureName: 'MAIN', roundNumber: 1, roundPosition: 1 },
        result: { success: true },
        patch: [{ op: 'replace', path: '/events/0/drawDefinitions/0/structures/0/matchUps/0/winningSide', value: 1 }],
        hash: HASH,
      },
      {
        directive: {
          method: 'setMatchUpStatus',
          params: { drawId: 'd1', matchUpId: 'nope', outcome: { winningSide: 1 } },
        },
        result: { error: 'MATCHUP_NOT_FOUND', context: { matchUpId: 'nope' } },
        patch: [],
        hash: HASH,
      },
    ],
    invariants: ['PARTICIPANT_DUPLICATED_IN_STRUCTURE', 'BYE_POSITION_WITH_PARTICIPANT'],
    properties: ['DO_UNDO_IDENTITY'],
    ...overrides,
  };
}

describe('corpus.schema.json', () => {
  it('compiles under ajv strict mode and states the convention at the top', () => {
    expect(validate).toBeTypeOf('function');
    expect(schema.$comment).toContain('additionalProperties');
  });

  it('has definitions to check, and every object definition declares additionalProperties explicitly', () => {
    expect(objectDefinitions.length).toBeGreaterThan(5);
    const silent = objectDefinitions.filter(([, def]) => def.additionalProperties === undefined).map(([name]) => name);
    expect(silent).toEqual([]);
  });

  it('every object definition is closed', () => {
    const open = objectDefinitions.filter(([, def]) => def.additionalProperties === true).map(([name]) => name);
    expect(open).toEqual([]);
  });

  it('accepts a well-formed scenario with a success step and a refusal step', () => {
    const ok = validate(scenario());
    if (!ok) console.log(ajv.errorsText(validate.errors, { separator: ';\n' }));
    expect(ok).toEqual(true);
  });

  it('refuses an undeclared field at every level', () => {
    expect(validate(scenario({ extra: 1 }))).toEqual(false);
    expect(validate(scenario({ source: { kind: 'census', ref: 'x', extra: 1 } }))).toEqual(false);
    const s: any = scenario();
    s.steps[0].extra = 1;
    expect(validate(s)).toEqual(false);
    const t: any = scenario();
    t.steps[0].directive.extra = 1;
    expect(validate(t)).toEqual(false);
  });

  it('refuses a result that is both success and error, or neither', () => {
    const both: any = scenario();
    both.steps[0].result = { success: true, error: 'MATCHUP_NOT_FOUND' };
    expect(validate(both)).toEqual(false);
    const neither: any = scenario();
    neither.steps[0].result = { context: {} };
    expect(validate(neither)).toEqual(false);
  });

  it('refuses an unknown invariant or property name, a malformed hash, and a non-canonical version', () => {
    expect(validate(scenario({ invariants: ['SOMETHING_NEW'] }))).toEqual(false);
    expect(validate(scenario({ properties: ['NOT_A_PROPERTY'] }))).toEqual(false);
    expect(validate(scenario({ initial: { record: {}, hash: 'md5:abc' } }))).toEqual(false);
    expect(validate(scenario({ canonicalization: 'none' }))).toEqual(false);
    expect(validate(scenario({ corpusVersion: 2 }))).toEqual(false);
    expect(validate(scenario({ schemaWriteMode: 'dual' }))).toEqual(false);
  });

  it('refuses a patch op outside RFC 6902 or a path that is not an RFC 6901 pointer', () => {
    const op: any = scenario();
    op.steps[0].patch = [{ op: 'upsert', path: '/x' }];
    expect(validate(op)).toEqual(false);
    const ptr: any = scenario();
    ptr.steps[0].patch = [{ op: 'remove', path: 'events/0' }];
    expect(validate(ptr)).toEqual(false);
  });

  it('a scenario is itself canonicalisable, so a corpus file can be hashed and diffed', () => {
    const text = canonicalJson(scenario());
    expect(JSON.parse(text)).toEqual(scenario());
    expect(text.startsWith('{"canonicalization":"RFC8785","corpusVersion":1')).toEqual(true);
  });
});
