import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getDrawPositionWinCount } from '@Query/matchUp/getDrawPositionWinCount';
import { teamLevelMatchUps } from '@Acquire/teamLevelMatchUps';
import { matchUpsOf } from '@Acquire/structureMembers';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants and types
import { SINGLES_MATCHUP, TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import type { HydratedMatchUp } from '@Types/hydrated';

// constants
import { MISSING_STRUCTURE } from '@Constants/errorConditionConstants';

test('in context, a TEAM draw reads as its TEAM matchUps: the rubbers sharing their round are left out', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: DOMINANT_DUO, eventType: TEAM_EVENT, drawSize: 4 }],
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
    drawProfiles: [{ tieFormatName: DOMINANT_DUO, eventType: TEAM_EVENT, drawSize: 4 }],
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

test('a counting predicate takes only a TEAM-level list: a list straight from a getter does not compile', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: DOMINANT_DUO, eventType: TEAM_EVENT, drawSize: 4 }],
    setState: true,
  });
  const matchUps: HydratedMatchUp[] = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;

  // the brand is the enforcement: if it stops rejecting a raw list, this directive is unused and type-checking fails
  // @ts-expect-error a tie-inclusive list is not TeamLevel
  expect(getDrawPositionWinCount({ sourceMatchUps: matchUps, drawPosition: 1 })).toEqual(0);
  expect(getDrawPositionWinCount({ sourceMatchUps: teamLevelMatchUps(matchUps), drawPosition: 1 })).toEqual(0);
});

test('the structure getter stays tie-inclusive in raw and contextual modes', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    nonRandom: 1,
    drawProfiles: [{ tieFormatName: DOMINANT_DUO, eventType: TEAM_EVENT, drawSize: 4 }],
    setState: true,
  });
  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];
  const stored = matchUpsOf(structure) ?? [];
  const expectedIds = stored
    .flatMap((matchUp) => [matchUp.matchUpId, ...(matchUp.tieMatchUps ?? []).map((tie) => tie.matchUpId)])
    .sort();
  for (const inContext of [false, true]) {
    const result = getAllStructureMatchUps({ structure, drawDefinition, tournamentRecord, event, inContext });
    expect(result.matchUps.map((matchUp) => matchUp.matchUpId).sort()).toEqual(expectedIds);
    expect(result.matchUps.some((matchUp) => !!matchUp.collectionId)).toBe(true);
    expect(
      teamLevelMatchUps(result.matchUps)
        .map((matchUp) => matchUp.matchUpId)
        .sort(),
    ).toEqual(stored.map((matchUp) => matchUp.matchUpId).sort());
  }
});

test('the structure getter keeps empty result collections on refusal', () => {
  const result = getAllStructureMatchUps({});
  expect(result.error).toEqual(MISSING_STRUCTURE);
  expect(result.matchUps).toEqual([]);
  expect(result.roundMatchUps).toEqual({});
  expect(result.collectionPositionMatchUps).toEqual({});
});
