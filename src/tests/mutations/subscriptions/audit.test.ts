import { setSubscriptions } from '@Global/state/globalState';
import { findExtension } from '@Acquire/findExtension';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DELETE_DRAW_DEFINITIONS } from '@Constants/auditConstants';
import { DRAW_DELETIONS } from '@Constants/extensionConstants';
import { AUDIT } from '@Constants/topicConstants';

it('when no audit topic is found will add draw deletions extension', () => {
  const drawProfiles = [
    {
      participantsCount: 30,
      drawSize: 32,
    },
  ];
  const {
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  const result = tournamentEngine.deleteDrawDefinitions({
    drawIds: [drawId],
    eventId,
  });
  expect(result.success).toEqual(true);

  const { event } = tournamentEngine.getEvent({ drawId });
  const { extension } = findExtension({
    name: DRAW_DELETIONS,
    element: event,
  });
  expect(extension?.value?.length).toEqual(1);
  expect(extension?.value[0].deletedDrawsDetail[0].positionAssignments).not.toBeUndefined();

  // now test structureReports
  const { eventStructureReports } = tournamentEngine.getStructureReports();
  const eventReport = eventStructureReports.find((e) => e.eventId === eventId);
  expect(eventReport.totalPositionManipulations).toEqual(0);
  expect(eventReport.generatedDrawsCount).toEqual(0);
  expect(eventReport.drawDeletionsCount).toEqual(1);
});
it('can notify subscriber when audit information is added', () => {
  const drawProfiles = [
    {
      participantsCount: 30,
      drawSize: 32,
    },
  ];
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  let notificationsCounter = 0;
  const subscriptions = {
    [AUDIT]: (notices) => {
      notificationsCounter += 1;
      expect(notices.length).toEqual(1);
      expect(notices[0].detail[0].action).toEqual(DELETE_DRAW_DEFINITIONS);
      expect(notices[0].detail[0].payload.drawDefinitions).not.toBeUndefined();
    },
  };
  let result = setSubscriptions({ subscriptions });
  expect(result.success).toEqual(true);
  tournamentEngine.setState(tournamentRecord);

  result = tournamentEngine.deleteDrawDefinitions({
    drawIds: [drawId],
    eventId,
  });
  expect(result.success).toEqual(true);

  expect(notificationsCounter).toEqual(1);

  // now test structureReports
  const { eventStructureReports } = tournamentEngine.getStructureReports();
  const eventReport = eventStructureReports.find((e) => e.eventId === eventId);
  expect(eventReport.totalPositionManipulations).toEqual(0);
  expect(eventReport.generatedDrawsCount).toEqual(0);
});

it('subscriptions can be removed by providing a non-function value', () => {
  const drawProfiles = [
    {
      participantsCount: 30,
      drawSize: 32,
    },
  ];
  const {
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  let result = setSubscriptions({ subscriptions: { [AUDIT]: true } });
  expect(result.success).toEqual(true);
  result = tournamentEngine.deleteDrawDefinitions({
    drawIds: [drawId],
    eventId,
  });
  expect(result.success).toEqual(true);

  const { event } = tournamentEngine.getEvent({ drawId });
  const { extension } = findExtension({
    name: DRAW_DELETIONS,
    element: event,
  });
  expect(extension?.value?.length).toEqual(1);
  expect(extension?.value[0].deletedDrawsDetail[0].positionAssignments).not.toBeUndefined();

  // now test structureReports
  const { eventStructureReports } = tournamentEngine.getStructureReports();
  const eventReport = eventStructureReports.find((e) => e.eventId === eventId);
  expect(eventReport.totalPositionManipulations).toEqual(0);
  expect(eventReport.generatedDrawsCount).toEqual(0);
  expect(eventReport.drawDeletionsCount).toEqual(1);
});
