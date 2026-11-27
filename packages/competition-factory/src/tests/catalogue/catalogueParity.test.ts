import * as catalogueVocabulary from '../../../../competition-catalogue/src/constants';
import tieFormatDefaults from '@Helpers/tieFormats/tieFormatDefaults';
import { ratingsPolicies } from '@Fixtures/policies/ratingsPolicies';
import * as catalogue from '@courthive/competition-catalogue';
import { describe, expect, it } from 'vitest';
import { fixtures } from '@Fixtures/index';

// constants
import { competitionFormatConstants } from '@Constants/competitionFormatConstants';
import * as pointsAuthorityConstants from '@Constants/pointsAuthorityConstants';
import * as drawDefinitionConstants from '@Constants/drawDefinitionConstants';
import * as matchUpStatusConstants from '@Constants/matchUpStatusConstants';
import * as entryStatusConstants from '@Constants/entryStatusConstants';
import * as officiatingConstants from '@Constants/officiatingConstants';
import { tieFormatConstants } from '@Constants/tieFormatConstants';
import * as matchUpFormats from '@Fixtures/scoring/matchUpFormats';
import * as participantRoles from '@Constants/participantRoles';
import * as policyConstants from '@Constants/policyConstants';
import * as seasonConstants from '@Constants/seasonConstants';
import * as eventConstants from '@Constants/eventConstants';

/**
 * The catalogue package holds copies of the factory's catalogue data. Until the factory's copies are removed, each
 * copy must equal the factory's, so a test that moves from one to the other reads the same values.
 */
const withoutCollectionIds = (tieFormat: any) => ({
  ...tieFormat,
  collectionDefinitions: tieFormat.collectionDefinitions.map(({ collectionId, ...rest }: any) => rest),
});

describe('catalogue parity', () => {
  it('holds 50 entries, each with a name and a version', () => {
    expect(catalogue.catalogueEntries).toHaveLength(50);
    for (const entry of catalogue.catalogueEntries) {
      expect(entry.definition).toBeDefined();
      expect(entry.version).toEqual(catalogue.entryVersions[entry.name]);
    }
    expect(Object.keys(catalogue.entryVersions)).toHaveLength(50);
  });

  it('every catalogue policy equals the factory copy', () => {
    expect(Object.keys(catalogue.policies)).toHaveLength(30);
    for (const [name, policy] of Object.entries(catalogue.policies)) {
      expect(policy, name).toEqual(fixtures.policies[name]);
      expect((catalogue as any)[name], name).toBe(policy);
    }
  });

  it('every tie format, name and competition format equals the factory copy', () => {
    expect(catalogue.tieFormats).toEqual(fixtures.tieFormats);
    expect(catalogue.tieFormatConstants).toEqual(tieFormatConstants);
    expect(catalogue.competitionFormats.INTENNSE_STANDARD).toEqual(fixtures.competitionFormats.INTENNSE_STANDARD);
    expect(catalogue.competitionFormatConstants.INTENNSE_STANDARD).toEqual(
      competitionFormatConstants.INTENNSE_STANDARD,
    );
  });

  it('every ratings preset equals the factory preset of the same name', () => {
    expect(Object.keys(catalogue.ratingsPresets)).toHaveLength(10);
    for (const [name, preset] of Object.entries(catalogue.ratingsPresets)) {
      expect(preset, name).toEqual(ratingsPolicies[name]);
    }
  });

  it('resolveTieFormat returns what the factory builds for the name, without collectionIds', () => {
    for (const name of Object.keys(tieFormatConstants)) {
      const resolved: any = catalogue.resolveTieFormat(name);
      expect(resolved, name).toEqual(withoutCollectionIds(tieFormatDefaults({ namedFormat: name })));
      expect(resolved.collectionDefinitions.every(({ collectionId }) => collectionId === undefined)).toEqual(true);
      // a copy: changing it changes neither the catalogue nor a later copy
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
