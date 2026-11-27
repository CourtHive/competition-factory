import * as catalogueVocabulary from '../../../../competition-catalogue/src/constants';
import * as catalogue from '@courthive/competition-catalogue';
import { describe, expect, it } from 'vitest';

// constants
import * as pointsAuthorityConstants from '@Constants/pointsAuthorityConstants';
import * as drawDefinitionConstants from '@Constants/drawDefinitionConstants';
import * as matchUpStatusConstants from '@Constants/matchUpStatusConstants';
import * as entryStatusConstants from '@Constants/entryStatusConstants';
import * as officiatingConstants from '@Constants/officiatingConstants';
import * as matchUpFormats from '@Fixtures/scoring/matchUpFormats';
import * as participantRoles from '@Constants/participantRoles';
import * as policyConstants from '@Constants/policyConstants';
import * as seasonConstants from '@Constants/seasonConstants';
import * as eventConstants from '@Constants/eventConstants';

/**
 * The catalogue package holds plain data written in the factory's vocabulary (policy types, stages, statuses), which
 * it copies. The copies must equal the factory's constants, so an entry means what the engine reads it as.
 */
describe('catalogue', () => {
  it('holds 50 entries, each with a name and a version', () => {
    expect(catalogue.catalogueEntries).toHaveLength(50);
    for (const entry of catalogue.catalogueEntries) {
      expect(entry.definition).toBeDefined();
      expect(entry.version).toEqual(catalogue.entryVersions[entry.name]);
    }
    expect(Object.keys(catalogue.entryVersions)).toHaveLength(50);
    expect(Object.keys(catalogue.policies)).toHaveLength(30);
    expect(Object.keys(catalogue.ratingsPresets)).toHaveLength(10);
  });

  it('resolveTieFormat returns a fresh copy of a named tie format, without collectionIds', () => {
    for (const name of Object.keys(catalogue.tieFormatConstants)) {
      const resolved: any = catalogue.resolveTieFormat(name);
      const { collectionDefinitions, ...rest } = catalogue.tieFormats[name];
      expect(resolved, name).toEqual({
        ...rest,
        collectionDefinitions: collectionDefinitions.map(({ collectionId, ...definition }: any) => definition),
      });
      resolved.collectionDefinitions[0].matchUpCount = 99;
      expect(catalogue.resolveTieFormat(name)?.collectionDefinitions[0].matchUpCount).not.toEqual(99);
    }
    expect(catalogue.resolveTieFormat('NOT_A_TIE_FORMAT')).toBeUndefined();
    expect(catalogue.resolveTieFormat('toString')).toBeUndefined();
  });

  it('the vocabulary the catalogue copies equals the factory constants of the same name', () => {
    // the modules the catalogue's entries imported their values from
    const factoryValues: Record<string, unknown> = {
      ...drawDefinitionConstants,
      ...entryStatusConstants,
      ...eventConstants,
      ...matchUpStatusConstants,
      ...officiatingConstants,
      ...participantRoles,
      ...pointsAuthorityConstants,
      ...policyConstants,
      ...seasonConstants,
      ...matchUpFormats,
    };
    const names = Object.keys(catalogueVocabulary);
    expect(names.length).toBeGreaterThan(40);
    for (const name of names) {
      expect((catalogueVocabulary as any)[name], name).toEqual(factoryValues[name]);
    }
  });
});
