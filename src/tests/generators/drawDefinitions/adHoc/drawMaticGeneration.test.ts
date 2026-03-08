import { getParticipantId } from '@Functions/global/extractors';
import { generateRange, unique } from '@Tools/arrays';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, test } from 'vitest';

// constants
import { EXISTING_MATCHUP_ID, INVALID_DRAW_DEFINITION, INVALID_VALUES, MISSING_PARTICIPANT_IDS } from '@Constants/errorConditionConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { DOUBLES, SINGLES } from '@Constants/eventConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';

const getParticipantType = (eventType) => (eventType === SINGLES && INDIVIDUAL) || (eventType === DOUBLES && PAIR);

const scenarios = [
  { eventType: SINGLES, drawSize: 5, roundsCount: 4 },
  { eventType: SINGLES, drawSize: 6, roundsCount: 3 },
  { eventType: SINGLES, drawSize: 8, roundsCount: 3 },
  { eventType: SINGLES, drawSize: 10, roundsCount: 3 },
  { eventType: DOUBLES, drawSize: 10, roundsCount: 1 },
];

it.each(scenarios)('can generate AD_HOC with arbitrary drawSizes', (scenario) => {
  const { drawSize, eventType } = scenario;

  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P' },
    drawProfiles: [
      {
        drawType: AD_HOC,
        automated: true,
        roundsCount: 1,
        eventType,
        drawSize,
      },
    ],
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toEqual(Math.floor(drawSize / 2));
  expect(matchUps[0].sides[0].participant.participantType).toEqual(getParticipantType(scenario.eventType));
  expect(matchUps[0].sides[0].participant.participantId.slice(0, 4)).toEqual(eventType === SINGLES ? 'P-I-' : 'P-P-');
  const structureId = matchUps[0].structureId;

  for (const roundNumber of generateRange(2, (scenario?.roundsCount || 0) + 1 || 2)) {
    const result = tournamentEngine.drawMatic({
      restrictEntryStatus: true,
      generateMatchUps: true, // without this it will only generate { participantIdPairings }
      drawId,
    });
    expect(result.success).toEqual(true);

    const addResult = tournamentEngine.addAdHocMatchUps({
      matchUps: result.matchUps,
      structureId,
      drawId,
    });
    expect(addResult.success).toEqual(true);

    const matchUpsPerRound = Math.floor(drawSize / 2);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    expect(matchUps.length).toEqual(matchUpsPerRound * roundNumber); // # participants is half drawSize * roundNumber
    expect(matchUps[matchUps.length - 1].roundNumber).toEqual(roundNumber);

    // now get all matchUp.sides => participantIds and ensure all pairings are unique
    // e.g. participants did not play the same opponent
    const pairings = matchUps.map(({ sides }) => sides.map(getParticipantId).sort().join('|'));
    const uniquePairings = unique(pairings);
    if (roundNumber < (drawSize % 2 ? drawSize - 1 : drawSize)) {
      expect(pairings.length - uniquePairings.length).toEqual(0);
    }
  }
});

it.each(scenarios)('DrawMatic events can be generated using eventProfiles', (scenario) => {
  const { drawSize, eventType, roundsCount = 1 } = scenario;
  const eventProfiles = [
    {
      drawProfiles: [{ drawType: AD_HOC, drawSize, automated: true, roundsCount }],
      eventType,
    },
  ];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P' },
    eventProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const matchUpsPerRound = Math.floor(drawSize / 2);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toEqual(matchUpsPerRound * roundsCount);
  const roundNames = matchUps.map((m) => m.roundName);
  roundNames.forEach((roundName) => expect(roundName[0]).toEqual('R'));
});

it('can use drawMatic to generate rounds in existing AD_HOC draws', () => {
  const participantsCount = 20;
  const eventId = 'eventId';
  mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventId, eventName: 'Match Play', participantsProfile: { participantsCount } }],
    setState: true,
  });

  let result = tournamentEngine.generateDrawDefinition({
    drawSize: participantsCount,
    drawType: AD_HOC,
    eventId,
  });
  expect(result.success).toEqual(true);
  const { drawId } = result.drawDefinition;

  result = tournamentEngine.addDrawDefinition({
    drawDefinition: result.drawDefinition,
    eventId,
  });
  expect(result.success).toEqual(true);

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toEqual(0);

  result = tournamentEngine.drawMatic({ drawId });
  let addResult = tournamentEngine.addAdHocMatchUps({
    matchUps: result.matchUps,
    drawId,
  });
  expect(addResult.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  expect(matchUps.length).toEqual(10);
  const structureId = matchUps[0].structureId;

  result = tournamentEngine.drawMatic({ drawId });
  addResult = tournamentEngine.addAdHocMatchUps({
    matchUps: result.matchUps,
    structureId,
    drawId,
  });
  expect(addResult.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  expect(matchUps.length).toEqual(20);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { roundNumbers: [2] },
  }));
  expect(matchUps.length).toEqual(10);

  // will not add matchUps to structure
  result = tournamentEngine.drawMatic({ drawId });
  expect(result.matchUps.length).toEqual(10);

  // number of matchUps will not have changed
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  expect(matchUps.length).toEqual(20);

  const matchUpsToAdd = makeDeepCopy(result.matchUps);

  result = tournamentEngine.addAdHocMatchUps({
    matchUps: matchUpsToAdd,
    drawId,
  });
  expect(result.success).toEqual(true);

  // number of matchUps will be greater
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  expect(matchUps.length).toEqual(30);

  result = tournamentEngine.addAdHocMatchUps({
    matchUps: matchUpsToAdd,
    drawId,
  });
  expect(result.error).toEqual(EXISTING_MATCHUP_ID);

  // number of matchUps will not have changed
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  expect(matchUps.length).toEqual(30);
});

