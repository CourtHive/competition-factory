import { expect, it, describe } from 'vitest';
import fs from 'fs-extra';

/**
 * The CODES schema convention, enforced.
 *
 * `tournament.schema.json` is the THIRD declaration of CODES, after the TypeScript types and the
 * docs, and it drifted far enough (#4718) to accept what the types forbid and reject what they
 * require. A CLOSED definition is what turns that drift into a loud failure: add a field to the
 * types, forget the schema, and validation fails. On an OPEN definition the same mistake is silent —
 * which is precisely why `Tournament`'s nine missing fields went unnoticed while `Event`'s eight
 * did not.
 *
 * So the convention is: every object definition states `additionalProperties` EXPLICITLY, and the
 * default is `false`. These tests exist so the convention cannot quietly erode — a new definition
 * that omits the keyword, or an existing one flipped open, fails here rather than years later.
 */
const schema = JSON.parse(fs.readFileSync('./src/global/schema/tournament.schema.json', { encoding: 'utf8' }));

/**
 * The ONLY definitions permitted to be open, and why. Adding to this list is a deliberate act that
 * must be justified in the definition's own `$comment` — which the third test checks for.
 *
 * `Extension` is permanent: extensions are CODES' escape hatch and `value` is unconstrained by
 * design. The other three are KNOWN GAPS, not decisions — real records carry fields CODES does not
 * declare (`venueIds`, `deleted`, `Venue.parentOrganisation`, …), so closing them today fails 14 of
 * the 16 TODS fixtures. Each undeclared field has to be resolved as a real CODES concept or as
 * legacy data first. Shrinking this list is the goal; growing it needs a reason.
 */
const PERMITTED_OPEN = new Set(['Extension', 'Organisation', 'Tournament', 'Venue']);

const objectDefinitions = Object.entries<any>(schema.definitions).filter(([, def]) => def?.properties);

describe('CODES schema convention', () => {
  it('has definitions to check', () => {
    expect(objectDefinitions.length).toBeGreaterThan(50);
  });

  /** The literal "undocumented state": a definition that says nothing about its own stance. */
  it('every object definition declares additionalProperties explicitly', () => {
    const silent = objectDefinitions.filter(([, def]) => def.additionalProperties === undefined).map(([name]) => name);

    expect(silent).toEqual([]);
  });

  it('only the permitted definitions are open', () => {
    const open = objectDefinitions.filter(([, def]) => def.additionalProperties === true).map(([name]) => name);

    expect([...open].toSorted((a, b) => a.localeCompare(b, 'en'))).toEqual(
      [...PERMITTED_OPEN].toSorted((a, b) => a.localeCompare(b, 'en')),
    );
  });

  /** An exception without a stated reason is how this became undocumented the first time. */
  it('every open definition explains itself in a $comment', () => {
    const unexplained = [...PERMITTED_OPEN].filter((name) => !schema.definitions[name]?.$comment);

    expect(unexplained).toEqual([]);
  });

  it('states the convention at the top of the schema', () => {
    expect(schema.$comment).toBeTruthy();
    expect(schema.$comment).toContain('additionalProperties');
  });
});
