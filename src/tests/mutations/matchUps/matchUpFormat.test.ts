import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { FORMAT_FAST4, FORMAT_SHORT_SETS, FORMAT_STANDARD, TIMED20 } from '@Fixtures/scoring/matchUpFormats';
import { TEAM_EVENT } from '@Constants/eventConstants';
import {
  INVALID_EVENT_TYPE,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_DRAW_ID,
  NO_MODIFICATIONS_APPLIED,
  UNRECOGNIZED_MATCHUP_FORMAT,
} from '@Constants/errorConditionConstants';

it('can set and return matchUpFormat codes', () => {
  const matchUpFormat = FORMAT_STANDARD;
  const drawProfiles = [
    {
      drawSize: 32,
      matchUpFormat,
      participantsCount: 30,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-2 6-1',
          winningSide: 1,
        },
      ],
    },
  ];

  const startDate = '2024-01-30';
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    inContext: true,
    drawProfiles,
    startDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const {
    structures: [{ structureId }],
  } = drawDefinition;

  let result = tournamentEngine.getMatchUpFormat();
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.getMatchUpFormat({ eventId });
  expect(result.matchUpFormat).toBeUndefined();
  expect(result.eventDefaultMatchUpFormat).toBeUndefined();
  expect(result.drawDefaultMatchUpFormat).toBeUndefined();
  expect(result.structureDefaultMatchUpFormat).toBeUndefined();

  result = tournamentEngine.getMatchUpFormat({ structureId });
  expect(result.error).toEqual(MISSING_DRAW_ID);

  result = tournamentEngine.getMatchUpFormat({ drawId, structureId });
  expect(result.matchUpFormat).toEqual(matchUpFormat);
  expect(result.eventDefaultMatchUpFormat).toBeUndefined();
  expect(result.drawDefaultMatchUpFormat).toEqual(matchUpFormat);
  expect(result.structureDefaultMatchUpFormat).toBeUndefined();

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  const { matchUpId } = matchUps[0];
  result = tournamentEngine.getMatchUpFormat({
    matchUpId,
  });
  expect(result.matchUpFormat).toEqual(matchUpFormat);
  expect(result.eventDefaultMatchUpFormat).toBeUndefined();
  expect(result.drawDefaultMatchUpFormat).toEqual(matchUpFormat);
  expect(result.structureDefaultMatchUpFormat).toBeUndefined();

  result = tournamentEngine.getMatchUpFormat({
    matchUpId: matchUps[0].matchUpId,
    drawId,
  });
  expect(result.matchUpFormat).toEqual(matchUpFormat);
  expect(result.eventDefaultMatchUpFormat).toBeUndefined();
  expect(result.drawDefaultMatchUpFormat).toEqual(matchUpFormat);
  expect(result.structureDefaultMatchUpFormat).toBeUndefined();

  result = tournamentEngine.setMatchUpFormat({
    eventId,
  });
  expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);

  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: TIMED20,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: TIMED20,
  });
  expect(result.success).toEqual(true);
  expect(result.info).toEqual(NO_MODIFICATIONS_APPLIED);

  // now set some values other than drawDefaultMatchUpFormat
  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: TIMED20,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getMatchUpFormat({ eventId });
  expect(result.matchUpFormat).toEqual(TIMED20);
  expect(result.eventDefaultMatchUpFormat).toEqual(TIMED20);
  expect(result.drawDefaultMatchUpFormat).toBeUndefined();
  expect(result.structureDefaultMatchUpFormat).toBeUndefined();

  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: FORMAT_SHORT_SETS,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getMatchUpFormat({ structureId, drawId });
  expect(result.matchUpFormat).toEqual(FORMAT_SHORT_SETS);
  expect(result.eventDefaultMatchUpFormat).toEqual(TIMED20);
  expect(result.drawDefaultMatchUpFormat).toEqual(matchUpFormat);
  expect(result.structureDefaultMatchUpFormat).toEqual(FORMAT_SHORT_SETS);

  result = tournamentEngine.setMatchUpStatus({
    matchUpFormat: FORMAT_FAST4,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getMatchUpFormat({ matchUpId });
  expect(result.matchUpFormat).toEqual(FORMAT_FAST4);
  expect(result.eventDefaultMatchUpFormat).toBeUndefined();
  expect(result.drawDefaultMatchUpFormat).toEqual(matchUpFormat);
  expect(result.structureDefaultMatchUpFormat).toEqual(FORMAT_SHORT_SETS);

  result = tournamentEngine.getMatchUpFormat({ matchUpId, eventId });
  expect(result.matchUpFormat).toEqual(FORMAT_FAST4);
  expect(result.eventDefaultMatchUpFormat).toEqual(TIMED20);
  expect(result.drawDefaultMatchUpFormat).toEqual(matchUpFormat);
  expect(result.structureDefaultMatchUpFormat).toEqual(FORMAT_SHORT_SETS);

  result = tournamentEngine.getMatchUpFormat({
    structureId,
    matchUpId,
    eventId,
    drawId,
  });
  expect(result.matchUpFormat).toEqual(FORMAT_FAST4);
  expect(result.eventDefaultMatchUpFormat).toEqual(TIMED20);
  expect(result.drawDefaultMatchUpFormat).toEqual(matchUpFormat);
  expect(result.structureDefaultMatchUpFormat).toEqual(FORMAT_SHORT_SETS);

  // none of the set matchUpFormat methods will accept invalid formats
  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: 'BOBUS',
    eventId,
  });
  expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);

  result = tournamentEngine.setMatchUpFormat({
    drawId,
  });
  expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);
  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: FORMAT_SHORT_SETS,
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: 'BOBUS',
  });
  expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);
  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: 'BOBUS',
    drawId,
  });
  expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);

  result = tournamentEngine.setMatchUpFormat({
    structureId,
    drawId,
  });
  expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);

  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: 'BOBUS',
    structureId,
  });
  expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);

  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: 'BOBUS',
    drawId,
  });
  expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);

  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: 'BOBUS',
    structureId,
    drawId,
  });
  expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);

  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: FORMAT_SHORT_SETS,
    structureId,
  });
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);

  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: FORMAT_SHORT_SETS,
    scheduledDates: '2024-01-31',
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: FORMAT_SHORT_SETS,
    eventType: TEAM_EVENT,
    drawId,
  });
  expect(result.error).toEqual(INVALID_EVENT_TYPE);

  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: FORMAT_SHORT_SETS,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: FORMAT_SHORT_SETS,
    force: true, // test coverage
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: FORMAT_SHORT_SETS,
    scheduledDates: [startDate], // test coverage
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: FORMAT_SHORT_SETS,
    stages: ['BOGUS'],
    drawId,
  });
  expect(result.info).toEqual(NO_MODIFICATIONS_APPLIED);

  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: FORMAT_SHORT_SETS,
    stageSequences: [8],
    drawId,
  });
  expect(result.info).toEqual(NO_MODIFICATIONS_APPLIED);
});

