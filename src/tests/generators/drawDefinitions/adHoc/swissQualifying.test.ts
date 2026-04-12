/**
 * Swiss draw with qualifying structure — verifies the two-step flow:
 *   1. Generate Swiss main with qualifying placeholder (entries reserved for qualifiers)
 *   2. Generate qualifying structure from QUALIFYING entries
 *   3. Complete qualifying matchUps
 *   4. Generate Swiss round in main — should include MAIN entries + qualifying winners
 */
import { completeDrawMatchUps } from '@Assemblies/generators/mocks/completeDrawMatchUps';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// Constants
import { MAIN, QUALIFYING, SWISS, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

function setupEventWithEntries({ mainCount, qualCount }: { mainCount: number; qualCount: number }) {
  const result = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: mainCount + qualCount + 3 },
  });
  tournamentEngine.setState(result.tournamentRecord);
  const eventResult = tournamentEngine.addEvent({
    event: { eventName: 'Test', eventType: SINGLES_EVENT },
  });
  const eventId = eventResult.event.eventId;
  const { participants } = tournamentEngine.getParticipants();
  const mainIds = participants.slice(0, mainCount).map((p: any) => p.participantId);
  const qualIds = participants.slice(mainCount, mainCount + qualCount).map((p: any) => p.participantId);
  tournamentEngine.addEventEntries({ participantIds: mainIds, entryStage: MAIN, eventId });
  tournamentEngine.addEventEntries({ participantIds: qualIds, entryStage: QUALIFYING, eventId });
  return { eventId, mainIds, qualIds };
}

describe('Swiss draw with qualifying structure', () => {
  it('Swiss round excludes QUALIFYING stage entries before qualifying completes', () => {
    const { eventId, mainIds } = setupEventWithEntries({ mainCount: 29, qualCount: 9 });
    const { event } = tournamentEngine.getEvent({ eventId });
    const mainDrawEntries = event.entries.filter(
      (e: any) => e.entryStage === MAIN && e.entryStatus === DIRECT_ACCEPTANCE,
    );

    const genResult = tournamentEngine.generateDrawDefinition({
      drawType: SWISS,
      drawEntries: mainDrawEntries,
      drawSize: 32,
      qualifiersCount: 3,
      qualifyingPlaceholder: true,
      automated: false,
      ignoreStageSpace: true,
      eventId,
    });
    expect(genResult.success).toEqual(true);
    const drawId = genResult.drawDefinition.drawId;
    tournamentEngine.addDrawDefinition({ eventId, drawDefinition: genResult.drawDefinition });

    // Before qualifying is generated, Swiss round should only include the 29 MAIN entries
    const roundResult = tournamentEngine.generateSwissRound({ drawId });
    expect(roundResult.success).toEqual(true);

    const roundParticipants = new Set<string>();
    for (const m of roundResult.matchUps || []) {
      for (const s of m.sides || []) if (s.participantId) roundParticipants.add(s.participantId);
    }
    // 29 entries → 14 matchUps + 1 bye (1 participant not in a matchUp)
    expect(roundParticipants.size).toEqual(28);
    // All participants in round should be from MAIN entries
    const mainIdSet = new Set(mainIds);
    for (const pid of roundParticipants) expect(mainIdSet.has(pid)).toEqual(true);
  });

  it('Swiss round includes qualifying winners after qualifying completes', () => {
    const { eventId, mainIds } = setupEventWithEntries({ mainCount: 29, qualCount: 9 });
    const { event } = tournamentEngine.getEvent({ eventId });
    const mainDrawEntries = event.entries.filter(
      (e: any) => e.entryStage === MAIN && e.entryStatus === DIRECT_ACCEPTANCE,
    );

    // Step 1: Swiss main + qualifying placeholder
    const genResult = tournamentEngine.generateDrawDefinition({
      drawType: SWISS,
      drawEntries: mainDrawEntries,
      drawSize: 32,
      qualifiersCount: 3,
      qualifyingPlaceholder: true,
      automated: false,
      ignoreStageSpace: true,
      eventId,
    });
    const drawId = genResult.drawDefinition.drawId;
    tournamentEngine.addDrawDefinition({ eventId, drawDefinition: genResult.drawDefinition });

    // Step 2: Generate qualifying structure
    const qualDrawEntries = tournamentEngine
      .getEvent({ eventId })
      .event.entries.filter((e: any) => e.entryStage === QUALIFYING && e.entryStatus === DIRECT_ACCEPTANCE);
    const qualGen = tournamentEngine.generateDrawDefinition({
      drawEntries: qualDrawEntries,
      automated: true,
      drawSize: 32,
      eventId,
      drawId,
      qualifyingProfiles: [
        {
          structureProfiles: [{ qualifyingPositions: 3, drawSize: 16, drawType: SINGLE_ELIMINATION, stageSequence: 1 }],
        },
      ],
      ignoreStageSpace: true,
    });
    expect(qualGen.success).toEqual(true);
    tournamentEngine.addDrawDefinition({
      eventId,
      drawDefinition: qualGen.drawDefinition,
      allowReplacement: true,
    });

    // Step 3: Complete all qualifying matchUps
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const compResult = completeDrawMatchUps({ drawDefinition });
    expect(compResult.success).toEqual(true);
    tournamentEngine.addDrawDefinition({ eventId, drawDefinition, allowReplacement: true });

    // Verify qualifying final round is complete using hydrated matchUps
    const { drawDefinition: finalDD } = tournamentEngine.getEvent({ drawId });
    const qualStructure = finalDD.structures.find((s: any) => s.stage === QUALIFYING);
    const qualifyingRoundNumber = qualStructure.qualifyingRoundNumber;
    const allMatchUps = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps || [];
    const finalRoundMatchUps = allMatchUps.filter(
      (m: any) => m.structureId === qualStructure.structureId && m.roundNumber === qualifyingRoundNumber,
    );
    expect(finalRoundMatchUps.length).toEqual(3);
    const qualifierWinnerIds = finalRoundMatchUps
      .filter((m: any) => m.winningSide)
      .map((m: any) => m.sides.find((s: any) => s?.sideNumber === m.winningSide)?.participantId)
      .filter(Boolean);
    expect(qualifierWinnerIds.length).toEqual(3);

    // Step 4: Generate Swiss round in main — should include MAIN entries + qualifying winners
    const roundResult = tournamentEngine.generateSwissRound({ drawId });
    expect(roundResult.success).toEqual(true);

    const roundParticipants = new Set<string>();
    for (const m of roundResult.matchUps || []) {
      for (const s of m.sides || []) if (s.participantId) roundParticipants.add(s.participantId);
    }
    // 29 main + 3 qualifier winners = 32 → 16 matchUps, no bye
    expect(roundResult.matchUps?.length).toEqual(16);
    expect(roundParticipants.size).toEqual(32);

    // Verify all MAIN entries are included
    for (const pid of mainIds) expect(roundParticipants.has(pid)).toEqual(true);
    // Verify all qualifying winners are included
    for (const pid of qualifierWinnerIds) expect(roundParticipants.has(pid)).toEqual(true);
  });
});
