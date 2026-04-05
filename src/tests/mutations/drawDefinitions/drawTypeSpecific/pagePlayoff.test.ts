import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { PAGE_PLAYOFF, PLAY_OFF, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

describe('PAGE_PLAYOFF draw type', () => {
  it('generates structures and links directly via engine', () => {
    tournamentEngine.newTournamentRecord();
    tournamentEngine.addParticipants({
      participantType: 'INDIVIDUAL',
      participantsCount: 4,
    });
    const event = { eventName: 'PPS Test', eventType: SINGLES_EVENT };
    const { event: createdEvent } = tournamentEngine.addEvent({ event });
    const { participants } = tournamentEngine.getParticipants();
    participants.forEach((p) =>
      tournamentEngine.addEventEntries({ eventId: createdEvent.eventId, participantIds: [p.participantId] }),
    );

    const { drawDefinition, error } = tournamentEngine.generateDrawDefinition({
      eventId: createdEvent.eventId,
      drawType: PAGE_PLAYOFF,
      drawSize: 4,
      automated: false,
    });
    if (error) console.log('GENERATE ERROR:', JSON.stringify(error, null, 2));
    expect(error).toBeUndefined();
    expect(drawDefinition).toBeDefined();
    expect(drawDefinition.structures.length).toEqual(4);
    expect(drawDefinition.links.length).toEqual(4);
  });

  it('generates valid PAGE_PLAYOFF with 4 structures and 4 links', () => {
    const drawSize = 4;
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize, drawType: PAGE_PLAYOFF, automated: false }],
    });
    if (result.error) console.log('GENERATION ERROR:', JSON.stringify(result, null, 2));
    expect(result.success).toEqual(true);
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = result;

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { structures, links } = drawDefinition;

    // 4 structures: Qualifier 1, Eliminator, Qualifier 2, Final
    expect(structures.length).toEqual(4);

    const structureNames = structures.map((s) => s.structureName);
    expect(structureNames).toContain('Qualifier 1');
    expect(structureNames).toContain('Eliminator');
    expect(structureNames).toContain('Qualifier 2');
    expect(structureNames).toContain('Final');

    // 4 links: Q1→Final (WINNER), Q1→Q2 (LOSER), Elim→Q2 (WINNER), Q2→Final (WINNER)
    expect(links.length).toEqual(4);

    // Each structure has exactly 1 matchUp (drawSize 2)
    for (const structure of structures) {
      expect(structure.matchUps.length).toEqual(1);
      expect(structure.positionAssignments.length).toEqual(2);
    }

    // Total of 4 matchUps across all structures
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    expect(matchUps.length).toEqual(4);
    expect(matchUps.every((m) => m.matchUpStatus === TO_BE_PLAYED)).toBe(true);
  });

  it('validates drawSize must be 4', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: PAGE_PLAYOFF }],
    });
    expect(result.error).toBeDefined();
  });

  it('structure abbreviations are set correctly', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: PAGE_PLAYOFF }],
    });

    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const abbreviations = drawDefinition.structures.map((s) => s.structureAbbreviation);
    expect(abbreviations).toContain('Q1');
    expect(abbreviations).toContain('EL');
    expect(abbreviations).toContain('Q2');
    expect(abbreviations).toContain('F');
  });

  it('link types are correct', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: PAGE_PLAYOFF }],
    });

    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { structures, links } = drawDefinition;

    const q1Id = structures.find((s) => s.structureName === 'Qualifier 1')?.structureId;
    const elimId = structures.find((s) => s.structureName === 'Eliminator')?.structureId;
    const q2Id = structures.find((s) => s.structureName === 'Qualifier 2')?.structureId;
    const finalId = structures.find((s) => s.structureName === 'Final')?.structureId;

    // Q1 WINNER → Final
    const q1WinnerLink = links.find((l) => l.source.structureId === q1Id && l.linkType === 'WINNER');
    expect(q1WinnerLink?.target.structureId).toEqual(finalId);

    // Q1 LOSER → Q2
    const q1LoserLink = links.find((l) => l.source.structureId === q1Id && l.linkType === 'LOSER');
    expect(q1LoserLink?.target.structureId).toEqual(q2Id);

    // Eliminator WINNER → Q2
    const elimWinnerLink = links.find((l) => l.source.structureId === elimId && l.linkType === 'WINNER');
    expect(elimWinnerLink?.target.structureId).toEqual(q2Id);

    // Q2 WINNER → Final
    const q2WinnerLink = links.find((l) => l.source.structureId === q2Id && l.linkType === 'WINNER');
    expect(q2WinnerLink?.target.structureId).toEqual(finalId);
  });

  it('finishing position ranges are set correctly', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: PAGE_PLAYOFF, automated: false }],
      setState: true,
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();

    // The Final determines positions 1 and 2
    const finalMatchUp = matchUps.find((m) => m.structureName === 'Final');
    expect(finalMatchUp?.finishingPositionRange?.winner).toEqual([1, 1]);
    expect(finalMatchUp?.finishingPositionRange?.loser).toEqual([2, 2]);

    // The Eliminator loser gets position 4
    const eliminatorMatchUp = matchUps.find((m) => m.structureName === 'Eliminator');
    expect(eliminatorMatchUp?.finishingPositionRange?.loser).toEqual([4, 4]);

    // Q2 loser gets position 3
    const q2MatchUp = matchUps.find((m) => m.structureName === 'Qualifier 2');
    expect(q2MatchUp?.finishingPositionRange?.loser).toEqual([3, 3]);
  });

  it('can be used as playoff structure type in ROUND_ROBIN_WITH_PLAYOFF', () => {
    const drawSize = 16;
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize,
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          structureOptions: {
            groupSize: 4,
            playoffGroups: [
              {
                drawType: PAGE_PLAYOFF,
                finishingPositions: [1],
                structureName: 'Championship',
              },
            ],
          },
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { structures, links } = drawDefinition;

    // 1 RR container structure + 4 PPS structures = 5 total
    expect(structures.length).toEqual(5);

    // Should have POSITION link from RR to PPS + 4 internal PPS links
    const positionLinks = links.filter((l) => l.linkType === 'POSITION');
    expect(positionLinks.length).toEqual(1);

    // The PPS structures should all have stage PLAY_OFF
    const ppsStructures = structures.filter((s) => s.stage === PLAY_OFF);
    expect(ppsStructures.length).toEqual(4);
  });

  it('PAGE_PLAYOFF structures have correct stage sequence ordering', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: PAGE_PLAYOFF }],
    });

    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    const q1 = drawDefinition.structures.find((s) => s.structureName === 'Qualifier 1');
    const elim = drawDefinition.structures.find((s) => s.structureName === 'Eliminator');
    const q2 = drawDefinition.structures.find((s) => s.structureName === 'Qualifier 2');
    const final = drawDefinition.structures.find((s) => s.structureName === 'Final');

    expect(q1?.stageSequence).toEqual(1);
    expect(elim?.stageSequence).toEqual(2);
    expect(q2?.stageSequence).toEqual(3);
    expect(final?.stageSequence).toEqual(4);
  });

  it('can add PAGE_PLAYOFF as playoff to a completed SE draw via playoffGroups', () => {
    const drawSize = 8;
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize, drawType: 'SINGLE_ELIMINATION' }],
      completeAllMatchUps: true,
    });

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition: dd } = tournamentEngine.getEvent({ drawId });
    const mainStructureId = dd.structures[0].structureId;

    // Add PAGE_PLAYOFF via playoffGroups with POSITION link for finishers 1-4
    const result = tournamentEngine.generateAndPopulatePlayoffStructures({
      playoffGroups: [{ drawType: PAGE_PLAYOFF, finishingPositions: [1, 2, 3, 4] }],
      structureId: mainStructureId,
      drawId,
    });
    if (result.error) console.log('PPS ERROR:', JSON.stringify(result, null, 2));
    expect(result.success).toEqual(true);

    // Should have generated 4 PPS structures
    expect(result.structures?.length).toEqual(4);
    expect(result.links?.length).toBeGreaterThanOrEqual(4);

    // The new structures should have stage PLAY_OFF
    const ppsStructures = result.structures?.filter((s: any) => s.stage === PLAY_OFF);
    expect(ppsStructures?.length).toEqual(4);

    // POSITION link from main SE to PPS Q1
    const positionLinks = result.links?.filter((l: any) => l.linkType === 'POSITION');
    expect(positionLinks?.length).toEqual(1);
    expect(positionLinks?.[0]?.source.finishingPositions).toEqual([1, 2, 3, 4]);
  });
});
