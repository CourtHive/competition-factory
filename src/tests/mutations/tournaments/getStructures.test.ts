import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import {
  COMPASS,
  CONSOLATION,
  CURTIS_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  MAIN,
  PLAY_OFF,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
} from '@Constants/drawDefinitionConstants';

it('can extract and collate event and tournament structures', () => {
  const eventProfiles = [
    {
      eventId: 'event1',
      drawProfiles: [
        { drawSize: 16, drawType: ROUND_ROBIN_WITH_PLAYOFF },
        { drawType: COMPASS, drawSize: 32 },
      ],
      expectation: { structuresCount: 10, stageStructures: [MAIN, PLAY_OFF] },
    },
    {
      eventId: 'event2',
      drawProfiles: [{ drawSize: 16 }, { drawType: COMPASS, drawSize: 32 }],
      expectation: { structuresCount: 9, stageStructures: [MAIN, PLAY_OFF] },
    },
    {
      eventId: 'event3',
      drawProfiles: [
        { drawSize: 16, drawType: ROUND_ROBIN },
        { drawType: FEED_IN_CHAMPIONSHIP, drawSize: 32 },
      ],
      expectation: { structuresCount: 3, stageStructures: [MAIN, CONSOLATION] },
    },
    {
      eventId: 'event4',
      drawProfiles: [
        { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
        { drawType: CURTIS_CONSOLATION, drawSize: 64 },
      ],
      expectation: {
        structuresCount: 6,
        stageStructures: [MAIN, CONSOLATION, PLAY_OFF],
      },
    },
  ];

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    eventProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  let totalStructuresCount = 0;
  for (const eventProfile of eventProfiles) {
    const { structures, stageStructures } = tournamentEngine.getEventStructures({
      eventId: eventProfile.eventId,
      withStageGrouping: true,
    });
    expect(structures.length).toEqual(eventProfile.expectation.structuresCount);
    expect(Object.keys(stageStructures)).toEqual(eventProfile.expectation.stageStructures);
    totalStructuresCount += structures.length;
  }

  const { structures, stageStructures } = tournamentEngine.getTournamentStructures({ withStageGrouping: true });

  expect(structures.length).toEqual(totalStructuresCount);
  expect(Object.keys(stageStructures)).toEqual(['MAIN', 'PLAY_OFF', 'CONSOLATION']);
});
