import { getParticipantId } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { mockProfile } from './mockScaleProfile';
import { expect, it, test } from 'vitest';
import { unique } from '@Tools/arrays';

// constants and fixtures
import { EVENT_NOT_FOUND, INVALID_VALUES } from '@Constants/errorConditionConstants';
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import { ELO, NTRP, UTR, WTN } from '@Constants/ratingConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';

const WTN_RATING = 'SCALE.RATING.SINGLES.WTN';

// prettier-ignore
const rankingsScenarios = [
  { category: { categoryName: 'U18' }, expectation: { timeItem: { itemType: 'SCALE.RANKING.SINGLES.U18' } }},
  { category: { categoryName: '18U' }, expectation: { timeItem: { itemType: 'SCALE.RANKING.SINGLES.18U' } }},
  { category: { ratingType: WTN }, expectation: { timeItem: { itemType: WTN_RATING }, accessor: true }},
  { category: { ratingType: UTR }, expectation: { timeItem: { itemType: 'SCALE.RATING.SINGLES.UTR' } }},
  { category: { ratingType: NTRP }, expectation: { timeItem: { itemType: 'SCALE.RATING.SINGLES.NTRP' }, accessor: true }},
  { category: { ratingType: WTN, ratingMin: 5, ratingMax: 8 }, expectation: { timeItem: { itemType: WTN_RATING }, accessor: true }},
  { category: { ratingType: WTN, ratingMin: 8, ratingMax: 9 }, expectation: { timeItem: { itemType: WTN_RATING }, accessor: true }},
  { category: { ratingType: UTR, ratingMin: 9, ratingMax: 13 }, expectation: { timeItem: { itemType: 'SCALE.RATING.SINGLES.UTR' } }},
  { category: { ratingType: ELO, ratingMin: 1200, ratingMax: 1400 }, expectation: { timeItem: { itemType: 'SCALE.RATING.SINGLES.ELO' } }},
];

test.each(rankingsScenarios)('it can generate rankings for participants', (scenario) => {
  const participantsProfile = { category: scenario.category, participantsCount: 1 };

  const {
    participants: [participant],
  } = mocksEngine.generateParticipants(participantsProfile);

  if (scenario.expectation.timeItem && participant.timeItems?.length) {
    const timeItem = participant.timeItems[0];
    expect(timeItem.itemType).toEqual(scenario.expectation.timeItem.itemType);
    const { ratingMin, ratingMax, ratingType } = scenario.category;
    const accessor = ratingType && ratingsParameters[ratingType]?.accessor;
    const itemValue = timeItem.itemValue;
    const value = accessor ? itemValue[accessor] : itemValue;

    expect(value).not.toBeUndefined();

    if (ratingMin && ratingMax) {
      expect(value).toBeLessThanOrEqual(ratingMax);
      expect(value).toBeGreaterThanOrEqual(ratingMin);
    }
  } else {
    // ratingMin and ratingMax are close and there is a chance no random values fall into the range
    expect([ELO, WTN].includes(ratingType)).toEqual(true);
  }
});

const ratingType = WTN;
const categoryName = '12U';

// prettier-ignore
const mockScenarios = [
   { drawProfiles: [{ drawSize: 4, category: { categoryName }, rankingRange: [1, 15] }], expectation: { itemType: 'SCALE.RANKING.SINGLES.12U' }},
   { eventProfiles: [{ drawProfiles: [{ drawSize: 4 }], category: { categoryName }, rankingRange: [1, 15] }], expectation: { itemType: 'SCALE.RANKING.SINGLES.12U' }},
   { drawProfiles: [{ drawSize: 4, category: { ratingType }, rankingRange: [1, 15] }], expectation: { itemType: WTN_RATING }},
   { eventProfiles: [{ drawProfiles: [{ drawSize: 4 }], category: { ratingType }, rankingRange: [1, 15] }], expectation: { itemType: WTN_RATING }}
];

it.each(mockScenarios)('can generate events with scaled participants', (scenario) => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord(scenario);
  tournamentEngine.setState(tournamentRecord);

  const {
    drawDefinition: {
      structures: [{ structureId }],
    },
  } = tournamentEngine.getEvent({ drawId });
  const { positionAssignments } = tournamentEngine.getPositionAssignments({
    structureId,
    drawId,
  });
  const participantIds = positionAssignments.map(getParticipantId);
  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantIds },
  });
  participants.forEach(({ timeItems }) => {
    const { itemValue, itemType } = timeItems[0];
    expect(itemType).toEqual(scenario.expectation.itemType);
    expect(itemValue).not.toBeUndefined();
  });
});

