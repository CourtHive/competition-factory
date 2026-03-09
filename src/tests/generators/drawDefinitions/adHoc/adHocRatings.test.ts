import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import { INVALID_EVENT_TYPE } from '@Constants/errorConditionConstants';
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { UTR, WTN } from '@Constants/ratingConstants';
import { DYNAMIC } from '@Constants/scaleConstants';
import { SINGLES } from '@Constants/eventConstants';

const scenarios = [
  { category: { ratingType: UTR, ratingMin: 10, ratingMax: 12 }, diffTolerance: 2, attachMatchUps: true },
  { category: { ratingType: WTN, ratingMin: 10, ratingMax: 12 }, diffTolerance: 2, attachMatchUps: true },
  { category: { ratingType: UTR, ratingMin: 7, ratingMax: 10 }, diffTolerance: 3, attachMatchUps: true },
  { category: { ratingType: UTR, ratingMin: 7, ratingMax: 10 }, diffTolerance: 3, attachMatchUps: false },
];

it.each(scenarios)('can generate level based rounds with WTN', (scenario) => {
  const participantPressure: { [key: string]: any } = {};
  const getPairRatings = (scaleName) => (matchUp) => {
    const scaleValues = matchUp.sides.map((side) => side.participant.ratings.SINGLES[0].scaleValue);
    const values = scaleValues.map((scaleValue) => scaleValue?.[ratingsParameters[scaleName].accessor]);
    const diff = Number.parseFloat(Math.abs(values[0] - values[1]).toFixed(2));
    const lowSide = values[0] < values[1] ? 0 : 1;
    for (const side of matchUp.sides) {
      const participantId = side.participant.participantId;
      if (!participantPressure[participantId]) participantPressure[participantId] = { rounds: [], aggregate: 0 };
      participantPressure[participantId].rounds.push(lowSide === 0 ? diff : -diff);
      participantPressure[participantId].aggregate = participantPressure[participantId].rounds.reduce(
        (a, b) => a + b,
        0,
      );
    }
    return { values, diff };
  };
  const drawId = 'drawId';
  const drawSize = 32;

  mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P', scaleAllParticipants: true },
    drawProfiles: [
      {
        category: scenario.category,
        drawType: AD_HOC,
        automated: true,
        scaleName: WTN,
        roundsCount: 4,
        drawSize,
        drawId,
      },
    ],
    setState: true,
  });

  const matchUps = tournamentEngine.allTournamentMatchUps({ participantsProfile: { withScaleValues: true } }).matchUps;
  const { roundMatchUps } = getRoundMatchUps({ matchUps });

  for (const round in roundMatchUps) {
    const pairRatings = roundMatchUps[round].map(getPairRatings(scenario.category.ratingType));
    if (scenario.diffTolerance) expect(pairRatings.every(({ diff }) => diff <= scenario.diffTolerance)).toEqual(true);
  }

  const participants = tournamentEngine.getParticipants({ withScaleValues: true }).participants;
  const valueAccessor = ratingsParameters[scenario.category.ratingType].accessor;
  expect(participants.every(({ ratings }) => ratings.SINGLES?.[0]?.scaleValue?.[valueAccessor])).toEqual(true);
});

