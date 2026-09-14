import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngineAsync from '@Engines/asyncEngine';
import tournamentEngineSync from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { instanceCount } from '@Tools/arrays';
import { expect, test } from 'vitest';

// constants
import { FEED_IN_CHAMPIONSHIP_TO_R16, MAIN } from '@Constants/drawDefinitionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

function getLoserMatchUpIdRounds(matchUps) {
  const matchUpsWithLoserMatchUpIds = matchUps.filter(({ loserMatchUpId }) => loserMatchUpId);
  const matchUpRounds = instanceCount(matchUpsWithLoserMatchUpIds.map(({ roundNumber }) => roundNumber));
  return Object.values(matchUpRounds);
}

test.each([tournamentEngineSync, tournamentEngineAsync])(
  'generates loserMatchUpIds for playoff structures',
  async (tournamentEngine) => {
    const withPlayoffs = {
      roundProfiles: [{ 3: 1 }, { 4: 1 }],
      playoffAttributes: {
        '0-3': { name: 'Silver', abbreviation: 'S' },
        '0-4': { name: 'Gold', abbreviation: 'G' },
      },
    };
    const drawProfiles = [
      {
        drawType: FEED_IN_CHAMPIONSHIP_TO_R16,
        withPlayoffs,
        drawSize: 32,
      },
    ];
    const mockProfile = { drawProfiles };

    let result = mocksEngine.generateTournamentRecord(mockProfile);
    const { tournamentRecord } = result;

    await tournamentEngine.setState(tournamentRecord);

    result = await tournamentEngine.allTournamentMatchUps();

    const matchUps = result.matchUps;
    const round3MatchUps = matchUps.filter(({ roundNumber, stage }) => stage === MAIN && [3].includes(roundNumber));
    round3MatchUps.forEach(({ loserMatchUpId }) => expect(loserMatchUpId).not.toBeUndefined());

    expect(getLoserMatchUpIdRounds(matchUps)).toEqual([16, 8, 4, 2]);
  },
);

test.each([tournamentEngineSync, tournamentEngineAsync])(
  'generates loserMatchUpIds when generated playoffs are attached',
  async (tournamentEngine) => {
    let matchUpModifyNotices: any[] = [];
    const subscriptions = {
      modifyMatchUp: (payload) => {
        if (Array.isArray(payload)) {
          payload.forEach(({ matchUp }) => {
            matchUpModifyNotices.push(matchUp);
          });
        }
      },
    };

    setSubscriptions({ subscriptions });

    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32 }],
    });

    await tournamentEngine.setState(tournamentRecord);

    let result = await tournamentEngine.allTournamentMatchUps();
    let matchUps = result.matchUps;
    expect(getLoserMatchUpIdRounds(matchUps)).toEqual([]);

    const roundProfiles = [{ 3: 1 }, { 4: 1 }];
    const playoffAttributes = {
      '0-3': { name: 'Silver', abbreviation: 'S', structureId: 'sid1' },
      '0-4': { name: 'Gold', abbreviation: 'G', structureId: 'sid2' },
    };
    const {
      drawDefinition: {
        structures: [{ structureId }],
      },
    } = await tournamentEngine.getEvent({ drawId });

    result = await tournamentEngine.generateAndPopulatePlayoffStructures({
      playoffStructureNameBase: 'Playoff',
      playoffAttributes,
      roundProfiles,
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.matchUpModifications.length).toEqual(6);

    matchUpModifyNotices = [];
    result = await tournamentEngine.attachPlayoffStructures({
      drawId,
      ...result,
    });
    expect(matchUpModifyNotices.length).toEqual(6);
    expect(result.success).toEqual(true);

    result = await tournamentEngine.allTournamentMatchUps();
    matchUps = result.matchUps;
    expect(getLoserMatchUpIdRounds(matchUps)).toEqual([4, 2]);

    const withLoserMatchUpId = matchUpModifyNotices.filter(({ loserMatchUpId }) => loserMatchUpId);
    const noLoserMatchUpId = matchUpModifyNotices.filter(({ loserMatchUpId }) => !loserMatchUpId);
    expect(matchUpModifyNotices.length).toEqual(withLoserMatchUpId.length + noLoserMatchUpId.length);

    const playoffMatchUps = matchUps.filter(({ stage, roundNumber }) => stage !== MAIN && roundNumber === 1);
    // expect that the number of notices is twice the number of first round playoff matchUps
    // because there are two participants progressed for each first round playoff matchUp
    expect(matchUpModifyNotices.length).toEqual(playoffMatchUps.length * 2);

    const sanityCheckMatchUpIds = new Set(withLoserMatchUpId.map(({ matchUpId }) => matchUpId));

    result = await tournamentEngine.allTournamentMatchUps();
    matchUps = result.matchUps;
    matchUps.forEach(({ matchUpId, loserMatchUpId }) => {
      if (sanityCheckMatchUpIds.has(matchUpId)) {
        expect(loserMatchUpId).not.toBeUndefined();
      }
    });
  },
);

