import { setOutcomePipeline } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

afterEach(() => setOutcomePipeline());

function setup() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, drawType: 'SINGLE_ELIMINATION', eventType: 'DOUBLES' }],
  });
  tournamentEngine.setState(tournamentRecord);
  const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;
  const matchUpId = drawDefinition.structures[0].matchUps[0].matchUpId;
  return { tournamentRecord, drawId, eventId: event.eventId, structureId, matchUpId };
}

it('refuses generation of an elimination draw with a tie-capable format', () => {
  const { eventId } = setup();
  const before = tournamentEngine.getTournament().tournamentRecord;
  expect(
    tournamentEngine.generateDrawDefinition({
      eventId,
      drawType: 'SINGLE_ELIMINATION',
      drawSize: 4,
      matchUpFormat: 'SET1-S:P32',
    }).error,
  ).toBeTruthy();
  expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
});

it.each(['matchUp', 'structure', 'draw', 'event'] as const)(
  'refuses a tie-capable format at %s scope without writes',
  (scope) => {
    const context = setup();
    const params =
      scope === 'event'
        ? { eventId: context.eventId }
        : {
            drawId: context.drawId,
            ...(scope === 'matchUp' ? { matchUpId: context.matchUpId } : {}),
            ...(scope === 'structure' ? { structureId: context.structureId } : {}),
          };
    const before = tournamentEngine.getTournament().tournamentRecord;
    expect(tournamentEngine.setMatchUpFormat({ ...params, matchUpFormat: 'SET1-S:P32' }).error).toBeTruthy();
    expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
  },
);

it.each(['SET1-S:P31', 'SET1-S:P32DP', 'SET1-S:P32WB2'])(
  'permits non-tied completion format %s in elimination',
  (matchUpFormat) => {
    const { drawId } = setup();
    expect(tournamentEngine.setMatchUpFormat({ drawId, matchUpFormat }).error).toBeUndefined();
  },
);

it.each(['v1', 'v2', 'differential'] as const)(
  'backstops winnerless completion of a stored elimination format (%s)',
  (pipeline) => {
    const context = setup();
    const record = tournamentEngine.getTournament().tournamentRecord;
    record.events[0].drawDefinitions[0].structures[0].matchUps[0].matchUpFormat = 'SET1-S:P32';
    tournamentEngine.setState(record);
    setOutcomePipeline(pipeline);
    const before = tournamentEngine.getTournament().tournamentRecord;
    expect(
      tournamentEngine.setMatchUpStatus({
        drawId: context.drawId,
        matchUpId: context.matchUpId,
        disableScoreValidation: true,
        outcome: { matchUpStatus: 'COMPLETED', score: { sets: [{ setNumber: 1, side1Score: 16, side2Score: 16 }] } },
      }).error,
    ).toBeTruthy();
    expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
  },
);

it('bulk event format validation refuses before changing an earlier social draw', () => {
  const { eventId } = setup();
  const record = tournamentEngine.getTournament().tournamentRecord;
  record.events[0].drawDefinitions.unshift({
    drawId: 'social',
    drawType: 'AD_HOC',
    structures: [{ structureId: 'social-s', matchUps: [] }],
  });
  tournamentEngine.setState(record);
  const before = tournamentEngine.getTournament().tournamentRecord;
  expect(tournamentEngine.setMatchUpFormat({ eventId, matchUpFormat: 'SET1-S:P32' }).error).toBeTruthy();
  expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
});

it('a social structure may have its own tied format without changing the elimination draw default', () => {
  const { drawId } = setup();
  const record = tournamentEngine.getTournament().tournamentRecord;
  const draw = record.events[0].drawDefinitions[0];
  const original = draw.matchUpFormat;
  draw.structures.push({ structureId: 'social-s', finishingPosition: 'WIN_RATIO', matchUps: [] });
  tournamentEngine.setState(record);
  expect(
    tournamentEngine.setMatchUpFormat({ drawId, structureId: 'social-s', matchUpFormat: 'SET1-S:P32' }).error,
  ).toBeUndefined();
  const result = tournamentEngine.getEvent({ drawId }).drawDefinition;
  expect(result.matchUpFormat).toBe(original);
  expect(result.structures.find((structure) => structure.structureId === 'social-s').matchUpFormat).toBe('SET1-S:P32');
});

it('direct state writes cannot complete an elimination match without a winner', () => {
  const { drawId, matchUpId } = setup();
  expect(
    tournamentEngine.setMatchUpState({ drawId, matchUpId, matchUpStatus: 'COMPLETED', disableScoreValidation: true })
      .error,
  ).toBeTruthy();
});
