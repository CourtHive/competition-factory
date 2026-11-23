import { validateCollectionDefinition } from '@Validators/validateCollectionDefinition';
import { compareTieFormats } from '@Query/hierarchical/tieFormats/compareTieFormats';
import { copyTieFormat } from '@Query/hierarchical/tieFormats/copyTieFormat';
import { DOUBLES, HYBRID, SINGLES, TEAM } from '@Constants/matchUpTypes';
import { INVALID_GENDER } from '@Constants/errorConditionConstants';
import { validateTieFormat } from '@Validators/validateTieFormat';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

function collection(overrides: Record<string, unknown> = {}): any {
  return {
    collectionId: 'choice',
    collectionName: "Captain's Choice",
    matchUpCount: 1,
    matchUpFormat: 'SET3-S:6/TB7',
    matchUpValue: 1,
    matchUpTypeOptions: [SINGLES, DOUBLES],
    ...overrides,
  };
}
const format = (definition) => ({ winCriteria: { valueGoal: 1 }, collectionDefinitions: [definition] });

it.each([undefined, SINGLES, DOUBLES])('reads a choice declaration with selected type %s', (matchUpType) => {
  const definition = collection({ matchUpType });
  expect(validateCollectionDefinition({ collectionDefinition: definition }).valid).toBe(true);
  expect(validateTieFormat({ tieFormat: format(definition) }).valid).toBe(true);
});

it.each([
  null,
  [],
  [SINGLES],
  [SINGLES, SINGLES],
  [SINGLES, TEAM],
  [SINGLES, HYBRID],
  [SINGLES, 'CHOICE'],
  [SINGLES, 5],
  'SINGLES,DOUBLES',
  [SINGLES, undefined],
  Array(2),
])('refuses malformed type options %j', (matchUpTypeOptions) => {
  const definition = collection({ matchUpTypeOptions, matchUpType: SINGLES });
  const result = validateCollectionDefinition({ collectionDefinition: definition });
  expect(result.error).toBeDefined();
  expect(result.errors?.some((error) => error.includes('matchUpTypeOptions'))).toBe(true);
  expect(validateTieFormat({ tieFormat: format(definition) }).error).toBeDefined();
});

it('refuses a selected type outside the options', () => {
  const result = validateCollectionDefinition({ collectionDefinition: collection({ matchUpType: HYBRID }) });
  expect(result.error).toBeDefined();
  expect(result.errors?.some((error) => error.includes('selected matchUpType'))).toBe(true);
});

it('checks every option against gender rules even when the selected doubles type is valid', () => {
  const result = validateCollectionDefinition({
    referenceGender: 'ANY',
    collectionDefinition: collection({ matchUpType: DOUBLES, gender: 'MIXED' }),
  });
  expect(result.error).toBe(INVALID_GENDER);
});

it.each([{ newUse: true }, { enforceValues: true }])(
  'accepts unresolved choice declarations for new use: %j',
  (flags) => {
    expect(validateCollectionDefinition({ collectionDefinition: collection(), ...flags }).valid).toBe(true);
  },
);

it('permits selected choices only at encounter scope when saving a tieFormat', () => {
  expect(validateTieFormat({ tieFormat: format(collection()), enforceValues: true }).valid).toBe(true);
  for (const matchUpType of [SINGLES, DOUBLES]) {
    const tieFormat = format(collection({ matchUpType }));
    expect(validateTieFormat({ tieFormat, enforceValues: true }).error).toBeDefined();
    expect(validateTieFormat({ tieFormat, enforceValues: true, allowResolvedMatchUpTypeOptions: true }).valid).toBe(
      true,
    );
  }
});

it('keeps legacy fixed collections valid and distinguishes fixed from selected choices', () => {
  const fixed = collection({ matchUpType: SINGLES });
  delete fixed.matchUpTypeOptions;
  expect(validateCollectionDefinition({ collectionDefinition: fixed, enforceValues: true }).valid).toBe(true);
  expect(
    compareTieFormats({ ancestor: format(fixed), descendant: format(collection({ matchUpType: SINGLES })) }).different,
  ).toBe(true);
});

