import { buildDrawHierarchy, collapseHierarchy } from '@Generators/drawDefinitions/drawHierarchy';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { FEED_IN } from '@Constants/drawDefinitionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';

// ─── validMatchUps / empty array guard (line 44) ───────────────────────────

test('returns empty object for empty matchUps array', () => {
  const result = buildDrawHierarchy({ matchUps: [] });
  expect(result).toEqual({});
});

test('returns empty object for invalid matchUps (missing matchUpId)', () => {
  // validMatchUp requires matchUpId to be a string
  const result = buildDrawHierarchy({
    matchUps: [{ drawPositions: [1, 2], sides: [{}, {}] }],
  });
  expect(result).toEqual({});
});

// ─── getAdvancingParticipantId: BYE branch (lines 225-226) ─────────────────

test('hierarchy handles BYE matchUps with participantIds in sides', () => {
  // Build a minimal 4-draw with BYEs in round 1
  // Round 1: two matchUps, one is a BYE
  // Round 2: one matchUp (the final)
  const matchUps = [
    {
      matchUpId: 'r1m1',
      roundNumber: 1,
      roundPosition: 1,
      drawPositions: [1, 2],
      matchUpStatus: BYE,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, drawPosition: 2 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 2,
      finishingPositionRange: '3-4',
    },
    {
      matchUpId: 'r1m2',
      roundNumber: 1,
      roundPosition: 2,
      drawPositions: [3, 4],
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p3', drawPosition: 3 },
        { sideNumber: 2, participantId: 'p4', drawPosition: 4 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 2,
      finishingPositionRange: '3-4',
    },
    {
      matchUpId: 'r2m1',
      roundNumber: 2,
      roundPosition: 1,
      drawPositions: [1, 3],
      winningSide: 2,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, participantId: 'p3', drawPosition: 3 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 1,
      finishingPositionRange: '1-2',
    },
  ];

  const result = buildDrawHierarchy({ matchUps });
  expect(result.hierarchy).toBeDefined();
  expect(result.hierarchy.children).toHaveLength(2);
  // The BYE matchUp's advancing participant should be p1
  // Round 2 children should be the two round 1 matchUps
  const child0 = result.hierarchy.children[0];
  const child1 = result.hierarchy.children[1];
  // child0 is r1m1, child1 is r1m2
  expect(child0.matchUpId).toBe('r1m1');
  expect(child1.matchUpId).toBe('r1m2');
});

// ─── getAdvancingParticipantId: no winningSide (line 228) ───────────────────

test('hierarchy handles matchUps without winningSide', () => {
  // Incomplete draw: round 1 has results but round 2 does not
  const matchUps = [
    {
      matchUpId: 'r1m1',
      roundNumber: 1,
      roundPosition: 1,
      drawPositions: [1, 2],
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, participantId: 'p2', drawPosition: 2 },
      ],
      drawId: 'd1',
      structureId: 's1',
    },
    {
      matchUpId: 'r1m2',
      roundNumber: 1,
      roundPosition: 2,
      drawPositions: [3, 4],
      // no winningSide — match not yet played
      sides: [
        { sideNumber: 1, participantId: 'p3', drawPosition: 3 },
        { sideNumber: 2, participantId: 'p4', drawPosition: 4 },
      ],
      drawId: 'd1',
      structureId: 's1',
    },
    {
      matchUpId: 'r2m1',
      roundNumber: 2,
      roundPosition: 1,
      drawPositions: [1, 3],
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, drawPosition: 3 },
      ],
      drawId: 'd1',
      structureId: 's1',
    },
  ];

  const result = buildDrawHierarchy({ matchUps });
  expect(result.hierarchy).toBeDefined();
  expect(result.maxRound).toBe(2);
});

// ─── Feed round branch (lines 174-204) ─────────────────────────────────────

