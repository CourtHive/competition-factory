// Cross-stage drawEntries: when a new MAIN draw is generated with `drawEntries`
// that include QUALIFYING-stage entries, those entries are recorded on the
// draw with their original entryStage instead of being silently dropped.
//
// Why: the unified entries panel can let the user select event entries
// across both stages before clicking "Add draw". The MAIN positioning step
// already filters by stage, so cross-stage entries don't get placed — they
// travel with the draw so a subsequent "Generate qualifying" step can use
// them without another round-trip to addEventEntries.

import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';

describe('generateDrawDefinition with cross-stage drawEntries', () => {
  it('adds QUALIFYING entries to drawDefinition.entries when MAIN draw is generated', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 100 },
      eventProfiles: [{ eventName: 'Test' }],
    });
    tournamentEngine.setState(tournamentRecord);

    const { participants } = tournamentEngine.getParticipants();
    const mainIds = participants.slice(0, 16).map((p: any) => p.participantId);
    const qualifyingIds = participants.slice(16, 64).map((p: any) => p.participantId);

    // Both stages already on the event
    tournamentEngine.addEventEntries({ participantIds: mainIds, eventId });
    tournamentEngine.addEventEntries({ participantIds: qualifyingIds, entryStage: QUALIFYING, eventId });

    // Caller selected entries across both stages and asked to create a MAIN
    // draw. We expect the MAIN positioning to use the 16 main entries, and
    // the 48 qualifying entries to ride along on drawDefinition.entries
    // for the later Generate-Qualifying step.
    const drawEntries = [
      ...mainIds.map((participantId: string, i: number) => ({
        participantId,
        entryStatus: DIRECT_ACCEPTANCE,
        entryStage: MAIN,
        entryPosition: i + 1,
      })),
      ...qualifyingIds.map((participantId: string, i: number) => ({
        participantId,
        entryStatus: DIRECT_ACCEPTANCE,
        entryStage: QUALIFYING,
        entryPosition: i + 1,
      })),
    ];

    const result: any = tournamentEngine.generateDrawDefinition({
      drawEntries,
      drawSize: 32,
      drawType: 'SINGLE_ELIMINATION',
      qualifiersCount: 16,
      qualifyingPlaceholder: true,
      eventId,
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    const ddEntries = result.drawDefinition?.entries ?? [];
    const mainEntriesOnDraw = ddEntries.filter((e: any) => e.entryStage === MAIN);
    const qualifyingEntriesOnDraw = ddEntries.filter((e: any) => e.entryStage === QUALIFYING);

    expect(mainEntriesOnDraw.length).toBe(16);
    expect(qualifyingEntriesOnDraw.length).toBe(48);

    // MAIN structure has the 16 entries placed (plus 16 qualifier slots
    // reserved by qualifiersCount + qualifyingPlaceholder).
    const main = result.drawDefinition.structures.find((s: any) => s.stage === MAIN);
    const placed = main.positionAssignments.filter((p: any) => p.participantId).length;
    const qualifierSlots = main.positionAssignments.filter((p: any) => p.qualifier).length;
    expect(placed).toBe(16);
    expect(qualifierSlots).toBe(16);

    // QUALIFYING placeholder exists but no matchUps (placeholder, not real).
    const qualifying = result.drawDefinition.structures.find((s: any) => s.stage === QUALIFYING);
    expect(qualifying).toBeDefined();
    expect(qualifying.matchUps?.length ?? 0).toBe(0);
  });
});
