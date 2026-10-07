import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

it('a structure with no round profile has no playoff rounds and does not throw', () => {
  const drawId = 'did';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawId, drawSize: 16 }] });
  const structure = tournamentRecord.events[0].drawDefinitions[0].structures[0];
  const { structureId } = structure;
  // a malformed matchUp (more than two drawPositions) leaves the structure without a round profile
  structure.matchUps.find((matchUp) => matchUp.roundNumber === 4).drawPositions = [1, 2, 3];
  tournamentEngine.setState(tournamentRecord);

  let result: any = tournamentEngine.getAvailablePlayoffProfiles({ drawId, structureId });
  expect(result.error).toBeUndefined();
  expect(result.playoffRounds).toEqual([]);
  expect(result.playoffRoundsRanges).toEqual([]);

  result = tournamentEngine.addPlayoffStructures({ drawId, structureId, playoffPositions: [3, 4] });
  expect(result.error).toEqual(INVALID_VALUES);
});
