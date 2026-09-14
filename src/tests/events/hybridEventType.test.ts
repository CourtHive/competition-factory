/**
 * Tests for HYBRID eventType — mixed INDIVIDUAL and PAIR participants in the same draw.
 * Scoring is uniform regardless of side composition. Participants maintain their
 * composition (INDIVIDUAL or PAIR) throughout the draw.
 */
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, test, expect } from 'vitest';

// constants
import { SINGLE_ELIMINATION, MAIN } from '@Constants/drawDefinitionConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { HYBRID } from '@Constants/eventConstants';

function setupHybridTournament({ drawSize = 8, pairCount = 4 } = {}) {
  const individualCount = drawSize - pairCount;

  // Generate individual participants
  const individuals = Array.from({ length: individualCount }, (_, i) => ({
    participantId: `ind-${i + 1}`,
    participantName: `Player ${i + 1}`,
    participantType: INDIVIDUAL,
    person: {
      standardFamilyName: `Family${i + 1}`,
      standardGivenName: `Given${i + 1}`,
      personId: `person-${i + 1}`,
    },
  }));

  // Generate pair participants with individual members
  const pairMembers: any[] = [];
  const pairs = Array.from({ length: pairCount }, (_, i) => {
    const member1 = {
      participantId: `pair-${i + 1}-m1`,
      participantName: `Pair${i + 1} Member1`,
      participantType: INDIVIDUAL,
      person: {
        standardFamilyName: `PairFamily${i + 1}A`,
        standardGivenName: `PairGiven${i + 1}A`,
        personId: `pair-person-${i + 1}-a`,
      },
    };
    const member2 = {
      participantId: `pair-${i + 1}-m2`,
      participantName: `Pair${i + 1} Member2`,
      participantType: INDIVIDUAL,
      person: {
        standardFamilyName: `PairFamily${i + 1}B`,
        standardGivenName: `PairGiven${i + 1}B`,
        personId: `pair-person-${i + 1}-b`,
      },
    };
    pairMembers.push(member1, member2);
    return {
      participantId: `pair-${i + 1}`,
      participantName: `Pair ${i + 1}`,
      participantType: PAIR,
      individualParticipantIds: [member1.participantId, member2.participantId],
    };
  });

  const allParticipants = [...individuals, ...pairMembers, ...pairs];
  const drawParticipants = [...individuals, ...pairs];

  // Create tournament
  const tournamentRecord = {
    tournamentId: 'hybrid-tournament',
    tournamentName: 'Hybrid Test',
    participants: allParticipants,
  };

  tournamentEngine.setState(tournamentRecord);

  // Create HYBRID event
  let result: any = tournamentEngine.addEvent({
    event: {
      eventId: 'hybrid-event',
      eventName: 'Hybrid Event',
      eventType: HYBRID,
    },
  });
  expect(result.success).toEqual(true);

  // Add entries
  const participantIds = drawParticipants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({
    eventId: 'hybrid-event',
    participantIds,
  });
  expect(result.success).toEqual(true);

  return { drawParticipants, individuals, pairs };
}

