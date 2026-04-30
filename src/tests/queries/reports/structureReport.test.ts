import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { instanceCount } from '@Tools/arrays';
import * as tools from '@Assemblies/tools';
import { expect, it } from 'vitest';

// constants
import { INDIVIDUAL } from '@Constants/participantConstants';
import { DOUBLES_EVENT } from '@Constants/eventConstants';
import { COMPETITOR } from '@Constants/participantRoles';

it('can identify winningParticipants and map WTN and ranking', () => {
  const drawProfiles = [
    {
      eventName: `WTN 14-19 SINGLES`,
      category: { ratingType: 'WTN', ratingMin: 14, ratingMax: 19.99 },
      generate: true,
      seedsCount: 2,
      drawSize: 4,
    },
    {
      eventName: `WTN 14-19 DOUBLES`,
      category: { ratingType: 'WTN', ratingMin: 14, ratingMax: 19.99 },
      eventType: DOUBLES_EVENT,
      generate: true,
      seedsCount: 2,
      drawSize: 4,
    },
    {
      category: { categoryName: '12U' },
      rankingRange: [1, 15],
      seedsCount: 2,
      drawSize: 4,
    },
  ];
  const personExtensions = [
    { name: 'districtCode', value: 'Z' },
    { name: 'sectionCode', value: '123' },
  ];
  const participantsProfile = {
    participantsCount: 100,
    withScaleValues: true,
    personExtensions,
  };

  const tournamentExtensions = [
    { name: 'level', value: { level: { orderIndex: 5 } } },
    { name: 'sectionCode', value: '070' },
    { name: 'districtCode', value: '042' },
  ];

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    tournamentExtensions,
    participantsProfile,
    autoSchedule: true,
    drawProfiles,
  });

  // structure analytics
  tournamentEngine.setState(tournamentRecord);
  const { structureReports, eventStructureReports } = tournamentEngine.getStructureReports({
    extensionProfiles: [
      { name: 'level', label: 'levelOrder', accessor: 'level.orderIndex' },
      { name: 'districtCode' },
      { name: 'sectionCode' },
    ],
  });
  expect(structureReports.length).toEqual(drawProfiles.length);
  eventStructureReports.forEach((report) => {
    expect(report.totalPositionManipulations).toEqual(0);
    expect(report.generatedDrawsCount).toEqual(1);
    expect(report.drawDeletionsCount).toEqual(0);
  });

  // event analytics
  const { participantEntryReports, tournamentEntryReport, entryStatusReports, eventReports } =
    tournamentEngine.getEntryStatusReports();
  expect(eventReports.length).toEqual(drawProfiles.length);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: {
      participantTypes: [INDIVIDUAL],
      participantRoles: [COMPETITOR],
    },
    withScaleValues: true,
    withEvents: true,
    withDraws: true,
  });

  const individualParticipantsWithEvents = participants.filter(
    ({ events, participantType }) => events.length && participantType === INDIVIDUAL,
  );

  expect(tournamentEntryReport.individualParticipantsCount).toEqual(participants.length);
  expect(tournamentEntryReport.drawDefinitionsCount).toEqual(3);
  expect(tournamentEntryReport.eventsCount).toEqual(3);

  expect(tournamentEntryReport.nonParticipatingEntriesCount + participantEntryReports.length).toEqual(
    participants.length,
  );

  expect(participantEntryReports.length).toEqual(individualParticipantsWithEvents.length);

  // dummy condition
  if (!participantEntryReports.length) {
    console.log('STRUCTURE REPORT');
    console.log(tools.JSON2CSV(structureReports));
    console.log('ENTRY STATUS REPORTS');
    console.log(tools.JSON2CSV(entryStatusReports));
    console.log('PERSON ENTRY REPORTS');
    console.log(tools.JSON2CSV(participantEntryReports));
  }

  expect(structureReports.map((r) => r.pctNoRating)).toEqual([0, 0, 100]);
  expect(Object.keys(structureReports[0]).sort()).toEqual([
    'ageCategoryCode',
    'avgConfidence',
    'avgWTN',
    'category',
    'categoryName',
    'districtCode',
    'drawId',
    'drawTieFormatDesc',
    'drawTieFormatName',
    'drawType',
    'eventId',
    'eventType',
    'flightNumber',
    'levelOrder',
    'matchUpFormat',
    'matchUpsCount',
    'pctInitialMatchUpFormat',
    'pctNoRating',
    'positionManipulations',
    'sectionCode',
    'seedingBasis',
    'stage',
    'structureId',
    'tieFormatDesc',
    'tieFormatName',
    'tournamentId',
    'winningPerson2Id',
    'winningPerson2OtherId',
    'winningPerson2TennisId',
    'winningPerson2WTNconfidence',
    'winningPerson2WTNrating',
    'winningPersonId',
    'winningPersonOtherId',
    'winningPersonTennisId',
    'winningPersonWTNconfidence',
    'winningPersonWTNrating',
    'winningTeamId',
  ]);
  expect(Object.keys(entryStatusReports[0]).sort()).toEqual([
    'CONFIRMED_count',
    'CONFIRMED_pct',
    'DIRECT_ACCEPTANCE_count',
    'DIRECT_ACCEPTANCE_pct',
    'JUNIOR_EXEMPT_count',
    'JUNIOR_EXEMPT_pct',
    'LUCKY_LOSER_count',
    'LUCKY_LOSER_pct',
    'ORGANISER_ACCEPTANCE_count',
    'ORGANISER_ACCEPTANCE_pct',
    'QUALIFIER_count',
    'QUALIFIER_pct',
    'SPECIAL_EXEMPT_count',
    'SPECIAL_EXEMPT_pct',
    'WILDCARD_count',
    'WILDCARD_pct',
    'eventId',
    'tournamentId',
  ]);

  expect(instanceCount(participantEntryReports.map((r) => r.mainSeeding).filter(Boolean))).toEqual({
    1: 4,
    2: 4,
  });
  expect(Object.keys(participantEntryReports[0]).sort()).toEqual([
    'confidence',
    'drawId',
    'entryStage',
    'entryStatus',
    'eventId',
    'eventType',
    'mainSeeding',
    'participantId',
    'participantType',
    'personId',
    'personOtherId',
    'qualifyingSeeding',
    'ranking',
    'tennisId',
    'timeStamp',
    'tournamentId',
    'wtnRating',
  ]);
});

