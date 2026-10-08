import { teamLevelMatchUps } from '@Acquire/teamLevelMatchUps';
import { matchUpsOf } from '@Acquire/structureMembers';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { SINGLES_MATCHUP, TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

test('in context, a TEAM draw reads as its TEAM matchUps: the rubbers sharing their round are left out', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: 'DOMINANT_DUO', eventType: TEAM_EVENT, drawSize: 4 }],
    setState: true,
  });
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
  const teamMatchUps = matchUps.filter((matchUp) => matchUp.matchUpType === TEAM_MATCHUP);
  const tieMatchUps = matchUps.filter((matchUp) => matchUp.matchUpTieId);

  // the hazard: three rubbers per dual, each in its dual's round
  expect(teamMatchUps).toHaveLength(3);
  expect(tieMatchUps).toHaveLength(9);
  expect(tieMatchUps.every((rubber) => rubber.collectionId)).toEqual(true);
  expect(new Set(tieMatchUps.map((rubber) => rubber.roundNumber))).toEqual(new Set([1, 2]));

  expect(teamLevelMatchUps(matchUps)).toEqual(teamMatchUps);
});

test('a raw list holds no rubbers, and reads unchanged', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: 'DOMINANT_DUO', eventType: TEAM_EVENT, drawSize: 4 }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const raw = matchUpsOf(drawDefinition.structures[0]) ?? [];
  expect(raw).toHaveLength(3);
  expect(teamLevelMatchUps(raw)).toEqual(raw);
});

test('a draw with no TEAM matchUps reads unchanged, and a missing list reads as empty', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
  expect(matchUps.every((matchUp) => matchUp.matchUpType === SINGLES_MATCHUP)).toEqual(true);
  expect(teamLevelMatchUps(matchUps)).toEqual(matchUps);
  expect(teamLevelMatchUps(undefined)).toEqual([]);
});
