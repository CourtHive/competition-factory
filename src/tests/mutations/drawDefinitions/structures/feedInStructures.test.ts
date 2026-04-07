import { generateDrawTypeAndModifyDrawDefinition } from '@Assemblies/generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { feedInMatchUps } from '@Assemblies/generators/drawDefinitions/feedInMatchUps';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { getDrawData } from '@Query/drawDefinition/getDrawData';
import { generateRange } from '@Tools/arrays';
import { feedInChampionship } from '../primitives/feedIn';
import { expect, it } from 'vitest';

import { DrawDefinition } from '@Types/tournamentTypes';
import {
  TOP_DOWN,
  BOTTOM_UP,
  MFIC,
  LOSER,
  FEED_IN,
  FEED_IN_CHAMPIONSHIP,
  FICR16,
  FICSF,
} from '@Constants/drawDefinitionConstants';

it('can generate structured entry draw', () => {
  const drawDefinition: DrawDefinition = newDrawDefinition();
  const structure = generateDrawTypeAndModifyDrawDefinition({
    drawDefinition,
    drawType: FEED_IN,
    drawSize: 31,
  })?.structures?.[0];
  const matchUps = structure?.matchUps ?? [];
  const matchUpsCount = matchUps.length;
  expect(matchUpsCount).toEqual(30);

  const drawPositions = [
    [16, 17],
    [18, 19],
    [20, 21],
    [22, 23],
    [24, 25],
    [26, 27],
    [28, 29],
    [30, 31],
    [8],
    [9],
    [10],
    [11],
    [12],
    [13],
    [14],
    [15],
    [],
    [],
    [],
    [],
    [4],
    [5],
    [6],
    [7],
    [],
    [],
    [2],
    [3],
    [],
    [1],
  ];

  matchUps.forEach((matchUp, i) => {
    expect(matchUp.drawPositions?.filter(Boolean)).toMatchObject(drawPositions[i]);
  });
});

it('generates structured entry draw with expected finishing drawPositions', () => {
  const drawDefinition: DrawDefinition = newDrawDefinition();
  const structure = generateDrawTypeAndModifyDrawDefinition({
    drawDefinition,
    drawType: FEED_IN,
    drawSize: 31,
  })?.structures?.[0];
  const matchUps = structure?.matchUps ?? [];
  const matchUpsCount = matchUps.length;
  expect(matchUpsCount).toEqual(30);

  const finishingPositionRanges = [
    { loser: [24, 31], winner: [1, 23] },
    { loser: [16, 23], winner: [1, 15] },
    { loser: [12, 15], winner: [1, 11] },
    { loser: [8, 11], winner: [1, 7] },
    { loser: [6, 7], winner: [1, 5] },
    { loser: [4, 5], winner: [1, 3] },
    { loser: [3, 3], winner: [1, 2] },
    { loser: [2, 2], winner: [1, 1] },
  ];

  matchUps.forEach((matchUp) => {
    const roundIndex = matchUp.roundNumber && matchUp.roundNumber - 1;
    if (roundIndex !== undefined) {
      const expectedLoserRange = finishingPositionRanges[roundIndex].loser;
      const expectedWinnerRange = finishingPositionRanges[roundIndex].winner;
      expect(matchUp.finishingPositionRange?.loser).toMatchObject(expectedLoserRange);
      expect(matchUp.finishingPositionRange?.winner).toMatchObject(expectedWinnerRange);
    }
  });
});

it('can generate FEED_IN_CHAMPIONSHIP with drawSize: 16', () => {
  const drawSize = 16;
  const { links, mainDrawMatchUps, consolationMatchUps } =
    feedInChampionship({
      drawType: FEED_IN_CHAMPIONSHIP,
      drawSize,
    }) ?? {};

  expect(mainDrawMatchUps.length).toEqual(drawSize - 1);
  expect(consolationMatchUps.length).toEqual(drawSize - 2);

  expect(links.length).toEqual(4);
  expect(links[0].linkType).toEqual(LOSER);
  expect(links[0].target.feedProfile).toEqual(TOP_DOWN);
  expect(links[1].linkType).toEqual(LOSER);
  expect(links[1].target.feedProfile).toEqual(BOTTOM_UP);
  expect(links[2].linkType).toEqual(LOSER);
  expect(links[2].target.feedProfile).toEqual(TOP_DOWN);
  expect(links[3].linkType).toEqual(LOSER);
  expect(links[3].target.feedProfile).toEqual(BOTTOM_UP);

  expect(links[0].source.roundNumber).toEqual(1);
  expect(links[0].source.roundNumber).toEqual(1);
  expect(links[1].target.roundNumber).toEqual(2);
  expect(links[1].target.roundNumber).toEqual(2);
  expect(links[2].source.roundNumber).toEqual(3);
  expect(links[2].target.roundNumber).toEqual(4);
  expect(links[3].source.roundNumber).toEqual(4);
  expect(links[3].target.roundNumber).toEqual(6);
});