test('hierarchy handles feed rounds (same matchUp count as previous round)', () => {
  // Simulate a feed-in draw: R1 has 2 matchUps, R2 has 2 matchUps (feed round), R3 has 1 matchUp
  // In R2, draw positions 5 and 6 are fed in (not present in R1)
  const matchUps = [
    {
      matchUpId: 'r1m1',
      roundNumber: 1,
      roundPosition: 1,
      drawPositions: [1, 2],
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, participantId: 'p2', drawPosition: 2 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 3,
    },
    {
      matchUpId: 'r1m2',
      roundNumber: 1,
      roundPosition: 2,
      drawPositions: [3, 4],
      winningSide: 2,
      sides: [
        { sideNumber: 1, participantId: 'p3', drawPosition: 3 },
        { sideNumber: 2, participantId: 'p4', drawPosition: 4 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 3,
    },
    // Feed round: 2 matchUps (same count as R1)
    // draw position 5 is fed into R2M1, draw position 6 fed into R2M2
    {
      matchUpId: 'r2m1',
      roundNumber: 2,
      roundPosition: 1,
      drawPositions: [5, 1],
      winningSide: 2,
      sides: [
        { sideNumber: 1, participantId: 'p5', drawPosition: 5 },
        { sideNumber: 2, participantId: 'p1', drawPosition: 1 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 2,
    },
    {
      matchUpId: 'r2m2',
      roundNumber: 2,
      roundPosition: 2,
      drawPositions: [6, 4],
      winningSide: 2,
      sides: [
        { sideNumber: 1, participantId: 'p6', drawPosition: 6 },
        { sideNumber: 2, participantId: 'p4', drawPosition: 4 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 2,
    },
    // Final
    {
      matchUpId: 'r3m1',
      roundNumber: 3,
      roundPosition: 1,
      drawPositions: [1, 4],
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, participantId: 'p4', drawPosition: 4 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 1,
    },
  ];

  const result = buildDrawHierarchy({ matchUps });
  expect(result.hierarchy).toBeDefined();
  expect(result.maxRound).toBe(3);
  expect(result.finalRound).toBe(3);
  // The hierarchy root is the final matchUp (R3M1)
  expect(result.hierarchy.matchUpId).toBe('r3m1');
  // Its children should be the two R2 matchUps
  expect(result.hierarchy.children).toHaveLength(2);
  expect(result.hierarchy.children[0].matchUpId).toBe('r2m1');
  expect(result.hierarchy.children[1].matchUpId).toBe('r2m2');
  // Feed round children: first child is the fed-in participant, second is previous round node
  const feedChild0 = result.hierarchy.children[0].children;
  expect(feedChild0).toHaveLength(2);
  // The fed side should have a feedRoundNumber
  expect(feedChild0[0].feedRoundNumber).toBe(1);
  // The second child is the previous round's first matchUp node (r1m1)
  expect(feedChild0[1].matchUpId).toBe('r1m1');
});

// ─── Missing draw positions / second round entries (lines 106-136) ──────────

test('hierarchy generates missing round 1 matchUps for feed-in entries', () => {
  // Simulate a draw where:
  // - R1 has 1 matchUp with positions [1,2]
  // - R2 has 1 matchUp with positions [1,4] (position 4 is a second-round entry)
  // - allDrawPositions = [1,2,4], max = 4
  // - expectedDrawPositions = [1,2,3,4]
  // - missingDrawPositions = [3]
  // - secondRoundEntries = [4] (in R2 but not R1)
  // - missingDrawPositions.length (1) === secondRoundEntries.length (1) → generates BYE matchUp
  //
  // Then add a second such pair:
  // - R1 also has [5,6], R2 also has [6,8]
  // - allDrawPositions = [1,2,4,5,6,8], max = 8
  // - expectedDrawPositions = [1..8]
  // - missingDrawPositions = [3, 7]
  // - secondRoundEntries = [4, 8]
  // - counts match (2 === 2) → generates 2 BYE matchUps
  const matchUps = [
    {
      matchUpId: 'r1m1',
      roundNumber: 1,
      roundPosition: 1,
      drawPositions: [1, 2],
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, participantId: 'p2', drawPosition: 2 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 3,
      finishingPositionRange: '5-8',
    },
    {
      matchUpId: 'r1m2',
      roundNumber: 1,
      roundPosition: 3,
      drawPositions: [5, 6],
      winningSide: 2,
      sides: [
        { sideNumber: 1, participantId: 'p5', drawPosition: 5 },
        { sideNumber: 2, participantId: 'p6', drawPosition: 6 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 3,
      finishingPositionRange: '5-8',
    },
    // R2: positions 4 and 8 are "second round entries" (not in R1)
    {
      matchUpId: 'r2m1',
      roundNumber: 2,
      roundPosition: 1,
      drawPositions: [1, 4],
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, participantId: 'p4', drawPosition: 4 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 2,
    },
    {
      matchUpId: 'r2m2',
      roundNumber: 2,
      roundPosition: 2,
      drawPositions: [6, 8],
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p6', drawPosition: 6 },
        { sideNumber: 2, participantId: 'p8', drawPosition: 8 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 2,
    },
    {
      matchUpId: 'r3m1',
      roundNumber: 3,
      roundPosition: 1,
      drawPositions: [1, 6],
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, participantId: 'p6', drawPosition: 6 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 1,
    },
  ];

  const result = buildDrawHierarchy({ matchUps });
  expect(result.hierarchy).toBeDefined();
  // missingMatchUps should have been generated for the gaps
  expect(result.missingMatchUps.length).toBe(2);
  // The missing matchUps should be BYE matchUps in round 1
  result.missingMatchUps.forEach((m: any) => {
    expect(m.roundNumber).toBe(1);
    expect(m.matchUpStatus).toBe('BYE');
    expect(m.drawId).toBe('d1');
    expect(m.structureId).toBe('s1');
    expect(m.sides).toBeDefined();
    expect(m.drawPositions).toBeDefined();
  });
  // The total matchUps should include the generated ones
  expect(result.matchUps.length).toBeGreaterThan(matchUps.length);
});

test('missing matchUps have correct side data from second round entries', () => {
  // R1 has [1,2], R2 has [1,3], max position is 4
  // allDrawPositions = [1,2,3], expectedDrawPositions = [1,2,3,4]
  // missingDrawPositions = [4]
  // secondRoundEntries = [3] (in R2 but not R1)
  // missingDrawPositions.length (1) === secondRoundEntries.length (1) → generates 1 BYE matchUp
  const matchUps = [
    {
      matchUpId: 'r1m1',
      roundNumber: 1,
      roundPosition: 1,
      drawPositions: [1, 2],
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, participantId: 'p2', drawPosition: 2 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 2,
      finishingPositionRange: '3-4',
    },
    {
      matchUpId: 'r2m1',
      roundNumber: 2,
      roundPosition: 1,
      drawPositions: [1, 4],
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, participantId: 'p3', drawPosition: 4 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 1,
    },
  ];

  // allDrawPositions = [1,2,4], max=4, expected=[1,2,3,4], missing=[3]
  // secondRoundEntries = [4] (in R2 but not R1)
  // missing.length (1) === secondRoundEntries.length (1) → condition met
  const result = buildDrawHierarchy({ matchUps });
  expect(result.hierarchy).toBeDefined();
  expect(result.missingMatchUps.length).toBe(1);
  const generated = result.missingMatchUps[0];
  // The generated matchUp should pair the second round entry (4) with missing position (3)
  expect(generated.drawPositions).toContain(3);
  expect(generated.drawPositions).toContain(4);
  expect(generated.roundNumber).toBe(1);
  expect(generated.matchUpStatus).toBe('BYE');
  // Side for position 4 should come from entry sides (participantId: 'p3')
  const sideWithParticipant = generated.sides.find((s: any) => s.participantId === 'p3');
  expect(sideWithParticipant).toBeDefined();
  // Side for position 3 should be a bye side (not in entrySides)
  const byeSide = generated.sides.find((s: any) => s.bye === true);
  expect(byeSide).toBeDefined();
  expect(byeSide.drawPosition).toBe(3);
});

// ─── Additional rounds logic (lines 66-88) ─────────────────────────────────

test('hierarchy generates additional rounds when max round has multiple matchUps', () => {
  // Create a scenario where the "last" round has more than 1 matchUp
  // meaning the draw data is incomplete and additional rounds need to be generated
  // 4 matchUps in round 1 (8-player draw), but only round 1 provided
  const matchUps = [
    {
      matchUpId: 'r1m1',
      roundNumber: 1,
      roundPosition: 1,
      drawPositions: [1, 2],
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, participantId: 'p2', drawPosition: 2 },
      ],
      drawId: 'd1',
      structureId: 's1',
    },
    {
      matchUpId: 'r1m2',
      roundNumber: 1,
      roundPosition: 2,
      drawPositions: [3, 4],
      winningSide: 2,
      sides: [
        { sideNumber: 1, participantId: 'p3', drawPosition: 3 },
        { sideNumber: 2, participantId: 'p4', drawPosition: 4 },
      ],
      drawId: 'd1',
      structureId: 's1',
    },
    {
      matchUpId: 'r1m3',
      roundNumber: 1,
      roundPosition: 3,
      drawPositions: [5, 6],
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p5', drawPosition: 5 },
        { sideNumber: 2, participantId: 'p6', drawPosition: 6 },
      ],
      drawId: 'd1',
      structureId: 's1',
    },
    {
      matchUpId: 'r1m4',
      roundNumber: 1,
      roundPosition: 4,
      drawPositions: [7, 8],
      winningSide: 2,
      sides: [
        { sideNumber: 1, participantId: 'p7', drawPosition: 7 },
        { sideNumber: 2, participantId: 'p8', drawPosition: 8 },
      ],
      drawId: 'd1',
      structureId: 's1',
    },
  ];

  // maxRound = 1, maxRoundMatchUpsCount = 4
  // additionalRounds = Math.ceil(Math.log(4) / Math.log(2)) = 2
  const result = buildDrawHierarchy({ matchUps });
  expect(result.hierarchy).toBeDefined();
  expect(result.maxRound).toBe(1);
  // finalRound should be maxRound + additionalRounds = 1 + 2 = 3
  expect(result.finalRound).toBe(3);
  // Additional matchUps should have been generated for rounds 2 and 3
  const round2 = result.matchUps.filter((m: any) => m.roundNumber === 2);
  const round3 = result.matchUps.filter((m: any) => m.roundNumber === 3);
  expect(round2.length).toBe(2); // 2 semifinal matchUps
  expect(round3.length).toBe(1); // 1 final matchUp
  // Generated matchUps should have empty drawPositions and sides
  round2.forEach((m: any) => {
    expect(m.drawPositions).toEqual([]);
    expect(m.sides).toEqual([]);
  });
  round3.forEach((m: any) => {
    expect(m.drawPositions).toEqual([]);
    expect(m.sides).toEqual([]);
  });
});

test('no additional rounds when max round has exactly 1 matchUp', () => {
  // A complete 4-player draw — all rounds present
  const matchUps = [
    {
      matchUpId: 'r1m1',
      roundNumber: 1,
      roundPosition: 1,
      drawPositions: [1, 2],
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, participantId: 'p2', drawPosition: 2 },
      ],
      drawId: 'd1',
      structureId: 's1',
    },
    {
      matchUpId: 'r1m2',
      roundNumber: 1,
      roundPosition: 2,
      drawPositions: [3, 4],
      winningSide: 2,
      sides: [
        { sideNumber: 1, participantId: 'p3', drawPosition: 3 },
        { sideNumber: 2, participantId: 'p4', drawPosition: 4 },
      ],
      drawId: 'd1',
      structureId: 's1',
    },
    {
      matchUpId: 'r2m1',
      roundNumber: 2,
      roundPosition: 1,
      drawPositions: [1, 4],
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, participantId: 'p4', drawPosition: 4 },
      ],
      drawId: 'd1',
      structureId: 's1',
    },
  ];

  const result = buildDrawHierarchy({ matchUps });
  expect(result.finalRound).toBe(2);
  expect(result.maxRound).toBe(2);
  // No additional matchUps generated
  expect(result.matchUps.length).toBe(3);
  expect(result.missingMatchUps.length).toBe(0);
});

// ─── Feed round with BYE advancing participant (feed + BYE interaction) ─────

test('feed round correctly identifies fed participants vs previous round winners', () => {
  // R1: 2 matchUps (positions 1-4), one BYE
  // R2: 2 matchUps (feed round, positions 5,6 fed in)
  // R3: 1 matchUp (final)
  const matchUps = [
    {
      matchUpId: 'r1m1',
      roundNumber: 1,
      roundPosition: 1,
      drawPositions: [1, 2],
      matchUpStatus: BYE,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, drawPosition: 2 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 3,
    },
    {
      matchUpId: 'r1m2',
      roundNumber: 1,
      roundPosition: 2,
      drawPositions: [3, 4],
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p3', drawPosition: 3 },
        { sideNumber: 2, participantId: 'p4', drawPosition: 4 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 3,
    },
    // Feed round: positions 5, 6 are new entries
    {
      matchUpId: 'r2m1',
      roundNumber: 2,
      roundPosition: 1,
      drawPositions: [5, 1],
      winningSide: 2,
      sides: [
        { sideNumber: 1, participantId: 'p5', drawPosition: 5 },
        { sideNumber: 2, participantId: 'p1', drawPosition: 1 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 2,
    },
    {
      matchUpId: 'r2m2',
      roundNumber: 2,
      roundPosition: 2,
      drawPositions: [6, 3],
      winningSide: 2,
      sides: [
        { sideNumber: 1, participantId: 'p6', drawPosition: 6 },
        { sideNumber: 2, participantId: 'p3', drawPosition: 3 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 2,
    },
    {
      matchUpId: 'r3m1',
      roundNumber: 3,
      roundPosition: 1,
      drawPositions: [1, 3],
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, participantId: 'p3', drawPosition: 3 },
      ],
      drawId: 'd1',
      structureId: 's1',
      finishingRound: 1,
    },
  ];

  const result = buildDrawHierarchy({ matchUps });
  expect(result.hierarchy).toBeDefined();

  // Root is final (R3)
  expect(result.hierarchy.matchUpId).toBe('r3m1');
  const r2Children = result.hierarchy.children;
  expect(r2Children).toHaveLength(2);

  // R2M1 children: fed participant (p5) and previous round matchUp (r1m1)
  const r2m1Children = r2Children[0].children;
  expect(r2m1Children).toHaveLength(2);
  expect(r2m1Children[0].feedRoundNumber).toBe(1);
  expect(r2m1Children[1].matchUpId).toBe('r1m1');

  // R2M2 children: fed participant (p6) and previous round matchUp (r1m2)
  const r2m2Children = r2Children[1].children;
  expect(r2m2Children).toHaveLength(2);
  expect(r2m2Children[0].feedRoundNumber).toBe(1);
  expect(r2m2Children[1].matchUpId).toBe('r1m2');
});

// ─── collapseHierarchy: node.depth >= depth sets _height (line 233-234) ─────

test('collapseHierarchy sets _height on nodes at depth >= target', () => {
  const node: any = {
    depth: 3,
    height: 5,
    children: [{ depth: 4, height: 0 }],
  };

  collapseHierarchy(node, 3);

  expect(node._height).toBe(5);
  expect(node.height).toBe(0);
  expect(node._children).toEqual([{ depth: 4, height: 0 }]);
  expect(node.children).toBeUndefined();
});

test('collapseHierarchy handles deeply nested collapse', () => {
  const leaf1: any = { depth: 3, height: 0 };
  const leaf2: any = { depth: 3, height: 0 };
  const mid1: any = { depth: 2, height: 1, children: [leaf1] };
  const mid2: any = { depth: 2, height: 1, children: [leaf2] };
  const root: any = { depth: 0, height: 3, children: [{ depth: 1, height: 2, children: [mid1, mid2] }] };

  collapseHierarchy(root, 2);

  // Nodes at depth 2 should be collapsed
  expect(mid1._children).toEqual([leaf1]);
  expect(mid1.children).toBeUndefined();
  expect(mid1._height).toBe(1);
  expect(mid1.height).toBe(0);

  // Root and depth 1 should still have children
  expect(root.children).toBeDefined();
  expect(root.children[0].children).toBeDefined();
});

// ─── Integration: using engine-generated FEED_IN draw ───────────────────────

test('buildDrawHierarchy works with engine-generated feed-in draw', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: FEED_IN, completionGoal: 7 }],
    setState: true,
  });
  const { matchUps } = tournamentEngine.allTournamentMatchUps();

  const result = buildDrawHierarchy({ matchUps });
  expect(result.hierarchy).toBeDefined();
  expect(result.hierarchy.children).toBeDefined();
  expect(result.maxRound).toBeGreaterThanOrEqual(2);
});

