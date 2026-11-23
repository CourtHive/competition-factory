import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { UTR, WTN } from '@Constants/ratingConstants';

const scenarios = [
  { category: { ratingType: UTR, ratingMin: 6, ratingMax: 14 }, drawSize: 16, roundsCount: 1, attachMatchUps: true },
  { category: { ratingType: WTN, ratingMin: 6, ratingMax: 14 }, drawSize: 8, roundsCount: 4, attachMatchUps: true },
];

it.each(scenarios.slice(0, 1))('can generate level based rounds with WTN', (scenario) => {
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

  const scaleName = scenario.category.ratingType;
  const accessor = ratingsParameters[scaleName].accessor;
  const roundsCount = scenario.roundsCount || 1;
  const drawSize = scenario.drawSize || 8;
  const drawId = 'drawId';

  const ratingsValues = [6.1, 6.5, 7.5, 7.8, 8.5, 8.6, 9.5, 9.8, 10.5, 10.6, 11.5, 11.8, 12.5, 12.6, 13.5, 13.8].map(
    (value) => ({ [accessor]: value }),
  );

  mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P', scaleAllParticipants: true, ratingsValues },
    drawProfiles: [
      {
        category: scenario.category,
        drawType: AD_HOC,
        automated: true,
        roundsCount,
        scaleName,
        drawSize,
        drawId,
      },
    ],
    setState: true,
  });

  const matchUps = tournamentEngine.allTournamentMatchUps({ participantsProfile: { withScaleValues: true } }).matchUps;
  expect(matchUps.length).toEqual((roundsCount * drawSize) / 2);
  const { roundMatchUps } = getRoundMatchUps({ matchUps });

  const participants = tournamentEngine.getParticipants({ withScaleValues: true }).participants;
  const ratings = participants.map((participant) => participant.ratings.SINGLES[0].scaleValue);
  expect(ratings.map((rating) => rating[accessor])).toEqual(
    ratingsValues.map((rating) => rating[accessor]).slice(0, drawSize),
  );
  for (const round in roundMatchUps) {
    const pairRatings = roundMatchUps[round].map(getPairRatings(scenario.category.ratingType));
    const maxDiff = Math.max(...pairRatings.map(({ diff }) => diff));
    expect(maxDiff).toBeLessThanOrEqual(2.5);
  }
});