it('can generate structureReports for a COMPASS draw', () => {
  const drawProfiles = [
    {
      eventName: `COMPASS DRAW SINGLES`,
      category: { categoryName: '18U' },
      drawType: 'COMPASS',
      generate: true,
      seedsCount: 4,
      drawSize: 16,
    },
  ];

  const tournamentExtensions = [
    { name: 'level', value: { level: { orderIndex: 3 } } },
    { name: 'sectionCode', value: '045' },
    { name: 'districtCode', value: '012' },
  ];

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    tournamentExtensions,
    drawProfiles,
  });

  // structure analytics
  tournamentEngine.setState(tournamentRecord);
  const { structureReports, eventStructureReports } = tournamentEngine.getStructureReports({
    extensionProfiles: [
      { name: 'level', label: 'levelOrder', accessor: 'level.orderIndex' },
      { name: 'districtCode' },
      { name: 'sectionCode' },
    ],
  });

  expect(structureReports.length).toEqual(drawProfiles.length);
  eventStructureReports.forEach((report) => {
    expect(report.totalPositionManipulations).toEqual(0);
    expect(report.generatedDrawsCount).toEqual(1);
    expect(report.drawDeletionsCount).toEqual(0);
  });

  // event analytics
  const { participantEntryReports, tournamentEntryReport, eventReports } = tournamentEngine.getEntryStatusReports();
  expect(eventReports.length).toEqual(drawProfiles.length);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: {
      participantTypes: [INDIVIDUAL],
      participantRoles: [COMPETITOR],
    },
    withScaleValues: true,
    withEvents: true,
    withDraws: true,
  });

  const individualParticipantsWithEvents = participants.filter(
    ({ events, participantType }) => events.length && participantType === INDIVIDUAL,
  );

  expect(tournamentEntryReport.individualParticipantsCount).toEqual(participants.length);
  expect(tournamentEntryReport.drawDefinitionsCount).toEqual(1);
  expect(tournamentEntryReport.eventsCount).toEqual(1);

  expect(tournamentEntryReport.nonParticipatingEntriesCount + participantEntryReports.length).toEqual(
    participants.length,
  );

  expect(participantEntryReports.length).toEqual(individualParticipantsWithEvents.length);

  expect(structureReports.map((r) => r.drawType)).toEqual(['COMPASS']);
});

