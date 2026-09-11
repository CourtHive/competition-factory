import { unlinkTournament } from '@Mutate/tournaments/tournamentLinks';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import competitionEngineSync from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { intersection } from '@Tools/arrays';
import { expect, test } from 'vitest';

import { LINKED_TOURNAMENTS } from '@Constants/extensionConstants';
import { FactoryEngine } from '@Types/factoryTypes';
import {
  INVALID_VALUES,
  MISSING_TOURNAMENT_ID,
  MISSING_TOURNAMENT_RECORD,
  MISSING_TOURNAMENT_RECORDS,
} from '@Constants/errorConditionConstants';

test('unlinkTournament coverage', () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let result: any = unlinkTournament({});
  expect(result.error).not.toBeUndefined();
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  result = unlinkTournament({ tournamentRecords: 'bogus' });
  expect(result.error).toEqual(INVALID_VALUES);
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  result = unlinkTournament({ tournamentRecords: {} });
  expect(result.error).toEqual(MISSING_TOURNAMENT_ID);
  result = unlinkTournament({ tournamentRecords: {}, tournamentId: 'bogus' });
  expect(result.error).toEqual(MISSING_TOURNAMENT_ID);
  result = unlinkTournament({
    tournamentRecords: { ['tournamentId']: { tournamentId: 'tournamentId' } },
    tournamentId: 'tournamentId',
  });
  expect(result.success).toEqual(true);
});

test('throws appropriate errors', () => {
  let result = competitionEngineSync.unlinkTournament({
    tournamentId: 'bogusId',
  });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);

  result = competitionEngineSync.linkTournaments();
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);
});

test.each([competitionEngineSync])(
  'can link and unlink tournamentRecords loaded into competitionEngine',
  async (competitionEngine) => {
    const { tournamentRecord: firstRecord } = mocksEngine.generateTournamentRecord();
    await competitionEngine.setState(firstRecord);

    let result = await competitionEngine.linkTournaments();
    expect(result.success).toEqual(true);

    const { tournamentRecord: secondRecord } = mocksEngine.generateTournamentRecord();
    await competitionEngine.setState([firstRecord, secondRecord]);

    // two tournamentRecords are in competitionEngine state... now link them
    result = await competitionEngine.linkTournaments();
    expect(result.success).toEqual(true);

    let { tournamentIds } = await getLinkedIds(competitionEngine);
    expect(tournamentIds.length).toEqual(2);
    await checkExtensions({ tournamentIds, competitionEngine });

    const { tournamentRecord: thirdRecord } = mocksEngine.generateTournamentRecord();
    competitionEngine.setTournamentRecord(thirdRecord);

    result = await competitionEngine.linkTournaments();
    expect(result.success).toEqual(true);

    ({ tournamentIds } = await getLinkedIds(competitionEngine));
    expect(tournamentIds.length).toEqual(3);
    await checkExtensions({ tournamentIds, competitionEngine });

    const { linkedTournamentIds } = await competitionEngine.getLinkedTournamentIds();

    const keys = Object.keys(linkedTournamentIds);
    expect(intersection(keys, tournamentIds).length).toEqual(3);
    keys.forEach((tournamentId) => {
      expect(intersection([tournamentId], linkedTournamentIds[tournamentId]).length).toEqual(0);
    });

    const tournamentId = tournamentIds.pop();
    result = await competitionEngine.unlinkTournament({ tournamentId });
    expect(result.success).toEqual(true);
    expect(tournamentIds.length).toEqual(2);
    await checkExtensions({
      unlinkedTournamentIds: [tournamentId],
      competitionEngine,
      tournamentIds,
    });

    result = await competitionEngine.unlinkTournament({ tournamentId });
    expect(result.success).toEqual(true);

    result = await competitionEngine.unlinkTournament({
      tournamentId: 'bogusId',
    });
    expect([MISSING_TOURNAMENT_ID, MISSING_TOURNAMENT_RECORD].includes(result.error)).toEqual(true);

    result = await competitionEngine.unlinkTournaments();
    expect(result.success).toEqual(true);
    await checkExtensions({
      unlinkedTournamentIds: [...tournamentIds, tournamentId],
      competitionEngine,
    });
  },
);

