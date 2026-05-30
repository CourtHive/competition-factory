import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { unique } from '@Tools/arrays';
import { expect, test } from 'vitest';

import { SINGLES_EVENT } from '@Constants/eventConstants';
import { SWISS } from '@Constants/drawDefinitionConstants';

function completeAllRoundMatchUps({ drawId, roundNumber }) {
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const roundMatchUps = matchUps.filter((m) => m.roundNumber === roundNumber && !m.winningSide && m.drawId === drawId);

  for (const matchUp of roundMatchUps) {
    const { outcome } = generateOutcomeFromScoreString({
      matchUpFormat: MATCH_UP_FORMAT,
      winningSide: 1,
      scoreString: '6-3',
    });
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  }
}

const MATCH_UP_FORMAT = 'SET1-S:6/TB7';

test('full 8-team 3-round Swiss via engine API', () => {
  const drawSize = 8;
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P' },
    drawProfiles: [
      {
        matchUpFormat: MATCH_UP_FORMAT,
        drawType: SWISS,
        automated: false,
        eventType: SINGLES_EVENT,
        drawSize,
      },
    ],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.drawType).toEqual(SWISS);
  const structureId = drawDefinition.structures[0].structureId;

  // round 1: generate and add
  let result: any = tournamentEngine.generateSwissRound({ drawId });
  expect(result.success).toEqual(true);
  expect(result.matchUps.length).toEqual(4);
  expect(result.roundNumber).toEqual(1);

  result = tournamentEngine.addAdHocMatchUps({
    matchUps: result.matchUps,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // verify standings before any results
  let standings: any = tournamentEngine.getSwissStandings({ drawId });
  expect(standings.success).toEqual(true);
  expect(standings.standings.length).toEqual(8);
  expect(standings.roundsPlayed).toEqual(0);
  expect(standings.standings.every((s) => s.points === 0)).toEqual(true);

  // complete round 1
  completeAllRoundMatchUps({ drawId, roundNumber: 1 });

  // verify standings after round 1
  standings = tournamentEngine.getSwissStandings({ drawId });
  expect(standings.roundsPlayed).toEqual(1);
  expect(standings.scoreGroups.length).toEqual(2);
  const totalPoints = standings.standings.reduce((sum, s) => sum + s.points, 0);
  expect(totalPoints).toEqual(4); // 4 winners with 1 point each

  // round 2: generate and add
  result = tournamentEngine.generateSwissRound({ drawId });
  expect(result.success).toEqual(true);
  expect(result.matchUps.length).toEqual(4);
  expect(result.roundNumber).toEqual(2);

  result = tournamentEngine.addAdHocMatchUps({
    matchUps: result.matchUps,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  completeAllRoundMatchUps({ drawId, roundNumber: 2 });

  standings = tournamentEngine.getSwissStandings({ drawId });
  expect(standings.roundsPlayed).toEqual(2);
  expect(standings.scoreGroups.length).toEqual(3); // 2-0, 1-1, 0-2

  // round 3: generate and add
  result = tournamentEngine.generateSwissRound({ drawId });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addAdHocMatchUps({
    matchUps: result.matchUps,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  completeAllRoundMatchUps({ drawId, roundNumber: 3 });

  // final standings
  standings = tournamentEngine.getSwissStandings({ drawId });
  expect(standings.roundsPlayed).toEqual(3);
  expect(standings.standings.length).toEqual(8);
  expect(standings.standings[0].rank).toEqual(1);
  expect(standings.standings[7].rank).toEqual(8);

  // every participant has a unique rank
  const ranks = standings.standings.map((s) => s.rank);
  expect(unique(ranks).length).toEqual(8);

  // verify no repeat opponents across all 3 rounds
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toEqual(12);
  const pairings = matchUps.map((m) =>
    m.sides
      .map((s) => s.participant?.participantId)
      .sort()
      .join('-'),
  );
  expect(unique(pairings).length).toEqual(pairings.length);

  // verify chart
  const chart: any = tournamentEngine.getSwissChart({ drawId });
  expect(chart.success).toEqual(true);
  expect(chart.totalRounds).toEqual(3);
  expect(chart.rounds.length).toEqual(4); // round 0 + rounds 1-3
  expect(chart.rounds[0].nodes.length).toEqual(1); // everyone starts at 0-0
  expect(chart.rounds[0].nodes[0].participantIds.length).toEqual(8);
});

test('16-team 4-round Swiss via engine API', () => {
  const drawSize = 16;
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P' },
    drawProfiles: [
      {
        matchUpFormat: MATCH_UP_FORMAT,
        drawType: SWISS,
        automated: false,
        eventType: SINGLES_EVENT,
        drawSize,
      },
    ],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  for (let round = 1; round <= 4; round++) {
    let result: any = tournamentEngine.generateSwissRound({ drawId });
    expect(result.success).toEqual(true);
    expect(result.matchUps.length).toEqual(8);

    result = tournamentEngine.addAdHocMatchUps({
      matchUps: result.matchUps,
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);

    completeAllRoundMatchUps({ drawId, roundNumber: round });
  }

  const standings: any = tournamentEngine.getSwissStandings({ drawId });
  expect(standings.roundsPlayed).toEqual(4);
  expect(standings.standings.length).toEqual(16);

  // top player should have 4 wins
  expect(standings.standings[0].points).toEqual(4);

  // verify Buchholz is computed
  expect(standings.standings[0].buchholz).toBeDefined();
  expect(standings.standings[0].buchholz).toBeGreaterThan(0);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toEqual(32);

  // verify no repeat opponents
  const pairings = matchUps.map((m) =>
    m.sides
      .map((s) => s.participant?.participantId)
      .sort()
      .join('-'),
  );
  expect(unique(pairings).length).toEqual(pairings.length);
});

test('getSwissStandings returns correct tiebreakers', () => {
  const drawSize = 8;
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P' },
    drawProfiles: [
      {
        matchUpFormat: MATCH_UP_FORMAT,
        drawType: SWISS,
        automated: false,
        eventType: SINGLES_EVENT,
        drawSize,
      },
    ],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  // generate and complete 3 rounds
  for (let round = 1; round <= 3; round++) {
    let result: any = tournamentEngine.generateSwissRound({ drawId });
    expect(result.success).toEqual(true);

    result = tournamentEngine.addAdHocMatchUps({
      matchUps: result.matchUps,
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);

    completeAllRoundMatchUps({ drawId, roundNumber: round });
  }

  // request specific tiebreak methods
  const standings: any = tournamentEngine.getSwissStandings({
    tiebreakMethods: ['BUCHHOLZ', 'SONNEBORN_BERGER', 'PROGRESSIVE_SCORE'],
    drawId,
  });
  expect(standings.success).toEqual(true);

  for (const standing of standings.standings) {
    expect(standing.buchholz).toBeDefined();
    expect(standing.sonnebornBerger).toBeDefined();
    expect(standing.progressiveScore).toBeDefined();
    expect(typeof standing.buchholz).toEqual('number');
    expect(typeof standing.sonnebornBerger).toEqual('number');
    expect(typeof standing.progressiveScore).toEqual('number');
  }

  // standings should be sorted by points descending
  for (let i = 1; i < standings.standings.length; i++) {
    expect(standings.standings[i - 1].points).toBeGreaterThanOrEqual(standings.standings[i].points);
  }
});

test('Swiss draw interoperates with existing scoring mutations', () => {
  const drawSize = 4;
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        matchUpFormat: MATCH_UP_FORMAT,
        drawType: SWISS,
        automated: false,
        eventType: SINGLES_EVENT,
        drawSize,
      },
    ],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  // generate round 1
  let result: any = tournamentEngine.generateSwissRound({ drawId });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addAdHocMatchUps({
    matchUps: result.matchUps,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // score using standard setMatchUpStatus
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toEqual(2);

  for (const matchUp of matchUps) {
    const { outcome } = generateOutcomeFromScoreString({
      matchUpFormat: MATCH_UP_FORMAT,
      scoreString: '6-3',
      winningSide: 1,
    });
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  // standings should reflect scored results
  const standings: any = tournamentEngine.getSwissStandings({ drawId });
  expect(standings.success).toEqual(true);
  expect(standings.roundsPlayed).toEqual(1);

  const winners = standings.standings.filter((s) => s.wins === 1);
  const losers = standings.standings.filter((s) => s.losses === 1);
  expect(winners.length).toEqual(2);
  expect(losers.length).toEqual(2);
});

// Odd participant count forces a bye each round AND creates odd-sized
// score groups in R2+ that trigger selectFloater() — the lowest-rated
// player gets floated down to the next score group. Covers swissPairing
// lines 79-83 (floating trigger) + selectFloater body.
test('7-team Swiss exercises bye selection + selectFloater across rounds', () => {
  const drawSize = 7;
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P' },
    drawProfiles: [
      {
        matchUpFormat: MATCH_UP_FORMAT,
        drawType: SWISS,
        automated: false,
        eventType: SINGLES_EVENT,
        drawSize,
      },
    ],
    setState: true,
  });

  // Round 1: 3 matches + 1 bye = 4 "match slots", one of which is a bye.
  let r1: any = tournamentEngine.generateSwissRound({ drawId });
  expect(r1.success).toEqual(true);
  expect(r1.matchUps.length).toEqual(3);

  tournamentEngine.addAdHocMatchUps({ drawId, structureId: r1.structureId ?? undefined, matchUps: r1.matchUps });
  completeAllRoundMatchUps({ drawId, roundNumber: 1 });

  // Round 2: now 3 winners + 3 losers + 1 bye-haver. Score groups will be
  // odd-sized — the floating branch fires.
  let r2: any = tournamentEngine.generateSwissRound({ drawId });
  expect(r2.success).toEqual(true);
  expect(r2.matchUps.length).toEqual(3);
});