// testing that NTRP values can be generated with a "step" of "0.5"
test('generates participants with rankings and ratings with additional embellishments', () => {
  const { tournamentRecord, eventIds } = mocksEngine.generateTournamentRecord(mockProfile);

  tournamentEngine.setState(tournamentRecord);

  let { participants } = tournamentEngine.getParticipants();
  const tournamentParticipantsCount = participants.length;

  const scaleItems = participants
    .map((p) => p.timeItems?.filter((i) => i.itemType.startsWith('SCALE')))
    .filter(Boolean)
    .flat();

  let typesCount = 0;
  expect(scaleItems.length).toEqual(tournamentParticipantsCount);

  scaleItems.forEach(({ itemType, itemValue }) => {
    if (itemType === 'SCALE.RANKING.SINGLES.U18') {
      expect(itemValue).toEqual(Math.round(itemValue));
      typesCount += 1;
    } else if (itemType === WTN_RATING) {
      const decimalValue = itemValue.wtnRating.toString().split('.')[1];
      decimalValue && expect([1, 2].includes(decimalValue?.length)).toEqual(true);
      typesCount += 1;
    } else if (itemType === 'SCALE.RATING.SINGLES.NTRP') {
      const decimalValue = itemValue.ntrpRating.toString().split('.')[1];
      if (decimalValue) expect(decimalValue).toEqual('5');
      typesCount += 1;
    }
  });
  expect(typesCount).toEqual(scaleItems.length);

  ({ participants } = tournamentEngine.getParticipants({
    withScaleValues: true,
    inContext: true,
  }));

  let withRatings = 0;
  let withRankings = 0;
  participants.forEach((participant) => {
    if (participant?.rankings[SINGLES]) {
      withRankings += 1;
      expect(participant.rankings[SINGLES].length).toEqual(1);
    }
    if (participant?.ratings[SINGLES]) {
      withRatings += 1;
      expect(participant.ratings[SINGLES].length).toEqual(1);
    }
  });
  expect(withRankings).toEqual(8);
  expect(withRatings).toEqual(16);

  ({ participants } = tournamentEngine.getParticipants({
    participantFilters: { eventIds: [eventIds[0]] },
    inContext: true,
    withIOC: true,
  }));

  expect(participants.length).toEqual(8);

  for (const eventId of eventIds) {
    const { flightProfile } = tournamentEngine.getFlightProfile({ eventId });
    for (const flight of flightProfile.flights) {
      const { drawDefinition } = tournamentEngine.generateDrawDefinition({
        drawEntries: flight.drawEntries,
        drawId: flight.drawId,
        eventId,
      });
      const result = tournamentEngine.addDrawDefinition({
        drawDefinition,
        eventId,
        flight,
      });
      expect(result.success).toEqual(true);
    }
  }
  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextProfile: { withScaleValues: true },
  });
  const scaleValuesPresent = matchUps.every(
    ({ sides }) =>
      !sides || sides.some(({ participant }) => !participant || participant.ratings || participant.rankings),
  );

  expect(scaleValuesPresent).toEqual(true);

  const eventScaleValues = tournamentEngine.getEvents({
    withScaleValues: true,
  }).eventScaleValues;
  expect(eventScaleValues[eventIds[1]].ratings.WTN.length).toEqual(8);
  expect(eventScaleValues[eventIds[2]].ratings.NTRP.length).toEqual(8);
});

