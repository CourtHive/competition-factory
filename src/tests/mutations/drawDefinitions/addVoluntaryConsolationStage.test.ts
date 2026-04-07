import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';

it('returns error when drawDefinition is missing', () => {
  const result = tournamentEngine.addVoluntaryConsolationStage({
    drawSize: 16,
  });
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
});

it('can add a voluntary consolation stage to a draw definition', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const result = tournamentEngine.addVoluntaryConsolationStage({
    drawSize: 16,
    drawId,
  });
  expect(result.success).toEqual(true);
});

it('can add voluntary consolation with different draw sizes', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const result = tournamentEngine.addVoluntaryConsolationStage({
    drawSize: 8,
    drawId,
  });
  expect(result.success).toEqual(true);
});

it('can call addVoluntaryConsolationStage multiple times', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  let result = tournamentEngine.addVoluntaryConsolationStage({
    drawSize: 16,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addVoluntaryConsolationStage({
    drawSize: 8,
    drawId,
  });
  expect(result.success).toEqual(true);
});
