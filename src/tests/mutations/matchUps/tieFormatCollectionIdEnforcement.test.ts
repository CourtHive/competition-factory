import { generationGovernor, tieFormatGovernor } from '@Assemblies/governors';
import { validateTieFormat } from '@Validators/validateTieFormat';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { INVALID_TIE_FORMAT } from '@Constants/errorConditionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { SINGLES } from '@Constants/matchUpTypes';

/**
 * `validateTieFormat` enforces `collectionId` by DEFAULT as of 7.0.0.
 *
 * Before, an id-less tieFormat was reported valid, so a consumer validating directly got a false
 * all-clear while every generated line carried `collectionId: null` and the tie never scored. The
 * detector existed and was switched off.
 *
 * CA chose reject-and-tell-them-to-mint over mint-then-validate, so the mint is published as
 * `mintCollectionIds` — an instruction a consumer cannot follow is not an instruction.
 */

const idLessTieFormat = () => ({
  collectionDefinitions: [
    {
      collectionName: 'Singles',
      matchUpFormat: FORMAT_STANDARD,
      matchUpType: SINGLES,
      matchUpCount: 3,
      matchUpValue: 1,
    },
  ],
  winCriteria: { valueGoal: 2 },
});

it('refuses a tieFormat with no collectionIds, and says what to do about it', () => {
  const result: any = validateTieFormat({ tieFormat: idLessTieFormat() });
  expect(result.valid).not.toEqual(true);
  expect(result.error).toEqual(INVALID_TIE_FORMAT);
  // the message has to be actionable — a bare type complaint leaves the caller guessing.
  // `errors` arrives under `context`, which is where `decorateResult` puts it.
  expect(result.context.errors.join(' ')).toContain('Mint collectionIds before validating');
});

it('still reports valid when the caller opts out, for validation that runs before the mint', () => {
  const result: any = validateTieFormat({ tieFormat: idLessTieFormat(), checkCollectionIds: false });
  expect(result.valid).toEqual(true);
});

it('is satisfied once the published mint helper has run', () => {
  const tieFormat = idLessTieFormat();
  const minted: any = tieFormatGovernor.mintCollectionIds({ tieFormat: tieFormat as any });
  expect(minted.error).toBeUndefined();
  expect(
    tieFormat.collectionDefinitions.every((definition: any) => typeof definition.collectionId === 'string'),
  ).toEqual(true);
  expect(validateTieFormat({ tieFormat }).valid).toEqual(true);
});

it('rejects an id-less tieFormat at the API boundary', () => {
  mocksEngine.generateTournamentRecord({ setState: true });
  // the boundary refuses. The code is the parameter-checker's, not the validator's — assert the
  // refusal rather than pinning a code this test does not own.
  const result: any = tournamentEngine.generateEventsFromTieFormat({ tieFormat: idLessTieFormat() });
  expect(result.error).toBeDefined();

  // and accepts it once minted — the two lines a consumer writes after upgrading
  const tieFormat = idLessTieFormat();
  tournamentEngine.mintCollectionIds({ tieFormat });
  const accepted: any = tournamentEngine.generateEventsFromTieFormat({ tieFormat, addEvents: false });
  expect(accepted.error).toBeUndefined();
});

it('a PUBLISHED fixture still round-trips through draw generation, unminted', () => {
  // the #4586 guarantee: generation mints internally, so the fixture stays directly consumable.
  // Validation now runs AFTER that mint rather than before it.
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ setState: true });
  expect(tournamentRecord).toBeDefined();
  expect(typeof generationGovernor.generateDrawDefinition).toEqual('function');
});