it('can generate FEED_IN_CHAMPIONSHIP with drawSize: 32', () => {
  const drawSize = 32;
  const { consolationMatchUps, mainDrawMatchUps, drawDefinition, links } = feedInChampionship({
    drawType: FEED_IN_CHAMPIONSHIP,
    drawSize,
  });

  expect(mainDrawMatchUps.length).toEqual(drawSize - 1);
  expect(consolationMatchUps.length).toEqual(drawSize - 2);

  expect(links.length).toEqual(5);
  expect(links[0].linkType).toEqual(LOSER);
  expect(links[0].target.feedProfile).toEqual(TOP_DOWN);
  expect(links[1].linkType).toEqual(LOSER);
  expect(links[1].target.feedProfile).toEqual(BOTTOM_UP);
  expect(links[2].linkType).toEqual(LOSER);
  expect(links[2].target.feedProfile).toEqual(TOP_DOWN);
  expect(links[3].linkType).toEqual(LOSER);
  expect(links[3].target.feedProfile).toEqual(BOTTOM_UP);
  expect(links[4].linkType).toEqual(LOSER);
  expect(links[4].target.feedProfile).toEqual(TOP_DOWN);

  expect(links[0].source.roundNumber).toEqual(1);
  expect(links[0].source.roundNumber).toEqual(1);
  expect(links[1].target.roundNumber).toEqual(2);
  expect(links[1].target.roundNumber).toEqual(2);
  expect(links[2].source.roundNumber).toEqual(3);
  expect(links[2].target.roundNumber).toEqual(4);
  expect(links[3].source.roundNumber).toEqual(4);
  expect(links[3].target.roundNumber).toEqual(6);
  expect(links[4].source.roundNumber).toEqual(5);
  expect(links[4].target.roundNumber).toEqual(8);

  const result = getDrawData({ drawDefinition });
  expect(result?.structures?.[0].roundMatchUps[1][0].sides[0].displaySideNumber).not.toBeUndefined();
});

it('can generate FEED_IN_CHAMPIONSHIP with drawSize: 64', () => {
  const drawSize = 64;
  const { links, mainDrawMatchUps, consolationMatchUps } = feedInChampionship({
    drawType: FEED_IN_CHAMPIONSHIP,
    drawSize,
  });

  expect(mainDrawMatchUps.length).toEqual(drawSize - 1);
  expect(consolationMatchUps.length).toEqual(drawSize - 2);

  expect(links.length).toEqual(6);
  expect(links[0].linkType).toEqual(LOSER);
  expect(links[0].target.feedProfile).toEqual(TOP_DOWN);
  expect(links[1].linkType).toEqual(LOSER);
  expect(links[1].target.feedProfile).toEqual(BOTTOM_UP);
  expect(links[2].linkType).toEqual(LOSER);
  expect(links[2].target.feedProfile).toEqual(TOP_DOWN);
  expect(links[3].linkType).toEqual(LOSER);
  expect(links[3].target.feedProfile).toEqual(BOTTOM_UP);
  expect(links[4].linkType).toEqual(LOSER);
  expect(links[4].target.feedProfile).toEqual(TOP_DOWN);
  expect(links[5].linkType).toEqual(LOSER);
  expect(links[5].target.feedProfile).toEqual(BOTTOM_UP);

  expect(links[0].source.roundNumber).toEqual(1);
  expect(links[0].source.roundNumber).toEqual(1);
  expect(links[1].target.roundNumber).toEqual(2);
  expect(links[1].target.roundNumber).toEqual(2);
  expect(links[2].source.roundNumber).toEqual(3);
  expect(links[2].target.roundNumber).toEqual(4);
  expect(links[3].source.roundNumber).toEqual(4);
  expect(links[3].target.roundNumber).toEqual(6);
  expect(links[4].source.roundNumber).toEqual(5);
  expect(links[4].target.roundNumber).toEqual(8);
  expect(links[5].source.roundNumber).toEqual(6);
  expect(links[5].target.roundNumber).toEqual(10);
});