it('cannot use drawMatic when there are no entries present', () => {
  const participantsCount = 20;
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount },
  });

  tournamentEngine.setState(tournamentRecord);

  const {
    event: { eventId },
  } = tournamentEngine.addEvent({
    event: { eventName: 'Match Play' },
  });

  let result = tournamentEngine.generateDrawDefinition({
    drawType: AD_HOC,
    automated: true,
    eventId,
  });
  expect(result.success).toEqual(true);
  const { drawId } = result.drawDefinition;

  result = tournamentEngine.addDrawDefinition({
    drawDefinition: result.drawDefinition,
    eventId,
  });
  expect(result.success).toEqual(true);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toEqual(0);

  result = tournamentEngine.drawMatic({ drawId });
  expect(result.error).toEqual(MISSING_PARTICIPANT_IDS);
});

const drawMaticScenarios = [
  { drawSize: 4, roundsCount: 1, expectation: { success: true } },
  { drawSize: 4, roundsCount: 2, expectation: { success: true } },
  { drawSize: 4, roundsCount: 3, expectation: { success: true } },
  { drawSize: 4, roundsCount: 4, expectation: { error: INVALID_VALUES } },
  { drawSize: 4, roundsCount: 4, enableDoubleRobin: true, expectation: { success: true } },
  { drawSize: 4, roundsCount: 6, enableDoubleRobin: true, expectation: { success: true } },
  { drawSize: 4, roundsCount: 7, enableDoubleRobin: true, expectation: { error: INVALID_VALUES } },
];

test.each(drawMaticScenarios)('drawMatic can generate multiple rounds', (scenario) => {
  const { drawSize, roundsCount, enableDoubleRobin } = scenario;
  const drawId = 'drawId';

  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: AD_HOC, drawSize }],
    setState: true,
  });

  const result = tournamentEngine.drawMatic({ drawId, roundsCount, enableDoubleRobin });
  if (scenario.expectation.success) {
    expect(result.success).toEqual(true);
  } else if (scenario.expectation.error) {
    expect(result.error).toEqual(scenario.expectation.error);
  }
});

it('returns INVALID_VALUES when roundsCount is a string', () => {
  const drawId = 'drawId';

  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: AD_HOC, drawSize: 4 }],
    setState: true,
  });

  const result = tournamentEngine.drawMatic({ drawId, roundsCount: 'two' as any });
  expect(result.error).toEqual(INVALID_VALUES);
});

it('returns INVALID_DRAW_DEFINITION for non-AD_HOC drawType', () => {
  const drawId = 'drawId';

  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 4 }],
    setState: true,
  });

  // The draw has SINGLE_ELIMINATION type, not AD_HOC
  const result = tournamentEngine.drawMatic({ drawId });
  expect(result.error).toEqual(INVALID_DRAW_DEFINITION);
});

it('handles restrictRoundsCount !== false for large roundsCount', () => {
  // Test the boundary where roundsCount equals participantIds.length - 1
  const drawId = 'drawId2';

  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: AD_HOC, drawSize: 4 }],
    setState: true,
  });

  // roundsCount = 3 = participantIds.length - 1 = 4 - 1 = 3 → exactly at limit, should succeed
  const result = tournamentEngine.drawMatic({ drawId, roundsCount: 3 });
  expect(result.success).toEqual(true);
});

it('handles roundsCount > 31 restriction', () => {
  const drawId = 'drawId';

  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: AD_HOC, drawSize: 40 }],
    setState: true,
  });

  const result = tournamentEngine.drawMatic({ drawId, roundsCount: 32 });
  expect(result.error).toEqual(INVALID_VALUES);
});

it('can generate { automated: false } AD_HOC with arbitrary roundsCount', () => {
  const roundsCount = 3;
  const drawSize = 16;
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: AD_HOC,
        automated: false,
        roundsCount,
        drawSize,
      },
    ],
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toEqual(roundsCount * (drawSize / 2));
});
