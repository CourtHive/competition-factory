import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../../..';
import { expect, test } from 'vitest';

// constants and fixtures
import { COLLEGE_JUCO, DOMINANT_DUO, LAVER_CUP } from '@Constants/tieFormatConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { tieFormats } from '@Fixtures/scoring/tieFormats';
import { TEAM } from '@Constants/eventConstants';

// prettier-ignore
const scenarios = [
  {
    mockProfile: { eventProfiles: [{ eventType: TEAM, tieFormatName: COLLEGE_JUCO, drawProfiles: [{ drawSize: 2}] }]},
    expectation: { event: tieFormats.COLLEGE_JUCO }
  },
  {
    mockProfile: { eventProfiles: [{ eventType: TEAM, tieFormatName: LAVER_CUP, drawProfiles: [{ drawSize: 2}] }]},
    expectation: { event: tieFormats.LAVER_CUP }
  },
  {
    mockProfile: { drawProfiles: [{ eventType: TEAM, tieFormatName: COLLEGE_JUCO, drawSize: 2 }]},
    // expecting it to be on draw since NOT equivalent in scope to event (because UUIDs are different - see tieFormatDefaults.js)
    expectation: { draw: tieFormats.COLLEGE_JUCO, event: tieFormats.COLLEGE_JUCO }
  },
  {
    mockProfile: { drawProfiles: [{ eventType: TEAM, tieFormatName: DOMINANT_DUO, drawSize: 8, drawType: COMPASS }]},
    // not expecting it to be on draw since equivalent in scope to event
    expectation: { event: tieFormats.DOMINANT_DUO }
  },
];

const doublesMatchUpFormat = (tieFormat) =>
  tieFormat?.collectionDefinitions?.find((c) => c.matchUpType === DOUBLES)?.matchUpFormat;
const singlesMatchUpFormat = (tieFormat) =>
  tieFormat?.collectionDefinitions?.find((c) => c.matchUpType === SINGLES)?.matchUpFormat;

test.each(scenarios)('can pass tieFormatName in eventProfiles and drawProfiles', (scenario: any) => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord(scenario.mockProfile);

  tournamentEngine.setState(tournamentRecord);

  const { structureDefaultTieFormat, eventDefaultTieFormat, drawDefaultTieFormat, tieFormat } =
    tournamentEngine.getTieFormat({ drawId });

  expect(tieFormat).not.toBeUndefined();
  expect(!!structureDefaultTieFormat).toEqual(!!scenario.expectation.structure);
  expect(!!eventDefaultTieFormat).toEqual(!!scenario.expectation.event);
  expect(!!drawDefaultTieFormat).toEqual(false);

  if (scenario.expectation.draw) {
    expect(singlesMatchUpFormat(tieFormat)).toEqual(singlesMatchUpFormat(scenario.expectation.draw));
    expect(doublesMatchUpFormat(tieFormat)).toEqual(doublesMatchUpFormat(scenario.expectation.draw));
  }
  if (scenario.expectation.event) {
    expect(singlesMatchUpFormat(tieFormat)).toEqual(singlesMatchUpFormat(scenario.expectation.event));
    expect(doublesMatchUpFormat(tieFormat)).toEqual(doublesMatchUpFormat(scenario.expectation.event));
  }
});