it('setMatchUpFormat applies format to specific drawIds', () => {
  const matchUpFormat = FORMAT_STANDARD;
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, matchUpFormat }],
  });

  tournamentEngine.setState(tournamentRecord);

  // Set format on specific drawId
  const result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: FORMAT_SHORT_SETS,
    drawIds: [drawId],
    stages: ['MAIN'],
    eventId,
  });
  expect(result.success).toEqual(true);
});

it('setMatchUpFormat applies format to specific eventIds', () => {
  const matchUpFormat = FORMAT_STANDARD;
  const {
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, matchUpFormat }],
  });

  tournamentEngine.setState(tournamentRecord);

  // Set format filtering by eventIds
  const result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: FORMAT_SHORT_SETS,
    eventIds: [eventId],
  });
  expect(result.success).toEqual(true);
});

it('setMatchUpFormat with structureIds but no drawDefinition returns MISSING_DRAW_DEFINITION', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  // Pass structureIds without drawDefinition — should fail
  const result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: FORMAT_SHORT_SETS,
    structureIds: [structureId],
  });
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
});

it('setMatchUpFormat with SINGLES eventType filters events', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: FORMAT_SHORT_SETS,
    eventType: 'SINGLES',
  });
  expect(result.success).toEqual(true);
});

it('setMatchUpFormat with scheduledDates applies format to specific dates', () => {
  const startDate = '2024-06-01';
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    startDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  // Schedule a matchUp to a specific date
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  const tbpMatchUp = matchUps.find((m) => m.matchUpStatus === 'TO_BE_PLAYED');
  if (tbpMatchUp) {
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: tbpMatchUp.matchUpId,
      drawId,
      schedule: { scheduledDate: startDate },
    });

    const result = tournamentEngine.setMatchUpFormat({
      scheduledDates: [startDate],
      matchUpFormat: FORMAT_SHORT_SETS,
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
  }
});

it('setMatchUpFormat does not modify draw format when structure is modified', () => {
  const matchUpFormat = FORMAT_STANDARD;
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, matchUpFormat }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  // Set format at structure level (different from draw level)
  let result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: FORMAT_FAST4,
    structureIds: [structureId],
    drawId,
  });
  expect(result.success).toEqual(true);

  // drawDefinition.matchUpFormat should remain as original
  const { drawDefinition: updated } = tournamentEngine.getEvent({ drawId });
  expect(updated.matchUpFormat).toEqual(matchUpFormat);
  expect(updated.structures[0].matchUpFormat).toEqual(FORMAT_FAST4);
});