it('can assess predictive accuracy of scaleValues', () => {
  const drawProfile: any = mockProfile.drawProfiles.find((drawProfile) => drawProfile.category.ratingType === WTN);
  const drawSize = 64;
  if (drawProfile) {
    drawProfile.scaledParticipantsCount = drawSize - 4;
    drawProfile.drawSize = drawSize;
    drawProfile.generate = true;
  }

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [drawProfile],
    completeAllMatchUps: true,
  });

  tournamentEngine.setState(tournamentRecord);

  const participants = tournamentRecord.participants;
  const participantsWithTimeItemsCount = participants.filter(({ timeItems }) => timeItems?.length).length;

  expect(participantsWithTimeItemsCount).toEqual(drawSize - 4);

  // test whether it can handle being passed an array of empty matchUps
  let result = tournamentEngine.getPredictiveAccuracy({
    exclusionRule: { valueAccessor: 'confidence', range: [0, 70] },
    matchUpFilters: { matchUpStatuses: [COMPLETED] },
    ascending: true, // scale goes from low to high
    valueAccessor: 'wtnRating',
    scaleName: WTN,
    zoneMargin: 3,
    matchUps: [],
  });
  expect(result.success).toEqual(true);
  expect(result.relevantMatchUps.length).toEqual(0);

  // test behevior when matchUps is not an array and not undefined
  result = tournamentEngine.getPredictiveAccuracy({
    exclusionRule: { valueAccessor: 'confidence', range: [0, 70] },
    matchUpFilters: { matchUpStatuses: [COMPLETED] },
    ascending: true, // scale goes from low (best) to high
    valueAccessor: 'wtnRating',
    matchUps: { boo: 1 },
    scaleName: WTN,
    zoneMargin: 3,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  const { accuracy, zoneDistribution } = tournamentEngine.getPredictiveAccuracy({
    exclusionRule: { valueAccessor: 'confidence', range: [0, 70] },
    matchUpFilters: { matchUpStatuses: [COMPLETED] },
    ascending: true, // scale goes from low (best) to high
    valueAccessor: 'wtnRating',
    scaleName: WTN,
    zoneMargin: 3,
  });

  const distributionValues: number[] = Object.values(zoneDistribution);
  const zonePercentTotal = distributionValues.reduce((a, b) => a + b, 0);
  expect(Math.round(zonePercentTotal)).toEqual(100);

  accuracy.excluded.forEach(({ exclusionValues, sideValues }) => {
    if (exclusionValues) {
      exclusionValues.forEach((value) => expect(value).toBeLessThanOrEqual(70));
    } else {
      expect(sideValues.some((value) => !value.scaleValue)).toEqual(true);
    }
  });

  // WTN is ascending: true (lower = stronger). Affirmative ⇒ rating-favored
  // (lower-value) player won; negative ⇒ upset (higher-value player won).
  accuracy.affirmative.forEach(({ winningSide, sideValues }) => {
    const winningIndex = winningSide - 1;
    expect(sideValues[winningIndex].value).toBeLessThanOrEqual(sideValues[1 - winningIndex].value);
  });
  accuracy.negative.forEach(({ winningSide, sideValues }) => {
    const winningIndex = winningSide - 1;
    expect(sideValues[winningIndex].value).toBeGreaterThanOrEqual(sideValues[1 - winningIndex].value);
  });
});

it('can get predictiveAccuracy for DOUBLES events', () => {
  const drawProfiles = [
    {
      category: { ratingType: 'WTN', ratingMin: 8, ratingMax: 12 },
      eventName: `WTN 8-12 DOUBLES`,
      eventType: DOUBLES,
      drawSize: 32,
    },
  ];
  const participantsProfile = { scaledParticipantsCount: 100 };
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    participantsProfile,
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const matchUpStatuses = unique(matchUps.map(({ matchUpStatus }) => matchUpStatus));
  expect(matchUpStatuses).toEqual([COMPLETED]);

  let { accuracy } = tournamentEngine.getPredictiveAccuracy({
    valueAccessor: 'wtnRating',
    scaleName: WTN,
  });

  expect(matchUps.length).toEqual(accuracy.affirmative.length + accuracy.negative.length);

  ({ accuracy } = tournamentEngine.getPredictiveAccuracy({
    valueAccessor: 'wtnRating',
    scaleName: WTN,
    drawId: 'none',
  }));

  expect(accuracy.affirmative.length + accuracy.negative.length + accuracy.excluded.length).toEqual(0);

  const result = tournamentEngine.getPredictiveAccuracy({
    valueAccessor: 'wtnRating',
    scaleName: WTN,
    eventId: 'none',
  });
  expect(result.error).toEqual(EVENT_NOT_FOUND);
});

it('can pass matchUps array into predictiveAccuracy', () => {
  const drawProfiles = [
    {
      category: { ratingType: 'WTN', ratingMin: 8, ratingMax: 12 },
      eventName: `WTN 8-12 DOUBLES`,
      eventType: DOUBLES,
      drawSize: 32,
    },
  ];
  const participantsProfile = { scaledParticipantsCount: 100 };
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    participantsProfile,
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const matchUpStatuses = unique(matchUps.map(({ matchUpStatus }) => matchUpStatus));
  expect(matchUpStatuses).toEqual([COMPLETED]);

  const contextProfile = { withScaleValues: true, withCompetitiveness: true };
  const contextFilters = {
    matchUpTypes: [SINGLES, DOUBLES],
  };
  matchUps = tournamentEngine.allTournamentMatchUps({
    contextProfile,
    contextFilters,
    inContext: true,
  }).matchUps;

  const { accuracy } = tournamentEngine.getPredictiveAccuracy({
    valueAccessor: 'wtnRating',
    scaleName: WTN,
    matchUps,
  });

  expect(matchUps.length).toEqual(accuracy.affirmative.length + accuracy.negative.length);
});
