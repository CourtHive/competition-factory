import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING, ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

it('a populated round robin qualifying structure is kept when the main draw is generated', () => {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 36 }, setState: true });
  const { event } = tournamentEngine.addEvent({ event: { eventName: 'Test', eventType: SINGLES_EVENT } });
  const eventId = event.eventId;

  const { participants } = tournamentEngine.getParticipants();
  const participantIds = participants.map(({ participantId }) => participantId);
  tournamentEngine.addEventEntries({ participantIds: participantIds.slice(0, 28), entryStage: MAIN, eventId });
  tournamentEngine.addEventEntries({ participantIds: participantIds.slice(28), entryStage: QUALIFYING, eventId });

  const entriesOf = (entryStage: string) =>
    tournamentEngine
      .getEvent({ eventId })
      .event.entries.filter((e) => e.entryStage === entryStage && e.entryStatus === DIRECT_ACCEPTANCE);

  let result: any = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [
      {
        structureProfiles: [{ qualifyingPositions: 4, drawSize: 8, drawType: ROUND_ROBIN, stageSequence: 1 }],
      },
    ],
    drawEntries: entriesOf(QUALIFYING),
    ignoreStageSpace: true,
    qualifyingOnly: true,
    automated: true,
    eventId,
  });
  expect(result.success).toEqual(true);
  const drawId = result.drawDefinition.drawId;
  tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition });

  const qualifyingBefore = tournamentEngine
    .getEvent({ drawId })
    .drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  const groupMatchUpIds = qualifyingBefore.structures.flatMap((group) => group.matchUps).map((m) => m.matchUpId);
  expect(groupMatchUpIds.length).toBeGreaterThan(0);

  result = tournamentEngine.generateDrawDefinition({
    drawEntries: entriesOf(MAIN),
    drawType: SINGLE_ELIMINATION,
    qualifyingPlaceholder: true,
    ignoreStageSpace: true,
    qualifiersCount: 4,
    automated: true,
    drawSize: 32,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { drawDefinition } = result;
  const qualifyingAfter = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  expect(qualifyingAfter?.structureId).toEqual(qualifyingBefore.structureId);
  expect(qualifyingAfter.structures.flatMap((group) => group.matchUps).map((m) => m.matchUpId)).toEqual(
    groupMatchUpIds,
  );

  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  expect(mainStructure.matchUps.length).toEqual(31);
  expect(drawDefinition.links.some(({ source }) => source.structureId === qualifyingBefore.structureId)).toEqual(true);
});