it('can generate FEED_IN_CHAMPIONSHIP_TO_R16', () => {
  const { links, mainDrawMatchUps, consolationMatchUps } = feedInChampionship({
    drawType: FICR16,
    drawSize: 32,
  });

  expect(mainDrawMatchUps.length).toEqual(31);
  expect(consolationMatchUps.length).toEqual(23);
  expect(links.length).toEqual(2);
});

it('can generate FEED_IN_CHAMPIONSHIP to RSF', () => {
  const { links, mainDrawMatchUps, consolationMatchUps } = feedInChampionship({
    drawType: FICSF,
    drawSize: 32,
  });

  expect(mainDrawMatchUps.length).toEqual(31);
  expect(consolationMatchUps.length).toEqual(29);
  expect(links.length).toEqual(4);
});

it('can generate MODIFIED_FEED_IN_CHAMPIONSHIP', () => {
  const { links, mainDrawMatchUps, consolationMatchUps } = feedInChampionship({
    feedPolicy: { roundGroupedOrder: [] },
    drawType: MFIC,
    drawSize: 32,
  });
  expect(mainDrawMatchUps.length).toEqual(31);
  expect(consolationMatchUps.length).toEqual(23);
  expect(links.length).toEqual(2);
  expect(links[0].target.feedProfile).toEqual(TOP_DOWN);
  expect(links[1].target.feedProfile).toEqual(BOTTOM_UP);
  expect(links[0].target.roundNumber).toEqual(1);
  expect(links[1].target.roundNumber).toEqual(2);

  expect(mainDrawMatchUps.length).toEqual(31);
  expect(consolationMatchUps.length).toEqual(23);

  expect(mainDrawMatchUps[0].finishingPositionRange.loser).toMatchObject([17, 32]);
  expect(mainDrawMatchUps[0].finishingPositionRange.winner).toMatchObject([1, 16]);
  expect(consolationMatchUps[0].finishingPositionRange.loser).toMatchObject([25, 32]);
  expect(consolationMatchUps[0].finishingPositionRange.winner).toMatchObject([9, 24]);

  expect(mainDrawMatchUps[30].finishingPositionRange.loser).toMatchObject([2, 2]);
  expect(mainDrawMatchUps[30].finishingPositionRange.winner).toMatchObject([1, 1]);
  expect(consolationMatchUps[22].finishingPositionRange.loser).toMatchObject([10, 10]);
  expect(consolationMatchUps[22].finishingPositionRange.winner).toMatchObject([9, 9]);
});

it('can generate feedInMatchUps', () => {
  verifyexpectedRoundMatchUpsCounts({
    expectedRoundMatchUpsCounts: [8, 4, 2, 2, 1],
    feedRoundsProfile: [2],
    baseDrawSize: 16,
  });

  verifyexpectedRoundMatchUpsCounts({
    expectedRoundMatchUpsCounts: [8, 4, 2, 2, 2, 1],
    feedRoundsProfile: [2, 2],
    baseDrawSize: 16,
  });

  verifyexpectedRoundMatchUpsCounts({
    expectedRoundMatchUpsCounts: [16, 8, 8, 8, 4, 2, 2, 2, 1],
    feedRoundsProfile: [8, 8, 2, 2],
    baseDrawSize: 32,
  });
});

function verifyexpectedRoundMatchUpsCounts({ expectedRoundMatchUpsCounts, feedRoundsProfile, baseDrawSize }) {
  const { matchUps, roundsCount } = feedInMatchUps({
    feedRoundsProfile,
    baseDrawSize,
  });
  const { roundMatchUps } = getRoundMatchUps({ matchUps });
  generateRange(1, roundsCount + 1).forEach((roundNumber) => {
    expect(roundMatchUps?.[roundNumber].length).toEqual(expectedRoundMatchUpsCounts[roundNumber - 1]);
  });
}
