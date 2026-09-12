import tieFormatDefaults from '@Assemblies/generators/templates/tieFormatDefaults';
import { validateTieFormat } from '@Validators/validateTieFormat';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

// constants and fixtures
import { COLLEGE_D3, DOMINANT_DUO, TEAM_DOUBLES_3_AGGREGATION } from '@Constants/tieFormatConstants';
import { INVALID_TIE_FORMAT } from '@Constants/errorConditionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { tieFormats } from '@Fixtures/scoring/tieFormats';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { TEAM } from '@Constants/eventConstants';
import { fixtures } from '@Fixtures/index';

const matchUpFormat = FORMAT_STANDARD;

// prettier-ignore
const errorConditions = [
  undefined,
  { tieFormat: '' },
  { tieFormat: {} },
  { tieFormat: { winCriteria: 1 } },
  { tieFormat: { collectionDefinitions: '' } },
  { tieFormat: { winCriteria: {}, collectionDefinitions: [] } },
  { tieFormat: { winCriteria: { valueGoal: '' }, collectionDefinitions: [] } },
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [''] } },
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 1 }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id' }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1 }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpType: SINGLES }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpType: SINGLES, matchUpValue: 'a' }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpType: SINGLES, collectionValue: 'a' }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpType: SINGLES, collectionValueProfiles: 'a' }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpType: SINGLES, collectionValueProfiles: [''] }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpType: SINGLES, collectionValueProfiles: [{}] }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpType: SINGLES, collectionValueProfiles: [{ matchUpValue: 1 }] }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpType: SINGLES, collectionValueProfiles: [{ collectionPosition: 1 }] }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpType: SINGLES, collectionValueProfiles: [{ matchUpValue: 1, collectionPosition: '' }] }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpType: SINGLES, collectionValueProfiles: [{ matchUpValue: 1, collectionPosition: 2 }] }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 2, matchUpType: SINGLES, collectionValueProfiles: [{ matchUpValue: 1, collectionPosition: 2 }] }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [
    { collectionId: 'id', matchUpCount: 2, matchUpType: SINGLES, collectionValueProfiles: [{ matchUpValue: 1, collectionPosition: 2 }, { matchUpValue: 1, collectionPosition: 2 }] }
  ]}},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpType: SINGLES, matchUpValue: 1, collectionGroupNumber: 'a' }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpFormat: 'invalidFormat', matchUpType: SINGLES, matchUpValue: 1 }] }},
];

it.each(errorConditions)('can validate tieFormats', (errorCondition: any) => {
  const result: any = validateTieFormat(errorCondition);
  expect(result.error).toEqual(INVALID_TIE_FORMAT);
});

// prettier-ignore
const successConditions = [
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [] } },
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpType: SINGLES, matchUpValue: 1 }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpType: SINGLES, collectionValue: 1 }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpType: SINGLES, collectionValueProfiles: [{ matchUpValue: 1, collectionPosition: 1 }] }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpType: SINGLES, matchUpValue: 1, collectionGroupNumber: 1 }] }},
  { tieFormat: { winCriteria: { valueGoal: 1 }, collectionDefinitions: [{ collectionId: 'id', matchUpCount: 1, matchUpFormat, matchUpType: SINGLES, matchUpValue: 1 }] }},
];

it('validates fixture tieFormats', () => {
  const tieFormat = tieFormatDefaults({
    namedFormat: TEAM_DOUBLES_3_AGGREGATION,
  });
  expect(tieFormat.winCriteria.aggregateValue).toEqual(true);
  const result = validateTieFormat({ tieFormat });
  expect(result.valid).toEqual(true);
});

it.each(successConditions)('can validate tieFormats', (errorCondition: any) => {
  const result = validateTieFormat(errorCondition);
  if (!result.valid) console.log(errorCondition.tieFormat.collectionDefinitions[0], result);
  expect(result.valid).toEqual(true);
  expect(result?.errors?.length).toEqual(0);
});

