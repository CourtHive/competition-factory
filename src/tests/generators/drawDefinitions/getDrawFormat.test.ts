/**
 * `getDrawFormat` resolves the TEAM tieFormat precedence chain.
 *
 * The chain (highest precedence first) is:
 *   params.tieFormat > event.tieFormats[tieFormatId] > existing MAIN structure
 *     > event.tieFormats[tieFormatName] > inline event.tieFormat matching tieFormatName
 *     > tieFormatDefaults(tieFormatName) > event tieFormat > tieFormatDefaults()
 *
 * The two lookups in the middle of that chain — the MAIN-structure `find` and the
 * `tieFormatId` `find` — were never invoked by any spec, so both callbacks sat
 * uncovered while the file's happy path (a draw generated with no existing
 * definition and no tieFormat reference) was well exercised. They are the arms an
 * operator hits when REGENERATING a draw in an event that already carries formats,
 * which is exactly where a silent precedence change would do damage.
 */
import { getDrawFormat } from '@Generators/drawDefinitions/getDrawFormat';
import tieFormatDefaults from '@Generators/templates/tieFormatDefaults';
import { describe, expect, it } from 'vitest';

// constants
import { MAIN } from '@Constants/drawDefinitionConstants';
import { TEAM } from '@Constants/eventConstants';

describe('getDrawFormat — TEAM tieFormat resolution', () => {
  it('uses the existing MAIN structure tieFormat when params carry none', () => {
    const tieFormat = tieFormatDefaults({});
    const existingDrawDefinition: any = {
      structures: [
        { stage: 'QUALIFYING', structureId: 'q' },
        { stage: MAIN, structureId: 'm', tieFormat },
      ],
    };

    const result: any = getDrawFormat({ matchUpType: TEAM, eventType: TEAM, existingDrawDefinition });

    expect(result.error).toBeUndefined();
    expect(result.tieFormat).toEqual(tieFormat);
    // a drawDefinition cannot carry both a tieFormat and a matchUpFormat
    expect(result.matchUpFormat).toBeUndefined();
  });

  it('params.tieFormat outranks the existing MAIN structure tieFormat', () => {
    const existingTieFormat = tieFormatDefaults({});
    const paramsTieFormat = { ...tieFormatDefaults({}), tieFormatName: 'FROM_PARAMS' };
    const existingDrawDefinition: any = { structures: [{ stage: MAIN, tieFormat: existingTieFormat }] };

    const result: any = getDrawFormat({
      tieFormat: paramsTieFormat,
      existingDrawDefinition,
      matchUpType: TEAM,
      eventType: TEAM,
    });

    expect(result.error).toBeUndefined();
    expect(result.tieFormat.tieFormatName).toEqual('FROM_PARAMS');
  });

  it('resolves tieFormatId against event.tieFormats, outranking the MAIN structure', () => {
    const referenced = { ...tieFormatDefaults({}), tieFormatId: 'tf-referenced', tieFormatName: 'REFERENCED' };
    const event: any = { tieFormats: [{ ...tieFormatDefaults({}), tieFormatId: 'tf-other' }, referenced] };
    const existingDrawDefinition: any = { structures: [{ stage: MAIN, tieFormat: tieFormatDefaults({}) }] };

    const result: any = getDrawFormat({
      tieFormatId: 'tf-referenced',
      existingDrawDefinition,
      matchUpType: TEAM,
      eventType: TEAM,
      event,
    });

    expect(result.error).toBeUndefined();
    expect(result.tieFormat.tieFormatId).toEqual('tf-referenced');
    expect(result.tieFormat.tieFormatName).toEqual('REFERENCED');
  });

  it('falls through to the inline event tieFormat when its name matches tieFormatName', () => {
    const event: any = { tieFormat: { ...tieFormatDefaults({}), tieFormatName: 'INLINE_NAMED' } };

    const result: any = getDrawFormat({
      tieFormatName: 'INLINE_NAMED',
      matchUpType: TEAM,
      eventType: TEAM,
      event,
    });

    expect(result.error).toBeUndefined();
    expect(result.tieFormat.tieFormatName).toEqual('INLINE_NAMED');
  });

  it('returns the validation error envelope when the resolved tieFormat is invalid', () => {
    const existingDrawDefinition: any = { structures: [{ stage: MAIN, tieFormat: { collectionDefinitions: [] } }] };

    const result: any = getDrawFormat({ matchUpType: TEAM, eventType: TEAM, existingDrawDefinition });

    expect(result.error).toBeDefined();
    expect(result.tieFormat).toBeUndefined();
  });
});
