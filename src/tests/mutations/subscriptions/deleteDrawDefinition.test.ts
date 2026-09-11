import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// Constants
import { DRAW_DEFINITION_NOT_FOUND } from '@Constants/errorConditionConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { AUDIT, DELETED_MATCHUP_IDS } from '@Constants/topicConstants';

it('can notify subscriber when drawDefinitions are deleted', () => {
  const drawProfiles = [
    {
      drawSize: 32,
      participantsCount: 30,
      drawType: SINGLE_ELIMINATION,
    },
  ];
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    inContext: true,
  });

  const auditTrail: any[] = [];
  let notificationCounter = 0;
  const subscriptions = {
    [AUDIT]: (trail) => {
      auditTrail.push(trail);
    },
    [DELETED_MATCHUP_IDS]: (notices) => {
      notificationCounter += 1;
      expect(notices.length).toEqual(1);
      expect(notices[0].matchUpIds.length).toEqual(31);
    },
  };
  let result = setSubscriptions({ subscriptions });
  expect(result.success).toEqual(true);

  tournamentEngine.setState(tournamentRecord);

  const auditData = { userId: 'user123', reason: 'I wanted to' };

  result = tournamentEngine.deleteDrawDefinitions({
    drawIds: [],
    auditData,
  });
  expect(result.error).toEqual(DRAW_DEFINITION_NOT_FOUND);

  result = tournamentEngine.deleteDrawDefinitions({
    auditData,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.deleteDrawDefinitions({
    drawIds: [drawId],
    auditData,
    eventId,
  });
  expect(result.success).toEqual(true);

  expect(notificationCounter).toEqual(1);
  expect(auditTrail.flat(Infinity)[0].detail[0].payload.auditData).toEqual(auditData);

  const { event } = tournamentEngine.getEvent({ eventId });
  // because there is an AUDIT topic no deletedDrawDefinitions extension is added — only the generated
  // FLIGHT_PROFILE remains (first-class in NATIVE, an extension in LEGACY)
  expect(firstClassOrExtension({ element: event, attribute: 'flightProfile', name: 'flightProfile' })).toBeDefined();
  expect(event.extensions?.some(({ name }) => name === 'deletedDrawDefinitions')).toBeFalsy();

  // now test structureReports
  const { eventStructureReports } = tournamentEngine.getStructureReports();
  const eventReport = eventStructureReports.find((e) => e.eventId === eventId);
  expect(eventReport.totalPositionManipulations).toEqual(0);
  expect(eventReport.generatedDrawsCount).toEqual(0);
  // drawDeletionsCount is found in event timeItems when no extension is present
  expect(eventReport.drawDeletionsCount).toEqual(1);
});