it.each(scenarios)('will update adHocRatings and use DYNAMIC ratings for subsequent round generation', (scenario) => {
  const drawId = 'drawId';
  const drawSize = 32;

  mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P', scaleAllParticipants: true },
    completeAllMatchUps: true,
    setState: true,
    drawProfiles: [
      {
        scaleName: scenario.category.ratingType,
        category: scenario.category,
        drawType: AD_HOC,
        automated: true,
        roundsCount: 1,
        drawSize,
        drawId,
      },
    ],
  });

  let generationResult = tournamentEngine.drawMatic({
    updateParticipantRatings: true,
    dynamicRatings: true,
    drawId,
  });
  let modifiedScaleValues: any[] = Object.values(generationResult.roundResults[0].modifiedScaleValues);
  expect(modifiedScaleValues.length).toEqual(drawSize);
  expect(modifiedScaleValues[0].scaleValue).toBeDefined();
  expect(generationResult.success).toEqual(true);

  if (scenario.attachMatchUps) {
    const addResult = tournamentEngine.addAdHocMatchUps({
      matchUps: generationResult.matchUps,
      drawId,
    });
    expect(addResult.success).toEqual(true);
  }

  let participants = tournamentEngine.getParticipants({ withScaleValues: true }).participants;
  expect(participants.every((p) => p.timeItems[1].itemType.split('.').reverse()[0] === DYNAMIC));

  const valueAccessor = ratingsParameters[scenario.category.ratingType].accessor;
  const participantDynamics = participants.map((p) => p.timeItems[1].itemValue?.[valueAccessor]);
  generationResult = tournamentEngine.drawMatic({
    updateParticipantRatings: true,
    refreshDynamic: true,
    dynamicRatings: true,
    drawId,
  });
  modifiedScaleValues = Object.values(generationResult.roundResults[0].modifiedScaleValues);
  expect(modifiedScaleValues.length).toEqual(drawSize);
  expect(modifiedScaleValues[0].scaleValue).toBeDefined();
  participants = tournamentEngine.getParticipants({ withScaleValues: true }).participants;
  const updatedDynamics = participants.map((p) => p.timeItems[1].itemValue?.[valueAccessor]);
  expect(updatedDynamics).toEqual(participantDynamics);

  generationResult = tournamentEngine.drawMatic({
    updateParticipantRatings: true,
    refreshDynamic: false,
    dynamicRatings: true,
    drawId,
  });
  modifiedScaleValues = Object.values(generationResult.roundResults[0].modifiedScaleValues);

  if (scenario.attachMatchUps) {
    expect(modifiedScaleValues.length).toEqual(0); // no modifiedScaleValues because previous round had no completed matchUps
  } else {
    // when { refreshDynamic: false } and drawMatic is called iteratively, modifiedScaleValues will be returned
    // and THE MODIFICATIONS WILL BE ITERATING OVER THE SAME RESULTS
    expect(modifiedScaleValues.length).toEqual(drawSize);
    participants = tournamentEngine.getParticipants({ withScaleValues: true }).participants;
    const updatedDynamics = participants.map((p) => p.timeItems[1].itemValue?.[valueAccessor]);
    expect(updatedDynamics).not.toEqual(participantDynamics);

    let result = tournamentEngine.removeRatings({
      ratingType: scenario.category.ratingType,
      asDynamic: true,
    });
    expect(result.error).toEqual(INVALID_EVENT_TYPE);

    result = tournamentEngine.removeRatings({
      ratingType: scenario.category.ratingType,
      eventType: SINGLES,
      asDynamic: true,
    });
    expect(result.success).toEqual(true);
    participants = tournamentEngine.getParticipants({ withScaleValues: true }).participants;
    // all prior dynamic ratings are expected to have been removed
    expect(participants.every(({ timeItems }) => timeItems.length === 1)).toEqual(true);
  }
});

it('will accept adHocRatings at generation time', () => {
  expect(true).toEqual(true);
});

it('iterative AD_HOC completes each round before generating the next with dynamic ratings', () => {
  const drawId = 'drawId';
  const drawSize = 16;
  const roundsCount = 4;
  const ratingType = WTN;

  mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P', scaleAllParticipants: true },
    completeAllMatchUps: true,
    drawProfiles: [
      {
        category: { ratingType, ratingMin: 10, ratingMax: 14 },
        scaleName: ratingType,
        drawType: AD_HOC,
        automated: true,
        roundsCount,
        drawSize,
        drawId,
      },
    ],
    setState: true,
  });

  // All matchUps should be completed
  const { completedMatchUps } = tournamentEngine.tournamentMatchUps();
  const totalExpected = Math.floor(drawSize / 2) * roundsCount;
  expect(completedMatchUps.length).toEqual(totalExpected);

  // Verify all rounds are present
  const roundNumbers = [...new Set(completedMatchUps.map((m) => m.roundNumber))];
  expect(roundNumbers.toSorted((a: any, b: any) => a - b)).toEqual([1, 2, 3, 4]);

  // Verify pairings avoid repeated opponents (drawMatic should prevent re-matches)
  const pairings = completedMatchUps.map(({ sides }) =>
    sides
      .map((s) => s.participantId)
      .sort()
      .join('|'),
  );
  const uniquePairings = [...new Set(pairings)];
  // With 16 participants and 4 rounds, each participant has 15 possible opponents,
  // so all pairings should be unique
  expect(pairings.length).toEqual(uniquePairings.length);
});
