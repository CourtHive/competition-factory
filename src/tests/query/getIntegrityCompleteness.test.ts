import { getDrawCompleteness } from '@Query/drawDefinition/getDrawCompleteness';
import { getEventCompleteness } from '@Query/event/getEventCompleteness';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Tests/engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

test('a fully-completed tournament is complete at draw, event, and tournament layers', () => {
  setSubscriptions({});
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'cc', drawSize: 8, drawType: SINGLE_ELIMINATION }],
    completeAllMatchUps: true,
    setState: true,
  });
  const event = tournamentRecord.events[0];
  const drawDefinition = event.drawDefinitions[0];

  expect(getDrawCompleteness({ drawDefinition }).complete).toEqual(true);
  expect(getEventCompleteness({ event, tournamentRecord }).complete).toEqual(true);

  const result: any = tournamentEngine.getTournamentCompleteness();
  expect(result.complete).toEqual(true);
  expect(result.completeness.unplayedMatchUpCount).toEqual(0);
  expect(result.completeness.unassignedPositionCount).toEqual(0);
});

test('rolls up unplayed matchUp counts through event and tournament layers', () => {
  setSubscriptions({});
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'inc', drawSize: 8, drawType: SINGLE_ELIMINATION }],
    setState: true,
  });
  const event = tournamentRecord.events[0];
  const drawDefinition = event.drawDefinitions[0];

  const drawResult: any = getDrawCompleteness({ drawDefinition });
  expect(drawResult.complete).toEqual(false);
  expect(drawResult.completeness.unplayedMatchUpCount).toBeGreaterThan(0);
  expect(drawResult.completeness.drawId).toEqual('inc');

  const eventResult: any = getEventCompleteness({ event, tournamentRecord });
  expect(eventResult.completeness.unplayedMatchUpCount).toEqual(drawResult.completeness.unplayedMatchUpCount);
  expect(eventResult.completeness.byDraw).toHaveLength(1);

  const tournamentResult: any = tournamentEngine.getTournamentCompleteness();
  expect(tournamentResult.complete).toEqual(false);
  expect(tournamentResult.completeness.unplayedMatchUpCount).toEqual(drawResult.completeness.unplayedMatchUpCount);
  expect(tournamentResult.completeness.byEvent).toHaveLength(1);
});