test.each([competitionEngineSync])(
  'can purge unliked tournamentRecords from competitionEngine state',
  async (competitionEngine) => {
    competitionEngine.reset();
    const { tournamentRecord: firstRecord } = mocksEngine.generateTournamentRecord();
    const { tournamentRecord: secondRecord } = mocksEngine.generateTournamentRecord();
    await competitionEngine.setState([firstRecord, secondRecord]);

    await competitionEngine.linkTournaments();
    const { tournamentRecord: thirdRecord } = mocksEngine.generateTournamentRecord();
    competitionEngine.setTournamentRecord(thirdRecord);

    let { tournamentRecords } = await competitionEngine.getState();
    expect(Object.keys(tournamentRecords).length).toEqual(3);

    await competitionEngine.removeUnlinkedTournamentRecords();

    ({ tournamentRecords } = await competitionEngine.getState());
    expect(Object.keys(tournamentRecords).length).toEqual(2);
  },
);

test.each([competitionEngineSync])(
  'will properly hydrate all competition matchUps with persons',
  async (competitionEngine) => {
    competitionEngine.reset();
    const drawProfiles = [{ drawSize: 8 }];
    const { tournamentRecord: firstRecord } = mocksEngine.generateTournamentRecord({ drawProfiles });
    const { tournamentRecord: secondRecord } = mocksEngine.generateTournamentRecord({ drawProfiles });
    await competitionEngine.setState([firstRecord, secondRecord]);
    await competitionEngine.linkTournaments();

    const { upcomingMatchUps } = await competitionEngine.getCompetitionMatchUps();

    upcomingMatchUps.forEach(({ sides }) =>
      sides.forEach((side) => {
        expect(side.participant.person).not.toBeUndefined();
      }),
    );
  },
);

test.each([competitionEngineSync])('can set a single tournamentRecord', async (competitionEngine) => {
  competitionEngine.reset();
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  let result = await competitionEngine.setTournamentRecord(tournamentRecord);
  expect(result.success).toEqual(true);
  result = await competitionEngine.linkTournaments();
  expect(result.success).toEqual(true);
});

// linkedTournamentIds is first-class `string[]` in NATIVE, a `{ tournamentIds }` extension in LEGACY
function readLinkedIds(tournamentRecord) {
  const linked = firstClassOrExtension({
    element: tournamentRecord,
    attribute: 'linkedTournamentIds',
    name: LINKED_TOURNAMENTS,
  });
  return Array.isArray(linked) ? linked : linked?.tournamentIds;
}

async function getLinkedIds(competitionEngine) {
  const { tournamentRecords } = await competitionEngine.getState();
  const tournamentIds = readLinkedIds(Object.values(tournamentRecords)[0]);
  return { tournamentIds };
}

type CheckExtensionsArgs = {
  unlinkedTournamentIds?: string[];
  competitionEngine: FactoryEngine;
  tournamentIds?: string[];
};
async function checkExtensions({ unlinkedTournamentIds, competitionEngine, tournamentIds }: CheckExtensionsArgs) {
  const { tournamentRecords } = await competitionEngine.getState();
  Object.keys(tournamentRecords).forEach((tournamentId) => {
    const tournamentRecord = tournamentRecords[tournamentId];
    const linkedIds = readLinkedIds(tournamentRecord);
    if (unlinkedTournamentIds?.includes(tournamentId)) {
      // unlinked tournaments carry no link (first-class removed / extension gone)
      expect(linkedIds).toBeUndefined();
    } else {
      expect(linkedIds).toEqual(tournamentIds);
    }
  });
}
