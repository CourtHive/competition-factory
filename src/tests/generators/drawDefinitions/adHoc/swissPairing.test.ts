import { computeScoreGroups } from '@Generators/drawDefinitions/drawTypes/adHoc/swiss/computeScoreGroups';
import { generateSwissPairings } from '@Generators/drawDefinitions/drawTypes/adHoc/swiss/swissPairing';
import { computeTiebreakers } from '@Generators/drawDefinitions/drawTypes/adHoc/swiss/computeTiebreakers';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { unique } from '@Tools/arrays';
import { expect, test } from 'vitest';

import { SINGLES_EVENT } from '@Constants/eventConstants';
import { SWISS } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

test('SWISS drawType generates an AD_HOC-style structure', () => {
  const drawSize = 8;
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P' },
    drawProfiles: [
      {
        drawType: SWISS,
        automated: false,
        drawSize,
      },
    ],
    setState: true,
  });

  let result: any = tournamentEngine.getEvent({ drawId });
  const drawDefinition = result.drawDefinition;

  expect(drawDefinition.drawType).toEqual(SWISS);
  expect(drawDefinition.structures.length).toEqual(1);
  expect(drawDefinition.structures[0].matchUps.length).toEqual(0);
  expect(drawDefinition.entries.length).toEqual(drawSize);
});

