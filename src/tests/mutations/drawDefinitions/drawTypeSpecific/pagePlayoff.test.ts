import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import {
  PAGE_PLAYOFF,
  PLAY_OFF,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

describe('PAGE_PLAYOFF draw type', () => {
  it('generates structures and links directly via engine', () => {
    tournamentEngine.newTournamentRecord();
    tournamentEngine.addParticipants({
      participantType: 'INDIVIDUAL',
      participantsCount: 4,
    });
    const event = { eventName: 'PPS Test', eventType: SINGLES_EVENT };
    let result: any = tournamentEngine.addEvent({ event });
    const { event: createdEvent } = result;
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
    expect(error).toBeUndefined();
    expect(drawDefinition).toBeDefined();
    expect(drawDefinition.structures.length).toEqual(4);
    expect(drawDefinition.links.length).toEqual(4);
  });

  it('generates valid PAGE_PLAYOFF with 4 structures and 4 links', () => {
    const drawSize = 4;
    let result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize, drawType: PAGE_PLAYOFF, automated: false }],
    });
    expect(result.success).toEqual(true);
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = result;

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { structures, links } = drawDefinition;

    expect(structures.length).toEqual(4);

    const structureNames = structures.map((s) => s.structureName);
    expect(structureNames).toContain('Qualifier 1');
    expect(structureNames).toContain('Eliminator');
    expect(structureNames).toContain('Qualifier 2');
    expect(structureNames).toContain('Final');

    expect(links.length).toEqual(4);

    for (const structure of structures) {
      expect(structure.matchUps.length).toEqual(1);
      expect(structure.positionAssignments.length).toEqual(2);
    }

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    expect(matchUps.length).toEqual(4);
    expect(matchUps.every((m) => m.matchUpStatus === TO_BE_PLAYED)).toBe(true);
  });

  it('validates drawSize must be 4', () => {
    let result: any = mocksEngine.generateTournamentRecord({
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

    const q1WinnerLink = links.find((l) => l.source.structureId === q1Id && l.linkType === 'WINNER');
    expect(q1WinnerLink?.target.structureId).toEqual(finalId);

    const q1LoserLink = links.find((l) => l.source.structureId === q1Id && l.linkType === 'LOSER');
    expect(q1LoserLink?.target.structureId).toEqual(q2Id);

    const elimWinnerLink = links.find((l) => l.source.structureId === elimId && l.linkType === 'WINNER');
    expect(elimWinnerLink?.target.structureId).toEqual(q2Id);

    const q2WinnerLink = links.find((l) => l.source.structureId === q2Id && l.linkType === 'WINNER');
    expect(q2WinnerLink?.target.structureId).toEqual(finalId);
  });

  it('finishing position ranges are set correctly', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: PAGE_PLAYOFF, automated: false }],
      setState: true,
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();

    const finalMatchUp = matchUps.find((m) => m.structureName === 'Final');
    expect(finalMatchUp?.finishingPositionRange?.winner).toEqual([1, 1]);
    expect(finalMatchUp?.finishingPositionRange?.loser).toEqual([2, 2]);

    const eliminatorMatchUp = matchUps.find((m) => m.structureName === 'Eliminator');
    expect(eliminatorMatchUp?.finishingPositionRange?.loser).toEqual([4, 4]);

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
            groupSize: 8,
            playoffGroups: [
              {
                drawType: PAGE_PLAYOFF,
                finishingPositions: [1, 2],
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

    // Two POSITION links: [1]→Q1, [2]→Eliminator
    const positionLinks = links.filter((l) => l.linkType === 'POSITION');
    expect(positionLinks.length).toEqual(2);

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

  it('adds PAGE_PLAYOFF to completed SE16: 3 new structures with correct links', () => {
    const drawSize = 16;
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize, drawType: SINGLE_ELIMINATION }],
      completeAllMatchUps: true,
    });

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition: dd } = tournamentEngine.getEvent({ drawId });
    const mainStructureId = dd.structures[0].structureId;
    const mainFinalRound = Math.max(...dd.structures[0].matchUps.map((m) => m.roundNumber));

    let result: any = tournamentEngine.generateAndPopulatePlayoffStructures({
      playoffGroups: [{ drawType: PAGE_PLAYOFF, finishingPositions: [1, 2, 3, 4] }],
      structureId: mainStructureId,
      drawId,
    });
    if (result.error) console.log('SE+PPS ERROR:', JSON.stringify(result, null, 2));
    expect(result.success).toEqual(true);

    // SE→PPS: 3 new structures (3-4 Playoff, Q2, Playoff Final) — SE final IS Q1
    expect(result.structures?.length).toEqual(3);

    const eliminator = result.structures?.find((s: any) => s.structureAbbreviation === 'EL');
    const q2 = result.structures?.find((s: any) => s.structureAbbreviation === 'Q2');
    const ppsFinal = result.structures?.find((s: any) => s.structureAbbreviation === 'F');
    expect(eliminator).toBeDefined();
    expect(q2).toBeDefined();
    expect(ppsFinal).toBeDefined();

    // LOSER link: SE semifinal → Eliminator (semifinal losers are positions 3-4)
    const semifinalRound = mainFinalRound - 1;
    const loserToElim = result.links?.find(
      (l: any) => l.linkType === 'LOSER' && l.target.structureId === eliminator.structureId,
    );
    expect(loserToElim).toBeDefined();
    expect(loserToElim?.source.structureId).toEqual(mainStructureId);
    expect(loserToElim?.source.roundNumber).toEqual(semifinalRound);

    // WINNER link: SE final → PPS Final
    const winnerFromSE = result.links?.find(
      (l: any) => l.linkType === 'WINNER' && l.source.structureId === mainStructureId,
    );
    expect(winnerFromSE?.source.roundNumber).toEqual(mainFinalRound);
    expect(winnerFromSE?.target.structureId).toEqual(ppsFinal.structureId);

    // LOSER link: SE final → Q2
    const loserFromSE = result.links?.find(
      (l: any) =>
        l.linkType === 'LOSER' && l.source.structureId === mainStructureId && l.source.roundNumber === mainFinalRound,
    );
    expect(loserFromSE?.target.structureId).toEqual(q2.structureId);

    // Internal: Eliminator WINNER → Q2
    const elimToQ2 = result.links?.find(
      (l: any) => l.linkType === 'WINNER' && l.source.structureId === eliminator.structureId,
    );
    expect(elimToQ2?.target.structureId).toEqual(q2.structureId);

    // Internal: Q2 WINNER → PPS Final
    const q2ToFinal = result.links?.find(
      (l: any) => l.linkType === 'WINNER' && l.source.structureId === q2.structureId,
    );
    expect(q2ToFinal?.target.structureId).toEqual(ppsFinal.structureId);
  });

  // Attaching a PAGE_PLAYOFF to a COMPLETED single elimination draw produces THREE new structures,
  // not four: a Page playoff opens 1-v-2, and the SE has already played that match, so the SE final
  // IS Q1. The three new PLAY_OFF structures are 3-4 Playoff (EL), Playoff Qualifier (Q2) and
  // Playoff Final (F) — see processPagePlayoffFromElimination.
  //
  // This test was skipped for months behind a TODO claiming "advancement via POSITION links needs a
  // factory fix". That was a misdiagnosis on three counts, all verified 2026-08-06:
  //   1. it expected 4 structures and looked them up by the STANDALONE generator's names
  //      (Qualifier 1 / Eliminator / Qualifier 2 / Final) while driving the ATTACH path, so all four
  //      lookups missed — not just the count assertion it died on;
  //   2. the elimination path uses LOSER/WINNER links, not POSITION links. POSITION links
  //      (generatePlayoffLink) are used only by processPagePlayoffFromRR, the round-robin source;
  //   3. advancement was never broken.
  // Matching on structureAbbreviation rather than structureName keeps this robust to naming.
  it('progresses participants from a completed SE16 through the attached PAGE_PLAYOFF structures', () => {
    const drawSize = 16;
    const matchUpFormat = 'SET3-S:6/TB7';
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize, drawType: SINGLE_ELIMINATION, matchUpFormat }],
      completeAllMatchUps: true,
      setState: true,
    });

    const { drawDefinition: dd } = tournamentEngine.getEvent({ drawId });
    const mainStructureId = dd.structures[0].structureId;

    const result: any = tournamentEngine.addPlayoffStructures({
      playoffGroups: [{ drawType: PAGE_PLAYOFF, finishingPositions: [1, 2, 3, 4] }],
      structureId: mainStructureId,
      drawId,
    });
    expect(result.success).toEqual(true);

    const playoffStructures = () => {
      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      return drawDefinition.structures.filter((s) => s.stage === PLAY_OFF);
    };
    const byAbbreviation = (abbreviation: string) =>
      playoffStructures().find((s) => s.structureAbbreviation === abbreviation);
    const seated = (abbreviation: string) =>
      (byAbbreviation(abbreviation)?.positionAssignments ?? []).filter((pa) => pa.participantId).length;

    // THREE new structures — the SE final serves as Q1
    expect(playoffStructures().length).toEqual(3);
    expect(byAbbreviation('EL')).toBeDefined();
    expect(byAbbreviation('Q2')).toBeDefined();
    expect(byAbbreviation('F')).toBeDefined();

    // Generation seeds directly from the completed SE: semifinal losers into the 3-4 Playoff,
    // the final's loser into the Playoff Qualifier, the final's winner into the Playoff Final.
    expect(seated('EL')).toEqual(2);
    expect(seated('Q2')).toEqual(1);
    expect(seated('F')).toEqual(1);

    const scoreStructure = (abbreviation: string) => {
      const structureId = byAbbreviation(abbreviation)?.structureId;
      const { matchUps } = tournamentEngine.allTournamentMatchUps();
      const matchUp = matchUps.find(
        (m) => m.structureId === structureId && m.sides?.every((side) => side?.participantId),
      );
      expect(matchUp, `no fully-populated matchUp in ${abbreviation}`).toBeDefined();
      const outcome = {
        score: {
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 4, winningSide: 1 },
          ],
        },
        matchUpStatus: COMPLETED,
        winningSide: 1,
      };
      const scored: any = tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, outcome, drawId });
      expect(scored.success).toEqual(true);
    };

    // EL winner advances into Q2 (WINNER link) — Q2 goes from 1 seat filled to 2
    scoreStructure('EL');
    expect(seated('Q2')).toEqual(2);

    // Q2 winner advances into the Playoff Final (WINNER link) — F goes from 1 to 2
    scoreStructure('Q2');
    expect(seated('F')).toEqual(2);

    scoreStructure('F');

    // all three attached matchUps completed
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const playoffIds = new Set(playoffStructures().map((s) => s.structureId));
    const playoffMatchUps = matchUps.filter((m) => playoffIds.has(m.structureId));
    expect(playoffMatchUps.length).toEqual(3);
    expect(playoffMatchUps.every((m) => m.matchUpStatus === COMPLETED)).toEqual(true);
  });

  it('RR with PAGE_PLAYOFF playoff generates correct links for 2 groups of 8', () => {
    const drawSize = 16;
    let result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize,
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          structureOptions: {
            groupSize: 8,
            playoffGroups: [
              {
                drawType: PAGE_PLAYOFF,
                finishingPositions: [1, 2],
                structureName: 'Championship',
              },
            ],
          },
        },
      ],
    });
    if (result.error) console.log('RR+PPS ERROR:', JSON.stringify(result, null, 2));
    expect(result.success).toEqual(true);

    const {
      tournamentRecord,
      drawIds: [drawId],
    } = result;
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    const ppsStructures = drawDefinition.structures.filter((s) => s.stage === PLAY_OFF);
    expect(ppsStructures.length).toEqual(4);

    // Two POSITION links: [1]→Q1, [2]→Eliminator
    const positionLinks = drawDefinition.links.filter((l) => l.linkType === 'POSITION');
    expect(positionLinks.length).toEqual(2);

    // 4 internal PPS links (WINNER/LOSER)
    const internalLinks = drawDefinition.links.filter((l) => l.linkType === 'WINNER' || l.linkType === 'LOSER');
    expect(internalLinks.length).toEqual(4);
  });
});