describe('HYBRID eventType', () => {
  test('accepts both INDIVIDUAL and PAIR entries', () => {
    setupHybridTournament();

    const { event } = tournamentEngine.getEvent({ eventId: 'hybrid-event' });
    expect(event.eventType).toEqual(HYBRID);
    expect(event.entries.length).toEqual(8);

    // Verify mix of participant types in entries
    const entryParticipantIds = new Set(event.entries.map((e) => e.participantId));
    const { participants } = tournamentEngine.getParticipants();
    const entryParticipants = participants.filter((p) => entryParticipantIds.has(p.participantId));
    const types: any = [...new Set(entryParticipants.map((p) => p.participantType))];
    expect(types.toSorted((a, b) => a.localeCompare(b))).toEqual([INDIVIDUAL, PAIR]);
  });

  test('generates a draw with mixed participant types', () => {
    setupHybridTournament();

    let result: any = tournamentEngine.generateDrawDefinition({
      drawType: SINGLE_ELIMINATION,
      eventId: 'hybrid-event',
      drawSize: 8,
    });
    expect(result.success).toEqual(true);

    const { drawDefinition } = result;
    expect(drawDefinition).toBeDefined();

    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);
    expect(mainStructure).toBeDefined();
    expect(mainStructure.matchUps.length).toEqual(7); // 8-player SE = 7 matchUps
  });

  test('adds draw and verifies matchUp sides have mixed types', () => {
    setupHybridTournament();

    let result: any = tournamentEngine.generateDrawDefinition({
      drawType: SINGLE_ELIMINATION,
      eventId: 'hybrid-event',
      automated: true,
      drawSize: 8,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.addDrawDefinition({
      eventId: 'hybrid-event',
      drawDefinition: result.drawDefinition,
    });
    expect(result.success).toEqual(true);

    // Get first-round matchUps with context
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const firstRound = matchUps.filter((m) => m.roundNumber === 1);
    expect(firstRound.length).toEqual(4);

    // Verify that some matchUps have mixed side participant types
    const sideTypes = firstRound.flatMap((m) =>
      (m.sides || []).filter((s) => s.participant).map((s) => s.participant.participantType),
    );
    expect(sideTypes).toContain(INDIVIDUAL);
    expect(sideTypes).toContain(PAIR);
  });

  test('scores a HYBRID matchUp and winner progresses', () => {
    setupHybridTournament({ drawSize: 4, pairCount: 2 });

    let result: any = tournamentEngine.generateDrawDefinition({
      matchUpFormat: 'SET1-S:6/TB7',
      drawType: SINGLE_ELIMINATION,
      eventId: 'hybrid-event',
      automated: true,
      drawSize: 4,
    });
    expect(result.success).toEqual(true);
    const drawId = result.drawDefinition.drawId;

    result = tournamentEngine.addDrawDefinition({
      eventId: 'hybrid-event',
      drawDefinition: result.drawDefinition,
    });
    expect(result.success).toEqual(true);

    // Get first-round matchUps
    const { matchUps: allMatchUps } = tournamentEngine.allTournamentMatchUps();
    const firstRound = allMatchUps.filter((m) => m.roundNumber === 1);
    expect(firstRound.length).toEqual(2);

    // Score both first-round matchUps — side 1 wins each
    for (const matchUp of firstRound) {
      result = tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome: {
          winningSide: 1,
          score: {
            scoreStringSide1: '6-3',
            scoreStringSide2: '3-6',
            sets: [{ setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 }],
          },
        },
        drawId,
      });
      expect(result.success).toEqual(true);
    }

    // Verify the final matchUp has participants assigned from first-round winners
    const { matchUps: updatedMatchUps } = tournamentEngine.allTournamentMatchUps();
    const finalMatchUp = updatedMatchUps.find((m) => m.roundNumber === 2);
    expect(finalMatchUp).toBeDefined();
    expect(finalMatchUp.sides?.filter((s) => s.participantId).length).toEqual(2);

    // Score the final
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: finalMatchUp.matchUpId,
      outcome: {
        winningSide: 1,
        score: {
          scoreStringSide1: '6-4',
          scoreStringSide2: '4-6',
          sets: [{ setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 }],
        },
      },
      drawId,
    });
    expect(result.success).toEqual(true);

    // Verify all matchUps completed
    const { matchUps: finalMatchUps } = tournamentEngine.allTournamentMatchUps();
    const completedCount = finalMatchUps.filter((m) => m.matchUpStatus === COMPLETED).length;
    expect(completedCount).toEqual(3);
  });

  test('rejects TEAM participants in HYBRID events', () => {
    tournamentEngine.setState({
      tournamentId: 'hybrid-reject-test',
      tournamentName: 'Reject Test',
      participants: [
        {
          participantId: 'team-1',
          participantName: 'Team 1',
          participantType: 'TEAM',
          individualParticipantIds: [],
        },
      ],
    });

    let result: any = tournamentEngine.addEvent({
      event: {
        eventId: 'reject-event',
        eventName: 'Reject Event',
        eventType: HYBRID,
      },
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.addEventEntries({
      eventId: 'reject-event',
      participantIds: ['team-1'],
    });
    // TEAM participant should not be accepted in a HYBRID event
    expect(result.error).toBeDefined();
  });

  test('checkValidEntries passes for mixed INDIVIDUAL/PAIR entries', () => {
    setupHybridTournament();

    // The fact that setupHybridTournament succeeds (addEventEntries) is itself
    // validation that checkValidEntries works. Let's also verify via getEvent.
    const { event } = tournamentEngine.getEvent({ eventId: 'hybrid-event' });
    expect(event.entries.length).toEqual(8);
    expect(event.eventType).toEqual(HYBRID);
  });

  describe('mocksEngine generation', () => {
    test('generates HYBRID draw via drawProfiles with mixed participant types', () => {
      const drawProfiles = [{ drawSize: 8, eventType: HYBRID, drawType: SINGLE_ELIMINATION }];
      const {
        drawIds: [drawId],
        tournamentRecord,
      } = mocksEngine.generateTournamentRecord({ setState: true, drawProfiles });

      expect(drawId).toBeDefined();
      expect(tournamentRecord).toBeDefined();

      // Verify the event is HYBRID
      const { event } = tournamentEngine.getEvent({ drawId });
      expect(event.eventType).toEqual(HYBRID);

      // Verify entries contain both INDIVIDUAL and PAIR participants
      const entryParticipantIds = new Set(event.entries.map((e) => e.participantId));
      const { participants } = tournamentEngine.getParticipants();
      const entryParticipants = participants.filter((p) => entryParticipantIds.has(p.participantId));
      const types: any = [...new Set(entryParticipants.map((p) => p.participantType))];
      expect(types.toSorted((a, b) => a.localeCompare(b))).toEqual([INDIVIDUAL, PAIR]);

      // Verify correct counts: half individual, half pair
      const individualEntries = entryParticipants.filter((p) => p.participantType === INDIVIDUAL);
      const pairEntries = entryParticipants.filter((p) => p.participantType === PAIR);
      expect(individualEntries.length).toEqual(4);
      expect(pairEntries.length).toEqual(4);

      // Verify draw was generated with matchUps
      const { matchUps } = tournamentEngine.allTournamentMatchUps();
      expect(matchUps.length).toEqual(7); // 8-player SE = 7 matchUps

      // Verify first round has both INDIVIDUAL and PAIR sides
      const firstRound = matchUps.filter((m) => m.roundNumber === 1);
      const sideTypes = firstRound.flatMap((m) =>
        (m.sides || []).filter((s) => s.participant).map((s) => s.participant.participantType),
      );
      expect(sideTypes).toContain(INDIVIDUAL);
      expect(sideTypes).toContain(PAIR);
    });

    test('generates HYBRID draw with automated placement', () => {
      const drawProfiles = [
        {
          drawSize: 4,
          eventType: HYBRID,
          drawType: SINGLE_ELIMINATION,
          automated: true,
          matchUpFormat: 'SET1-S:6/TB7',
        },
      ];
      mocksEngine.generateTournamentRecord({ setState: true, drawProfiles });

      const { matchUps } = tournamentEngine.allTournamentMatchUps();
      const firstRound = matchUps.filter((m) => m.roundNumber === 1);

      // Both first-round matchUps should have participants assigned
      for (const matchUp of firstRound) {
        const assignedSides = matchUp.sides?.filter((s) => s.participantId);
        expect(assignedSides?.length).toEqual(2);
      }
    });
  });
});
