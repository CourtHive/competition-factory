import tournamentEngine from '@Engines/syncEngine';
import * as tools from '@Assemblies/tools';
import { mocksEngine } from '../../../..';
import { expect, it } from 'vitest';

import { COMPLETED, TO_BE_PLAYED, upcomingMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

it('generates valid DOUBLE_ELIMINATION', () => {
  const drawSize = 32;
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, drawType: DOUBLE_ELIMINATION }],
  });

  const result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const matchUpsCount = matchUps.length;

  expect(tools.unique(matchUps.map((m) => m.matchUpStatus))).toEqual([TO_BE_PLAYED]);

  matchUps = tournamentEngine.allCompetitionMatchUps({
    matchUpFilters: { matchUpStatuses: upcomingMatchUpStatuses },
    nextMatchUps: true,
  }).matchUps;

  expect(matchUps.length).toEqual(matchUpsCount);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { structures, links } = drawDefinition;
  // useful for logging out ids of each structure
  const structureMap = structures.map(({ structureName, structureId }) => ({
    [structureName]: structureId,
  }));
  expect(structureMap.length).toEqual(3);

  let power = 1;
  let ds = drawSize;
  while (ds > 2) {
    ds = ds / 2;
    power += 1;
  }
  expect(power + 3).toEqual(links.length);
});

it('mocksEngine can complete DOUBLE_ELIMINATION matchUps', () => {
  const drawSize = 32;
  const result = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, drawType: DOUBLE_ELIMINATION }],
    completeAllMatchUps: true,
  });
  expect(result.success).toEqual(true);

  tournamentEngine.setState(result.tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const toPlayMatchUps = matchUps.filter(({ matchUpStatus }) => matchUpStatus === TO_BE_PLAYED);

  // Multi-pass completion handles cross-structure advancement.
  // At most 1 matchUp may remain: the Decider, which only plays
  // when the undefeated finalist loses the championship match.
  // If the undefeated player won, the decider is unnecessary (TBD opponent).
  expect(toPlayMatchUps.length).toEqual(0);
  if (toPlayMatchUps.length === 1) {
    expect(toPlayMatchUps[0].roundName).toEqual('P-Final');
  }

  // The main Final should always be completed
  const mainFinal = matchUps.find((m) => m.structureName === 'Main' && m.abbreviatedRoundName === 'F');
  expect(mainFinal?.matchUpStatus).toEqual(COMPLETED);
});