it('getStructureReports for a draw with PLAY_OFF returns 2 structures when firstStageSequenceOnly: false', () => {
  const drawId = 'M1';
  const drawProfiles = [
    {
      eventName: `SINGLES MAIN DRAW`,
      drawType: 'SINGLE_ELIMINATION',
      category: { categoryName: '18U' },
      generate: true,
      seedsCount: 4,
      drawSize: 8,
      drawId,
    },
  ];

  const tournamentExtensions = [
    { name: 'level', value: { level: { orderIndex: 2 } } },
    { name: 'sectionCode', value: '001' },
    { name: 'districtCode', value: '002' },
  ];

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    tournamentExtensions,
    drawProfiles,
  });

  // Add 3rd-4th playoff and consolation structures
  tournamentEngine.setState(tournamentRecord);

  const {
    drawDefinition: {
      structures: [{ structureId }],
    },
  } = tournamentEngine.getEvent({ drawId });

  const result = tournamentEngine.addPlayoffStructures({
    playoffStructureNameBase: '3-4 Playoff',
    playoffPositions: [3, 4],
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // Complete all matches in the draw, including the new structures
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  matchUps.forEach(({ matchUpId }) => {
    tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: 1 }, // Mark side 1 as the winner for all matches
      matchUpId,
      drawId,
    });
  });

  // Generate structure reports
  const { structureReports, eventStructureReports } = tournamentEngine.getStructureReports({
    extensionProfiles: [
      { name: 'level', label: 'levelOrder', accessor: 'level.orderIndex' },
      { name: 'districtCode' },
      { name: 'sectionCode' },
    ],
    firstStageSequenceOnly: false,
  });

  // Validate structure reports
  expect(structureReports.length).toEqual(2); // Main, Playoff, and Consolation

  // Validate event structure reports
  eventStructureReports.forEach((report) => {
    expect(report.totalPositionManipulations).toEqual(0);
    expect(report.generatedDrawsCount).toEqual(1);
    expect(report.drawDeletionsCount).toEqual(0);
  });

  // Validate participants and entry reports
  const { participantEntryReports, tournamentEntryReport, eventReports } = tournamentEngine.getEntryStatusReports();
  expect(eventReports.length).toEqual(drawProfiles.length);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: {
      participantTypes: [INDIVIDUAL],
      participantRoles: [COMPETITOR],
    },
    withScaleValues: true,
    withEvents: true,
    withDraws: true,
  });

  const individualParticipantsWithEvents = participants.filter(
    ({ events, participantType }) => events.length && participantType === INDIVIDUAL,
  );

  expect(tournamentEntryReport.individualParticipantsCount).toEqual(participants.length);
  expect(tournamentEntryReport.drawDefinitionsCount).toEqual(1);
  expect(tournamentEntryReport.eventsCount).toEqual(1);

  expect(tournamentEntryReport.nonParticipatingEntriesCount + participantEntryReports.length).toEqual(
    participants.length,
  );

  expect(participantEntryReports.length).toEqual(individualParticipantsWithEvents.length);
});