it('distinguishes changed option presentation order and does not mutate either format', () => {
  const first = format(collection({ matchUpType: DOUBLES }));
  const second = format(collection({ matchUpType: DOUBLES, matchUpTypeOptions: [DOUBLES, SINGLES] }));
  const original = structuredClone(first);
  expect(compareTieFormats({ ancestor: first, descendant: second }).different).toBe(true);
  expect(compareTieFormats({ ancestor: first, descendant: copyTieFormat(first) }).different).toBe(false);
  expect(first).toEqual(original);
});

it('copies and JSON-round-trips options independently of the original collection', () => {
  const first = format(collection({ matchUpType: SINGLES }));
  const copied = copyTieFormat(first);
  const json = JSON.stringify(copied);
  const reloaded = JSON.parse(json);
  expect(reloaded.collectionDefinitions[0].matchUpTypeOptions).toEqual([SINGLES, DOUBLES]);
  copied.collectionDefinitions[0].matchUpTypeOptions.reverse();
  expect(first.collectionDefinitions[0].matchUpTypeOptions).toEqual([SINGLES, DOUBLES]);
});

it('creates an unresolved choice event', () => {
  mocksEngine.generateTournamentRecord({ setState: true });
  const before = tournamentEngine.getEvents().events.length;
  let result: any = tournamentEngine.addEvent({
    event: { eventType: TEAM, eventName: 'Choice', tieFormat: format(collection()) },
  });
  expect(result.success).toBe(true);
  expect(tournamentEngine.getEvents().events).toHaveLength(before + 1);
  expect(
    tournamentEngine.getTieFormat({ eventId: result.event.eventId }).tieFormat.collectionDefinitions[0]
      .matchUpTypeOptions,
  ).toEqual([SINGLES, DOUBLES]);
});

it('adds an unresolved choice collection to an existing draw', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    setState: true,
  });
  const before = tournamentEngine.getTieFormat({ drawId }).tieFormat.collectionDefinitions.length;
  let result: any = tournamentEngine.addCollectionDefinition({ drawId, collectionDefinition: collection() });
  expect(result.success).toBe(true);
  const definitions = tournamentEngine.getTieFormat({ drawId }).tieFormat.collectionDefinitions;
  expect(definitions).toHaveLength(before + 1);
  expect(definitions.find((definition) => definition.collectionId === 'choice').matchUpType).toBeUndefined();
});

it('generates untyped placeholders from an unresolved choice template', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    setState: true,
  });
  let result: any = tournamentEngine.generateDrawDefinition({ drawSize: 4, eventId, tieFormat: format(collection()) });
  expect(result.success).toBe(true);
  const children = result.drawDefinition.structures
    .flatMap((structure) => structure.matchUps ?? [])
    .flatMap((parent) => parent.tieMatchUps ?? []);
  expect(children).toHaveLength(3);
  expect(children.every((child) => child.collectionId === 'choice' && child.matchUpType === undefined)).toBe(true);
});

it('keeps fixed and choice definitions distinct when aggregating imported metadata', () => {
  const fixed = collection({ matchUpType: SINGLES });
  delete fixed.matchUpTypeOptions;
  const selected = collection({ matchUpType: SINGLES });
  tournamentEngine.setState({
    tournamentId: 'choice-metadata',
    events: [
      {
        eventId: 'event',
        tieFormat: format(fixed),
        drawDefinitions: [{ drawId: 'draw', tieFormat: format(selected), structures: [] }],
      },
    ],
  });
  let result: any = tournamentEngine.aggregateTieFormats();
  expect(result.success).toBe(true);
  const { event } = tournamentEngine.getEvent({ eventId: 'event' });
  expect(event.tieFormats).toHaveLength(2);
  expect(event.tieFormatId).not.toBe(event.drawDefinitions[0].tieFormatId);
  const drawFormat = event.tieFormats.find((f) => f.tieFormatId === event.drawDefinitions[0].tieFormatId);
  expect(drawFormat.collectionDefinitions[0].matchUpTypeOptions).toEqual([SINGLES, DOUBLES]);
});

it('does not equate an unresolved choice with its singles selection', () => {
  expect(
    compareTieFormats({ ancestor: format(collection()), descendant: format(collection({ matchUpType: SINGLES })) })
      .different,
  ).toBe(true);
});
