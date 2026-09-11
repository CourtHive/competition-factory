// Regression: Generate Qualifying when main already exists without a
// qualifying placeholder structure (only the main structure exists; the
// link's source structureId may even point at a structure that's no longer
// in drawDefinition.structures).
//
// Prior to the fix this surfaced as one of:
//   - { code: ERR_EXISTING_STAGE } in generateDrawStructuresAndLinks
//   - { code: ERR_INVALID_DRAW_SIZE } in generateDrawStructuresAndLinks
//   - { code: ERR_NOT_FOUND_STRUCTURE, stack: ['prepareStage'] } in
//     qualifyingGeneration when generateOrGetExisting happened to succeed
// All three were the same root cause: generateOrGetExisting only routed
// to processExistingDrawDefinition when an existing QUALIFYING placeholder
// was present, so a main-only existing draw fell through to
// generateNewDrawDefinition which tried (and failed) to regenerate main.

import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';

describe('Generate Qualifying when main exists without a placeholder', () => {
  it('routes through processExistingDrawDefinition and adds a real qualifying structure', () => {
    const qualifiersCount = 16;
    const participantsCount = 100;
    let result: any = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount },
      drawProfiles: [
        {
          qualifyingPlaceholder: true,
          participantsCount: 16,
          qualifiersCount,
          drawSize: 32,
        },
      ],
    });
    expect(result.success).toEqual(true);

    const tournamentRecord = result.tournamentRecord;
    const eventId = result.eventIds[0];
    const drawId = result.drawIds[0];

    // Strip the placeholder structure — only main remains. Leave the link
    // dangling: the user's tournamentRecord has a links[] entry whose
    // source.structureId points to the deleted placeholder.
    const dd = tournamentRecord.events[0].drawDefinitions[0];
    const placeholderIds = new Set(
      dd.structures.filter((s: any) => s.stage === QUALIFYING).map((s: any) => s.structureId),
    );
    dd.structures = dd.structures.filter((s: any) => !placeholderIds.has(s.structureId));

    tournamentEngine.setState(tournamentRecord);

    let { drawDefinition } = tournamentEngine.getEvent({ drawId });
    expect(drawDefinition.structures.length).toEqual(1);
    const mainBefore = drawDefinition.structures.find((s: any) => s.stage === MAIN);
    expect(mainBefore?.positionAssignments?.filter((p: any) => p.qualifier).length).toEqual(qualifiersCount);

    // Sanity: confirm we have a dangling link to reproduce the user's shape.
    const survivingIds = new Set(drawDefinition.structures.map((s: any) => s.structureId));
    const dangling = drawDefinition.links?.filter((l: any) => !survivingIds.has(l.source.structureId)) ?? [];
    expect(dangling.length).toBeGreaterThan(0);

    // Add qualifying participants (the rest of the field).
    const { participants } = tournamentEngine.getParticipants();
    const enteredIds = new Set(tournamentEngine.getEvent({ drawId }).event.entries.map((e: any) => e.participantId));
    const qIds = participants
      .map((p: any) => p.participantId)
      .filter((id: string) => !enteredIds.has(id))
      .slice(0, 48);
    result = tournamentEngine.addEventEntries({ participantIds: qIds, entryStage: QUALIFYING, eventId });
    expect(result.success).toEqual(true);

    // Mirror TMX's configureDrawOptions for `isQualifying`: no top-level
    // drawSize / drawType, only nested inside the structureProfile.
    const drawEntries = tournamentEngine
      .getEvent({ drawId })
      .event.entries.filter((e: any) => e.entryStage === QUALIFYING);

    result = tournamentEngine.generateDrawDefinition({
      drawEntries,
      qualifyingProfiles: [
        {
          structureProfiles: [
            {
              qualifyingPositions: qualifiersCount,
              drawSize: 48,
              drawType: 'SINGLE_ELIMINATION',
              seedsCount: 16,
              structureName: 'Qualifying',
              matchUpFormat: 'SET3-S:6/TB7',
            },
          ],
        },
      ],
      drawName: 'Draw 1',
      ignoreStageSpace: true,
      automated: true,
      eventId,
      drawId,
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toEqual(true);

    ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));

    // Main is preserved as-is.
    const mainAfter = drawDefinition.structures.find((s: any) => s.stage === MAIN);
    expect(mainAfter?.structureId).toEqual(mainBefore?.structureId);
    expect(mainAfter?.matchUps?.length).toEqual(mainBefore?.matchUps?.length);

    // Qualifying structure now exists with real matchUps.
    const qualifying = drawDefinition.structures.find((s: any) => s.stage === QUALIFYING);
    expect(qualifying).toBeDefined();
    expect(qualifying.matchUps.length).toBeGreaterThan(0);

    // Dangling links cleaned up; qualifying→main link present.
    const survivingAfter = new Set(drawDefinition.structures.map((s: any) => s.structureId));
    const danglingAfter = drawDefinition.links.filter((l: any) => !survivingAfter.has(l.source.structureId));
    expect(danglingAfter.length).toEqual(0);

    const qualifyingLink = drawDefinition.links.find(
      (l: any) => l.source.structureId === qualifying.structureId && l.target.structureId === mainAfter.structureId,
    );
    expect(qualifyingLink).toBeDefined();
  });

  it('still preserves the existing placeholder path (single qualifying placeholder)', () => {
    // Sanity: the original existingQualifyingPlaceholderStructureId path
    // continues to work — this is exercised by qualifyingPlaceholderJourney.test.ts
    // but re-asserting here guards against regressing the gating logic.
    const qualifiersCount = 4;
    let result: any = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 44 },
      drawProfiles: [
        {
          qualifyingPlaceholder: true,
          participantsCount: 28,
          qualifiersCount,
          drawSize: 32,
        },
      ],
    });
    expect(result.success).toEqual(true);

    const {
      tournamentRecord,
      eventIds: [eventId],
      drawIds: [drawId],
    } = result;
    tournamentEngine.setState(tournamentRecord);

    const { participants } = tournamentEngine.getParticipants();
    const enteredIds = new Set(tournamentEngine.getEvent({ drawId }).event.entries.map((e: any) => e.participantId));
    const qIds = participants
      .map((p: any) => p.participantId)
      .filter((id: string) => !enteredIds.has(id))
      .slice(0, 12);
    tournamentEngine.addEventEntries({ participantIds: qIds, entryStage: QUALIFYING, eventId });

    result = tournamentEngine.generateDrawDefinition({
      qualifyingProfiles: [{ structureProfiles: [{ stageSequence: 1, drawSize: 16, qualifyingPositions: 4 }] }],
      drawSize: 32,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const qualifying = drawDefinition.structures.find((s: any) => s.stage === QUALIFYING);
    expect(qualifying.matchUps.length).toBeGreaterThan(0);
  });
});