// ─── Single matchUpType (no filtering needed, line 32 false branch) ─────────

test('hierarchy works with single matchUpType (no filtering branch)', () => {
  const matchUps = [
    {
      matchUpId: 'r1m1',
      roundNumber: 1,
      roundPosition: 1,
      drawPositions: [1, 2],
      matchUpType: 'SINGLES',
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, participantId: 'p2', drawPosition: 2 },
      ],
      drawId: 'd1',
      structureId: 's1',
    },
    {
      matchUpId: 'r1m2',
      roundNumber: 1,
      roundPosition: 2,
      drawPositions: [3, 4],
      matchUpType: 'SINGLES',
      winningSide: 2,
      sides: [
        { sideNumber: 1, participantId: 'p3', drawPosition: 3 },
        { sideNumber: 2, participantId: 'p4', drawPosition: 4 },
      ],
      drawId: 'd1',
      structureId: 's1',
    },
    {
      matchUpId: 'r2m1',
      roundNumber: 2,
      roundPosition: 1,
      drawPositions: [1, 4],
      matchUpType: 'SINGLES',
      winningSide: 1,
      sides: [
        { sideNumber: 1, participantId: 'p1', drawPosition: 1 },
        { sideNumber: 2, participantId: 'p4', drawPosition: 4 },
      ],
      drawId: 'd1',
      structureId: 's1',
    },
  ];

  const result = buildDrawHierarchy({ matchUps });
  expect(result.hierarchy).toBeDefined();
});

// ─── matchUpType parameter filters before other logic ───────────────────────

test('matchUpType parameter that filters all matchUps returns empty', () => {
  const matchUps = [
    {
      matchUpId: 'r1m1',
      roundNumber: 1,
      roundPosition: 1,
      drawPositions: [1, 2],
      matchUpType: 'SINGLES',
      sides: [
        { sideNumber: 1, drawPosition: 1 },
        { sideNumber: 2, drawPosition: 2 },
      ],
    },
  ];

  // Filter by TEAM — no matchUps match
  const result = buildDrawHierarchy({ matchUps, matchUpType: 'TEAM' });
  expect(result).toEqual({});
});