test('computeScoreGroups correctly groups participants by W-L record', () => {
  const participantIds = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
  const matchUps: any[] = [
    { matchUpId: 'm1', sides: [{ participantId: 'P1' }, { participantId: 'P8' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'm2', sides: [{ participantId: 'P2' }, { participantId: 'P7' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'm3', sides: [{ participantId: 'P3' }, { participantId: 'P6' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'm4', sides: [{ participantId: 'P4' }, { participantId: 'P5' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
  ];

  const { scoreGroups, records } = computeScoreGroups({ participantIds, matchUps });

  expect(scoreGroups.length).toEqual(2);

  const winnersGroup = scoreGroups.find((g) => g.wins === 1 && g.losses === 0);
  const losersGroup = scoreGroups.find((g) => g.wins === 0 && g.losses === 1);

  expect(winnersGroup?.participantIds.sort()).toEqual(['P1', 'P2', 'P3', 'P4']);
  expect(losersGroup?.participantIds.sort()).toEqual(['P5', 'P6', 'P7', 'P8']);

  const p1Record = records.get('P1');
  expect(p1Record?.wins).toEqual(1);
  expect(p1Record?.losses).toEqual(0);
  expect(p1Record?.opponentIds).toEqual(['P8']);
  expect(p1Record?.opponentOutcomes.get('P8')).toEqual('WIN');
});

test('generateSwissPairings round 1 pairs by rating (top vs bottom half)', () => {
  const participantIds = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
  const adHocRatings = { P1: 2000, P2: 1800, P3: 1600, P4: 1400, P5: 1200, P6: 1000, P7: 800, P8: 600 };

  const { participantIdPairings } = generateSwissPairings({
    participantIds,
    adHocRatings,
    matchUps: [],
  });

  expect(participantIdPairings.length).toEqual(4);

  // round 1 FIDE-style: 1v5, 2v6, 3v7, 4v8
  const pairingStrings = participantIdPairings.map((p) => p.participantIds.sort().join('-'));
  expect(pairingStrings).toContain('P1-P5');
  expect(pairingStrings).toContain('P2-P6');
  expect(pairingStrings).toContain('P3-P7');
  expect(pairingStrings).toContain('P4-P8');
});

test('generateSwissPairings round 2 pairs within score groups', () => {
  const participantIds = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
  const adHocRatings = { P1: 2000, P2: 1800, P3: 1600, P4: 1400, P5: 1200, P6: 1000, P7: 800, P8: 600 };

  // after round 1: P1,P2,P3,P4 are 1-0; P5,P6,P7,P8 are 0-1
  const matchUps: any[] = [
    { matchUpId: 'm1', sides: [{ participantId: 'P1' }, { participantId: 'P5' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'm2', sides: [{ participantId: 'P2' }, { participantId: 'P6' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'm3', sides: [{ participantId: 'P3' }, { participantId: 'P7' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'm4', sides: [{ participantId: 'P4' }, { participantId: 'P8' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
  ];

  const { participantIdPairings, scoreGroups } = generateSwissPairings({
    participantIds,
    adHocRatings,
    matchUps,
  });

  expect(scoreGroups.length).toEqual(2);
  expect(participantIdPairings.length).toEqual(4);

  // all pairings should be within score groups:
  // winners group: {P1,P2,P3,P4} pairs among themselves
  // losers group: {P5,P6,P7,P8} pairs among themselves
  const winners = new Set(['P1', 'P2', 'P3', 'P4']);
  const losers = new Set(['P5', 'P6', 'P7', 'P8']);

  for (const pairing of participantIdPairings) {
    const [a, b] = pairing.participantIds;
    const bothWinners = winners.has(a) && winners.has(b);
    const bothLosers = losers.has(a) && losers.has(b);
    expect(bothWinners || bothLosers).toEqual(true);
  }
});

test('no repeat opponents across 3 rounds', () => {
  const participantIds = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
  const adHocRatings = { P1: 2000, P2: 1800, P3: 1600, P4: 1400, P5: 1200, P6: 1000, P7: 800, P8: 600 };

  // simulate 3 rounds
  const allMatchUps: any[] = [];

  for (let round = 1; round <= 3; round++) {
    const { participantIdPairings } = generateSwissPairings({
      matchUps: allMatchUps,
      participantIds,
      adHocRatings,
    });

    for (let i = 0; i < participantIdPairings.length; i++) {
      const [a, b] = participantIdPairings[i].participantIds;
      allMatchUps.push({
        matchUpId: `r${round}-m${i}`,
        sides: [{ participantId: a }, { participantId: b }],
        winningSide: a > b ? 1 : 2, // deterministic for test
        matchUpStatus: COMPLETED,
        roundNumber: round,
      });
    }
  }

  // verify all pairings are unique
  const pairings = allMatchUps.map((m) =>
    m.sides
      .map((s) => s.participantId)
      .sort()
      .join('-'),
  );
  const uniquePairings = unique(pairings);
  expect(pairings.length).toEqual(uniquePairings.length);
});

test('odd participant count handles bye correctly', () => {
  const participantIds = ['P1', 'P2', 'P3', 'P4', 'P5'];
  const adHocRatings = { P1: 2000, P2: 1800, P3: 1600, P4: 1400, P5: 1200 };

  const { participantIdPairings, byeParticipantId } = generateSwissPairings({
    participantIds,
    adHocRatings,
    matchUps: [],
  });

  expect(participantIdPairings.length).toEqual(2);
  expect(byeParticipantId).toBeDefined();

  // all 4 paired participants should be unique
  const pairedPids = participantIdPairings.flatMap((p) => p.participantIds);
  expect(unique(pairedPids).length).toEqual(4);

  // bye participant should not be in any pairing
  expect(pairedPids.includes(byeParticipantId!)).toEqual(false);
});

test('three score groups after 2 rounds with 8 participants', () => {
  const participantIds = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];

  // round 1: P1>P5, P2>P6, P3>P7, P4>P8
  // round 2: P1>P2, P3>P4, P5>P6, P7>P8
  // after round 2: P1=2-0, P2=1-1, P3=2-0, P4=1-1, P5=1-1, P6=0-2, P7=1-1, P8=0-2
  const matchUps: any[] = [
    { matchUpId: 'r1m1', sides: [{ participantId: 'P1' }, { participantId: 'P5' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'r1m2', sides: [{ participantId: 'P2' }, { participantId: 'P6' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'r1m3', sides: [{ participantId: 'P3' }, { participantId: 'P7' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'r1m4', sides: [{ participantId: 'P4' }, { participantId: 'P8' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'r2m1', sides: [{ participantId: 'P1' }, { participantId: 'P2' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 2 },
    { matchUpId: 'r2m2', sides: [{ participantId: 'P3' }, { participantId: 'P4' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 2 },
    { matchUpId: 'r2m3', sides: [{ participantId: 'P5' }, { participantId: 'P6' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 2 },
    { matchUpId: 'r2m4', sides: [{ participantId: 'P7' }, { participantId: 'P8' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 2 },
  ];

  const { scoreGroups } = computeScoreGroups({ participantIds, matchUps });

  expect(scoreGroups.length).toEqual(3);

  const group2_0 = scoreGroups.find((g) => g.wins === 2 && g.losses === 0);
  const group1_1 = scoreGroups.find((g) => g.wins === 1 && g.losses === 1);
  const group0_2 = scoreGroups.find((g) => g.wins === 0 && g.losses === 2);

  expect(group2_0?.participantIds.sort()).toEqual(['P1', 'P3']);
  expect(group1_1?.participantIds.sort()).toEqual(['P2', 'P4', 'P5', 'P7']);
  expect(group0_2?.participantIds.sort()).toEqual(['P6', 'P8']);
});

test('Buchholz tiebreaker computed correctly', () => {
  const participantIds = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];

  // round 1: P1>P5, P2>P6, P3>P7, P4>P8
  // round 2: P1>P2, P3>P4, P5>P6, P7>P8
  // round 3: P1>P3, P2>P5, P4>P7, P6>P8
  const matchUps: any[] = [
    { matchUpId: 'r1m1', sides: [{ participantId: 'P1' }, { participantId: 'P5' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'r1m2', sides: [{ participantId: 'P2' }, { participantId: 'P6' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'r1m3', sides: [{ participantId: 'P3' }, { participantId: 'P7' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'r1m4', sides: [{ participantId: 'P4' }, { participantId: 'P8' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'r2m1', sides: [{ participantId: 'P1' }, { participantId: 'P2' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 2 },
    { matchUpId: 'r2m2', sides: [{ participantId: 'P3' }, { participantId: 'P4' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 2 },
    { matchUpId: 'r2m3', sides: [{ participantId: 'P5' }, { participantId: 'P6' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 2 },
    { matchUpId: 'r2m4', sides: [{ participantId: 'P7' }, { participantId: 'P8' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 2 },
    { matchUpId: 'r3m1', sides: [{ participantId: 'P1' }, { participantId: 'P3' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 3 },
    { matchUpId: 'r3m2', sides: [{ participantId: 'P2' }, { participantId: 'P5' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 3 },
    { matchUpId: 'r3m3', sides: [{ participantId: 'P4' }, { participantId: 'P7' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 3 },
    { matchUpId: 'r3m4', sides: [{ participantId: 'P6' }, { participantId: 'P8' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 3 },
  ];

  const { records } = computeScoreGroups({ participantIds, matchUps });
  const standings = computeTiebreakers({ records, tiebreakMethods: ['BUCHHOLZ', 'SONNEBORN_BERGER'] });

  // P1: 3-0, opponents P5(1pt), P2(2pts), P3(2pts) → Buchholz = 5
  const p1 = standings.find((s) => s.participantId === 'P1');
  expect(p1?.wins).toEqual(3);
  expect(p1?.points).toEqual(3);
  expect(p1?.buchholz).toEqual(5);
  expect(p1?.rank).toEqual(1);

  // P1 Sonneborn-Berger: beat P5(1pt) + P2(2pts) + P3(2pts) = 5
  expect(p1?.sonnebornBerger).toEqual(5);

  // P8: 0-3, all opponents won against P8 → SB = 0
  const p8 = standings.find((s) => s.participantId === 'P8');
  expect(p8?.wins).toEqual(0);
  expect(p8?.sonnebornBerger).toEqual(0);
  expect(p8?.rank).toEqual(8);

  // standings should be sorted by points descending
  for (let i = 1; i < standings.length; i++) {
    expect(standings[i - 1].points).toBeGreaterThanOrEqual(standings[i].points);
  }
});

test('progressive score tiebreaker computed correctly', () => {
  const participantIds = ['P1', 'P2'];
  const matchUps: any[] = [
    { matchUpId: 'r1', sides: [{ participantId: 'P1' }, { participantId: 'P2' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
  ];

  const { records } = computeScoreGroups({ participantIds, matchUps });
  const standings = computeTiebreakers({ records, tiebreakMethods: ['PROGRESSIVE_SCORE'] });

  // P1: round 1 = 1pt. Progressive = 1
  const p1 = standings.find((s) => s.participantId === 'P1');
  expect(p1?.progressiveScore).toEqual(1);

  // P2: round 1 = 0. Progressive = 0
  const p2 = standings.find((s) => s.participantId === 'P2');
  expect(p2?.progressiveScore).toEqual(0);
});

test('16 participants, 4 rounds, all score groups correct', () => {
  const participantIds = Array.from({ length: 16 }, (_, i) => `P${i + 1}`);
  const adHocRatings = Object.fromEntries(participantIds.map((pid, i) => [pid, 2000 - i * 100]));

  const allMatchUps: any[] = [];

  for (let round = 1; round <= 4; round++) {
    const { participantIdPairings } = generateSwissPairings({
      matchUps: allMatchUps,
      participantIds,
      adHocRatings,
    });

    expect(participantIdPairings.length).toEqual(8);

    for (let i = 0; i < participantIdPairings.length; i++) {
      const [a, b] = participantIdPairings[i].participantIds;
      allMatchUps.push({
        matchUpId: `r${round}-m${i}`,
        sides: [{ participantId: a }, { participantId: b }],
        winningSide: 1, // top seed always wins for deterministic testing
        matchUpStatus: COMPLETED,
        roundNumber: round,
      });
    }
  }

  expect(allMatchUps.length).toEqual(32);

  // verify no repeat opponents
  const pairings = allMatchUps.map((m) =>
    m.sides
      .map((s) => s.participantId)
      .sort()
      .join('-'),
  );
  expect(unique(pairings).length).toEqual(pairings.length);

  // every participant played exactly 4 games
  const gameCounts = new Map<string, number>();
  for (const m of allMatchUps) {
    for (const side of m.sides) {
      gameCounts.set(side.participantId, (gameCounts.get(side.participantId) ?? 0) + 1);
    }
  }
  for (const pid of participantIds) {
    expect(gameCounts.get(pid)).toEqual(4);
  }

  // verify score groups after 4 rounds
  const { scoreGroups } = computeScoreGroups({ participantIds, matchUps: allMatchUps });
  expect(scoreGroups.length).toBeGreaterThanOrEqual(2);

  // sum of all participants in score groups should equal 16
  const totalInGroups = scoreGroups.reduce((sum, g) => sum + g.participantIds.length, 0);
  expect(totalInGroups).toEqual(16);
});

test('median Buchholz drops highest and lowest opponent scores', () => {
  const participantIds = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
  // 3 rounds so each player has 3 opponents — median drops top and bottom
  const matchUps: any[] = [
    { matchUpId: 'r1m1', sides: [{ participantId: 'P1' }, { participantId: 'P4' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'r1m2', sides: [{ participantId: 'P2' }, { participantId: 'P5' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'r1m3', sides: [{ participantId: 'P3' }, { participantId: 'P6' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'r2m1', sides: [{ participantId: 'P1' }, { participantId: 'P2' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 2 },
    { matchUpId: 'r2m2', sides: [{ participantId: 'P3' }, { participantId: 'P4' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 2 },
    { matchUpId: 'r2m3', sides: [{ participantId: 'P5' }, { participantId: 'P6' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 2 },
    { matchUpId: 'r3m1', sides: [{ participantId: 'P1' }, { participantId: 'P3' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 3 },
    { matchUpId: 'r3m2', sides: [{ participantId: 'P2' }, { participantId: 'P6' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 3 },
    { matchUpId: 'r3m3', sides: [{ participantId: 'P4' }, { participantId: 'P5' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 3 },
  ];

  // After 3 rounds: P1=3-0, P2=2-1, P3=2-1, P4=1-2, P5=1-2, P6=0-3
  const { records } = computeScoreGroups({ participantIds, matchUps });
  const standings = computeTiebreakers({ records, tiebreakMethods: ['BUCHHOLZ', 'MEDIAN_BUCHHOLZ'] });

  // P1: opponents P4(1pt), P2(2pts), P3(2pts) → Buchholz = 5, Median = 2 (drop 1 and 2)
  const p1 = standings.find((s) => s.participantId === 'P1');
  expect(p1?.buchholz).toEqual(5);
  expect(p1?.medianBuchholz).toEqual(2);

  // P6: opponents P3(2pts), P5(1pt), P2(2pts) → Buchholz = 5, Median = 2 (drop 1 and 2)
  const p6 = standings.find((s) => s.participantId === 'P6');
  expect(p6?.buchholz).toEqual(5);
  expect(p6?.medianBuchholz).toEqual(2);
});

test('tiebreaker cascade: Buchholz tie broken by Sonneborn-Berger', () => {
  const participantIds = ['P1', 'P2', 'P3', 'P4'];
  // 2 rounds: P1>P3, P2>P4, then P1>P4, P2>P3
  // P1: 2-0, opponents P3(0pts), P4(0pts) → Buchholz=0, SB=0
  // P2: 2-0, opponents P4(0pts), P3(0pts) → Buchholz=0, SB=0
  // Actually this gives identical tiebreakers. Let me make an asymmetric case.
  // Round 1: P1>P3, P2>P4. Round 2: P1>P2, P3>P4
  // P1: 2-0 (beat P3@1pt, P2@1pt) → Buchholz=2, SB=2
  // P2: 1-1 (beat P4@0pt, lost to P1@2pt) → Buchholz=2, SB=0
  // P3: 1-1 (lost to P1@2pt, beat P4@0pt) → Buchholz=2, SB=0
  // P4: 0-2 (lost to P2@1pt, lost to P3@1pt) → Buchholz=2, SB=0
  // P2 and P3 both 1-1 with Buchholz=2, SB=0 — still tied
  // Need a scenario where equal points, equal Buchholz, different SB
  // Round 1: P1>P4, P2>P3. Round 2: P1>P3, P2>P4. Round 3: P3>P4, P1>P2
  // P1: 3-0, P2: 2-1, P3: 1-2, P4: 0-3
  // But they're all different points. Need same points.
  // 4 players, 3 rounds — two at 2-1:
  // R1: P1>P3, P2>P4. R2: P3>P2, P4>P1. R3: P1>P2, P3>P4
  // P1: 2-1, beat P3(2pts) and P2(1pt), lost to P4(1pt) → Buchholz=4, SB=3
  // P3: 2-1, beat P2(1pt) and P4(1pt), lost to P1(2pts) → Buchholz=4, SB=2
  const matchUps: any[] = [
    { matchUpId: 'r1m1', sides: [{ participantId: 'P1' }, { participantId: 'P3' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'r1m2', sides: [{ participantId: 'P2' }, { participantId: 'P4' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'r2m1', sides: [{ participantId: 'P3' }, { participantId: 'P2' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 2 },
    { matchUpId: 'r2m2', sides: [{ participantId: 'P4' }, { participantId: 'P1' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 2 },
    { matchUpId: 'r3m1', sides: [{ participantId: 'P1' }, { participantId: 'P2' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 3 },
    { matchUpId: 'r3m2', sides: [{ participantId: 'P3' }, { participantId: 'P4' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 3 },
  ];

  const { records } = computeScoreGroups({ participantIds, matchUps });
  const standings = computeTiebreakers({ records, tiebreakMethods: ['BUCHHOLZ', 'SONNEBORN_BERGER'] });

  const p1 = standings.find((s) => s.participantId === 'P1');
  const p3 = standings.find((s) => s.participantId === 'P3');

  // both 2-1 with same Buchholz=4
  expect(p1?.points).toEqual(2);
  expect(p3?.points).toEqual(2);
  expect(p1?.buchholz).toEqual(4);
  expect(p3?.buchholz).toEqual(4);

  // P1 SB=3 (beat P3@2pts + P2@1pt), P3 SB=2 (beat P2@1pt + P4@1pt)
  expect(p1?.sonnebornBerger).toEqual(3);
  expect(p3?.sonnebornBerger).toEqual(2);

  // P1 should rank above P3 since SB breaks the tie
  expect(p1!.rank).toBeLessThan(p3!.rank);
});

test('draws tracked correctly when allowDraws is true', () => {
  const participantIds = ['P1', 'P2', 'P3', 'P4'];
  // simulate one round with draws — no winningSide but matchUpStatus COMPLETED
  const matchUps: any[] = [
    { matchUpId: 'r1m1', sides: [{ participantId: 'P1' }, { participantId: 'P2' }], matchUpStatus: COMPLETED, roundNumber: 1 },
    { matchUpId: 'r1m2', sides: [{ participantId: 'P3' }, { participantId: 'P4' }], winningSide: 1, matchUpStatus: COMPLETED, roundNumber: 1 },
  ];

  const { scoreGroups, records } = computeScoreGroups({ participantIds, matchUps, allowDraws: true });

  // P1 and P2 drew (0.5 pts each), P3 won (1pt), P4 lost (0pt)
  expect(records.get('P1')?.draws).toEqual(1);
  expect(records.get('P1')?.points).toEqual(0.5);
  expect(records.get('P2')?.draws).toEqual(1);
  expect(records.get('P2')?.points).toEqual(0.5);
  expect(records.get('P3')?.wins).toEqual(1);
  expect(records.get('P4')?.losses).toEqual(1);

  // 3 score groups: 1-0-0, 0-0-1, 0-1-0
  expect(scoreGroups.length).toEqual(3);
  expect(records.get('P1')?.opponentOutcomes.get('P2')).toEqual('DRAW');
});

test('full Swiss tournament via engine API', () => {
  const drawSize = 8;
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P' },
    drawProfiles: [
      {
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

  // generate round 1 using drawMatic (which works for SWISS drawType now)
  let result: any = tournamentEngine.drawMatic({
    generateMatchUps: true,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.matchUps.length).toEqual(4);

  const structureId = drawDefinition.structures[0].structureId;
  result = tournamentEngine.addAdHocMatchUps({
    matchUps: result.matchUps,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toEqual(4);
  expect(matchUps.every((m) => m.roundNumber === 1)).toEqual(true);
});