// test used to work through MONGO interactions in client/server scenarios
test.each([tournamentEngineSync, tournamentEngineAsync])(
  'generates appropriate notifications for team matchUps',
  async (tournamentEngine) => {
    let matchUpModifyNotices: any[] = [];
    let addMatchUpNotices: any[] = [];

    const subscriptions = {
      addMatchUps: (payload) => {
        if (Array.isArray(payload)) {
          payload.forEach(({ matchUps }) => {
            addMatchUpNotices.push(...matchUps);
          });
        }
      },
      modifyMatchUp: (payload) => {
        if (Array.isArray(payload)) {
          payload.forEach(({ matchUp }) => {
            matchUpModifyNotices.push(matchUp);
          });
        }
      },
    };

    setSubscriptions({ subscriptions });

    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32, eventType: TEAM_EVENT, tieFormatName: 'DOMINANT_DUO' }],
    });

    expect(addMatchUpNotices.length).toEqual(124);
    addMatchUpNotices = [];

    await tournamentEngine.setState(tournamentRecord);

    let result = await tournamentEngine.allTournamentMatchUps({
      inContext: false,
    });
    let matchUps = result.matchUps;
    expect(getLoserMatchUpIdRounds(matchUps)).toEqual([]);

    const roundProfiles = [{ 4: 1 }];
    const {
      drawDefinition: {
        structures: [{ structureId }],
      },
    } = await tournamentEngine.getEvent({ drawId });

    result = await tournamentEngine.generateAndPopulatePlayoffStructures({
      playoffStructureNameBase: 'Playoff',
      roundProfiles,
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.matchUpModifications.length).toEqual(2);

    matchUpModifyNotices = [];
    result = await tournamentEngine.attachPlayoffStructures({
      ...result,
      drawId,
    });
    expect(result.success).toEqual(true);

    result = await tournamentEngine.allTournamentMatchUps();
    matchUps = result.matchUps;
    expect(getLoserMatchUpIdRounds(matchUps)).toEqual([2]);

    const withLoserMatchUpId = matchUpModifyNotices.filter(({ loserMatchUpId }) => loserMatchUpId);
    const noLoserMatchUpId = matchUpModifyNotices.filter(({ loserMatchUpId }) => !loserMatchUpId);
    expect(matchUpModifyNotices.length).toEqual(withLoserMatchUpId.length + noLoserMatchUpId.length);

    const playoffMatchUps = matchUps.filter(({ stage, roundNumber }) => stage !== MAIN && roundNumber === 1);
    // DOMINANT_DUO has 3 tieMatchUps, plus 1 TEAM matchUp = 4 per
    // There are two MAIN matchUps which have been modified, feeding into one PLAY_OFF matchUp
    expect(playoffMatchUps.length).toEqual((matchUpModifyNotices.length / 2) * 4);

    const sanityCheckMatchUpIds = new Set(withLoserMatchUpId.map(({ matchUpId }) => matchUpId));

    result = await tournamentEngine.allTournamentMatchUps();
    matchUps = result.matchUps;
    matchUps.forEach(({ matchUpId, loserMatchUpId }) => {
      if (sanityCheckMatchUpIds.has(matchUpId)) {
        expect(loserMatchUpId).not.toBeUndefined();
      }
    });
  },
);