test('various tieFormat defaults', () => {
  let format = tieFormatDefaults({ namedFormat: 'COLLEGE_DEFAULT' });
  expect(format.winCriteria.valueGoal).toEqual(4);
  let result = validateTieFormat({ tieFormat: format });
  expect(result.valid).toEqual(true);

  let doubles = format.collectionDefinitions.find(({ matchUpType }) => matchUpType === DOUBLES);
  expect(doubles.collectionValue).toEqual(1);
  expect(doubles.matchUpValue).toBeUndefined();
  expect(
    tournamentEngine.isValidMatchUpFormat({
      matchUpFormat: doubles.matchUpFormat,
    }),
  ).toEqual(true);
  let singles = format.collectionDefinitions.find(({ matchUpType }) => matchUpType === DOUBLES);
  expect(
    tournamentEngine.isValidMatchUpFormat({
      matchUpFormat: singles.matchUpFormat,
    }),
  ).toEqual(true);

  format = tieFormatDefaults({ namedFormat: 'COLLEGE_JUCO' });
  expect(format.winCriteria.valueGoal).toEqual(5);
  result = validateTieFormat({ tieFormat: format });
  expect(result.valid).toEqual(true);

  doubles = format.collectionDefinitions.find(({ matchUpType }) => matchUpType === DOUBLES);
  expect(doubles.matchUpValue).toEqual(1);
  expect(
    tournamentEngine.isValidMatchUpFormat({
      matchUpFormat: doubles.matchUpFormat,
    }),
  ).toEqual(true);
  singles = format.collectionDefinitions.find(({ matchUpType }) => matchUpType === DOUBLES);
  expect(
    tournamentEngine.isValidMatchUpFormat({
      matchUpFormat: singles.matchUpFormat,
    }),
  ).toEqual(true);

  format = tieFormatDefaults({ namedFormat: COLLEGE_D3 });
  expect(format.winCriteria.valueGoal).toEqual(5);
  result = validateTieFormat({ tieFormat: format });
  expect(result.valid).toEqual(true);

  doubles = format.collectionDefinitions.find(({ matchUpType }) => matchUpType === DOUBLES);
  expect(doubles.matchUpValue).toEqual(1);
  expect(doubles.collectionValue).toBeUndefined();
  expect(
    tournamentEngine.isValidMatchUpFormat({
      matchUpFormat: doubles.matchUpFormat,
    }),
  ).toEqual(true);
  singles = format.collectionDefinitions.find(({ matchUpType }) => matchUpType === DOUBLES);
  expect(
    tournamentEngine.isValidMatchUpFormat({
      matchUpFormat: singles.matchUpFormat,
    }),
  ).toEqual(true);
});

it('can validate tieFormat fixtures', () => {
  let result = validateTieFormat({
    tieFormat: fixtures.tieFormats.USTA_SECTION_BATTLE,
    checkCollectionIds: false,
  });
  expect(result.valid).toEqual(true);

  result = validateTieFormat({
    tieFormat: fixtures.tieFormats.COLLEGE_D3,
    checkCollectionIds: false,
  });
  expect(result.valid).toEqual(true);

  result = validateTieFormat({
    tieFormat: fixtures.tieFormats.COLLEGE_DEFAULT,
    checkCollectionIds: false,
  });
  expect(result.valid).toEqual(true);

  result = validateTieFormat({
    tieFormat: fixtures.tieFormats.COLLEGE_JUCO,
    checkCollectionIds: false,
  });
  expect(result.valid).toEqual(true);
});

it('can use tieFormatName to generate TEAM events', () => {
  const {
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { event } = tournamentEngine.getEvent({ eventId });
  expect(event.tieFormat.winCriteria).toEqual(tieFormats.COLLEGE_D3.winCriteria);
  expect(event.tieFormat.tieFormatName).toEqual(tieFormats.COLLEGE_D3.tieFormatName);
});

it('cal enforce gender in collectionDefinitions', () => {
  const tieFormat = tieFormatDefaults({
    namedFormat: DOMINANT_DUO,
  });
  let result = validateTieFormat({ tieFormat });
  expect(result.valid).toEqual(true);

  const collectionDefinition = {
    collectionName: 'Gender Specif',
    matchUpFormat: FORMAT_STANDARD,
    matchUpType: SINGLES,
    matchUpCount: 3,
    matchUpValue: 1,
    gender: FEMALE,
  };
  tieFormat.collectionDefinitions.push(collectionDefinition);

  // `checkCollectionIds: false` — the definition pushed above carries no collectionId, which is
  // incidental to what this test asserts. Since 7.0.0 the check is ON by default, so without the
  // opt-out these two lines would fail on ids rather than exercise gender enforcement.
  result = validateTieFormat({ tieFormat, checkCollectionIds: false });
  expect(result.valid).toEqual(true);

  result = validateTieFormat({ tieFormat, enforceGender: true, checkCollectionIds: false });
  expect(result.valid).toEqual(true);

  result = validateTieFormat({
    gender: MALE,
    enforceGender: true,
    tieFormat,
  });
  expect(result.error).toEqual(INVALID_TIE_FORMAT);
});
