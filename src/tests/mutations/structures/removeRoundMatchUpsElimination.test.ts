import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_STRUCTURE, NOT_IMPLEMENTED } from '@Constants/errorConditionConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

it.each([
  { drawSize: 16, error: NOT_IMPLEMENTED, context: { roundNumber: 1 } },
  { drawSize: 16, drawType: ROUND_ROBIN, error: INVALID_STRUCTURE }, // a container was already refused
])('refuses to remove a round from a structure that is not AD_HOC: $drawType', ({ error, context, ...drawProfile }) => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile] });
  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;
  const before = tournamentEngine.allDrawMatchUps({ drawId }).matchUps.length;

  const result: any = tournamentEngine.removeRoundMatchUps({ drawId, structureId, roundNumber: 1 });
  expect(result.success).toBeUndefined();
  expect(result.error).toEqual(error);
  if (context) expect(result.context).toEqual({ structureId, ...context });

  expect(tournamentEngine.allDrawMatchUps({ drawId }).matchUps.length).toEqual(before);
});
