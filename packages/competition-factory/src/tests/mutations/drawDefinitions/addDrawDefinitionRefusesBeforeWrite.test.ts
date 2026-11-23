import { makeDeepCopy } from '@Tools/makeDeepCopy';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DRAW_ID_EXISTS, SCORES_PRESENT } from '@Constants/errorConditionConstants';

const snapshot = () => makeDeepCopy(tournamentEngine.getTournament().tournamentRecord, false, true);

it('addDrawDefinition refuses an existing drawId before renaming or renumbering its flight', () => {
  mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventId: 'e1', drawProfiles: [{ drawId: 'd1', drawSize: 4 }] }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    drawName: 'Renamed Draw',
    eventId: 'e1',
    drawId: 'dX',
    drawSize: 4,
  });
  drawDefinition.drawId = 'd1';
  expect(drawDefinition.drawName).toEqual('Renamed Draw');

  const before = snapshot();
  let result: any = tournamentEngine.addDrawDefinition({ eventId: 'e1', drawDefinition });
  expect(result.error).toEqual(DRAW_ID_EXISTS);
  expect(snapshot()).toEqual(before);
});

it('addDrawDefinition refuses replacing a scored draw before writing its flight', () => {
  mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        eventId: 'e1',
        drawProfiles: [{ drawId: 'd1', drawSize: 4 }],
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    drawName: 'Renamed Draw',
    eventId: 'e1',
    drawId: 'dX',
    drawSize: 4,
  });
  drawDefinition.drawId = 'd1';

  const before = snapshot();
  let result: any = tournamentEngine.addDrawDefinition({ eventId: 'e1', drawDefinition, allowReplacement: true });
  expect(result.error).toEqual(SCORES_PRESENT);
  expect(snapshot()).toEqual(before);
});
