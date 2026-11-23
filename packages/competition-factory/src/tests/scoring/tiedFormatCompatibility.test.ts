import { setOutcomePipeline } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { SINGLE_ELIMINATION, WIN_RATIO } from '@Constants/drawDefinitionConstants';
import { UNDECIDED_LEVEL_RESULT } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { DOUBLES_EVENT } from '@Constants/eventConstants';

afterEach(() => setOutcomePipeline());

function setup() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, drawType: SINGLE_ELIMINATION, eventType: DOUBLES_EVENT }],
  });
  tournamentEngine.setState(tournamentRecord);
  const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;
  const matchUpId = drawDefinition.structures[0].matchUps[0].matchUpId;
  return { tournamentRecord, drawId, eventId: event.eventId, structureId, matchUpId };
}

// Standings phase 2 § 1.1 (CA 2026-11-04, "allow, decider required"): an elimination draw accepts a format that can
// end level; a level result there is refused until it names its winner and how it was decided.
it('generates an elimination draw with a tie-capable format', () => {
  const { eventId } = setup();
  const result = tournamentEngine.generateDrawDefinition({
    eventId,
    drawType: SINGLE_ELIMINATION,
    drawSize: 4,
    matchUpFormat: 'SET1-S:P32',
  });
  expect(result.success).toEqual(true);
});

it.each(['matchUp', 'structure', 'draw', 'event'] as const)('accepts a tie-capable format at %s scope', (scope) => {
  const context = setup();
  const params =
    scope === 'event'
      ? { eventId: context.eventId }
      : {
          drawId: context.drawId,
          ...(scope === 'matchUp' ? { matchUpId: context.matchUpId } : {}),
          ...(scope === 'structure' ? { structureId: context.structureId } : {}),
        };
  expect(tournamentEngine.setMatchUpFormat({ ...params, matchUpFormat: 'SET1-S:P32' }).success).toEqual(true);
  const { event } = tournamentEngine.getEvent({ eventId: context.eventId });
  const { matchUp } = tournamentEngine.findMatchUp({
    drawId: context.drawId,
    matchUpId: context.matchUpId,
    inContext: true,
  });
  // the event scope sets the event's default; the draw keeps the format it declares
  expect(scope === 'event' ? event.matchUpFormat : matchUp.matchUpFormat).toEqual('SET1-S:P32');
});

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
        outcome: { matchUpStatus: COMPLETED, score: { sets: [{ setNumber: 1, side1Score: 16, side2Score: 16 }] } },
      }).error,
    ).toEqual(UNDECIDED_LEVEL_RESULT);
    expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
  },
);

it('a social structure may have its own tied format without changing the elimination draw default', () => {
  const { drawId } = setup();
  const record = tournamentEngine.getTournament().tournamentRecord;
  const draw = record.events[0].drawDefinitions[0];
  const original = draw.matchUpFormat;
  draw.structures.push({ structureId: 'social-s', finishingPosition: WIN_RATIO, matchUps: [] });
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
    tournamentEngine.setMatchUpState({ drawId, matchUpId, matchUpStatus: COMPLETED, disableScoreValidation: true })
      .error,
  ).toBeTruthy();
});
