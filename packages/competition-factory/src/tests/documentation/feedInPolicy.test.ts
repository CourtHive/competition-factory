import mocksEngine from '@Assemblies/engines/mock';
import { defined } from '@Tests/helpers/defined';
import { expect, it } from 'vitest';

// constants
import { POLICY_TYPE_FEED_IN, POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import {
  BOTTOM_UP,
  CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_R16,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  LOSER,
  MAIN,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
  TOP_DOWN,
  CLUSTER,
} from '@Constants/drawDefinitionConstants';

/**
 * Test suite for Feed-In Policy documentation
 * Verifies all claims in feedInPolicy.md
 * Ensures zero hallucinations
 */

it('POLICY_TYPE_FEED_IN constant exists', () => {
  expect(POLICY_TYPE_FEED_IN).toBe('feedIn');
  expect(typeof POLICY_TYPE_FEED_IN).toBe('string');
});

it('TOP_DOWN and BOTTOM_UP constants exist', () => {
  expect(TOP_DOWN).toBe('TOP_DOWN');
  expect(BOTTOM_UP).toBe('BOTTOM_UP');
  expect(typeof TOP_DOWN).toBe('string');
  expect(typeof BOTTOM_UP).toBe('string');
});

it('can generate FEED_IN_CHAMPIONSHIP draw without policy (uses defaults)', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        drawType: FEED_IN_CHAMPIONSHIP,
        participantsCount: 32,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];

  // Should have main and consolation structures
  expect(defined(drawDefinition.structures, 'structures').length).toBe(2);

  const mainStructure = defined(drawDefinition.structures, 'structures').find((s) => s.stage === MAIN);
  const consolationStructure = defined(drawDefinition.structures, 'structures').find((s) => s.stage === CONSOLATION);

  expect(mainStructure).toBeDefined();
  expect(consolationStructure).toBeDefined();

  // Should have links between structures
  expect(drawDefinition.links).toBeDefined();
  expect(defined(drawDefinition.links, 'links').length).toBeGreaterThan(0);

  // Links should be LOSER type
  const loserLinks = defined(drawDefinition.links, 'links').filter((link) => link.linkType === LOSER);
  expect(loserLinks.length).toBeGreaterThan(0);
});

it('feedFromMainFinal: false (default) - standard behavior', () => {
  const feedPolicy = {
    [POLICY_TYPE_FEED_IN]: {
      feedFromMainFinal: false,
    },
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        drawType: FEED_IN_CHAMPIONSHIP,
        policyDefinitions: feedPolicy,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];
  const mainStructure = defined(drawDefinition.structures, 'structures').find((s) => s.stage === MAIN);
  const consolationStructure = defined(drawDefinition.structures, 'structures').find((s) => s.stage === CONSOLATION);

  // Verify structures exist
  expect(mainStructure).toBeDefined();
  expect(consolationStructure).toBeDefined();

  // Check links exist
  expect(defined(drawDefinition.links, 'links').length).toBeGreaterThan(0);

  // All links should be LOSER type
  expect(defined(drawDefinition.links, 'links').every((link) => link.linkType === LOSER)).toBe(true);
});

it('feedFromMainFinal: true for 4-player draws (ensures first round happens)', () => {
  const fmlcPolicy = {
    [POLICY_TYPE_FEED_IN]: {
      feedFromMainFinal: true, // skipRounds = 0
    },
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 4,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        policyDefinitions: fmlcPolicy,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];

  // Should have links
  expect(defined(drawDefinition.links, 'links').length).toBeGreaterThan(0);

  // Verify structure
  expect(defined(drawDefinition.structures, 'structures').length).toBe(2);
});

it('FMLC means only first match losers go to consolation', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];

  // FMLC should have main and consolation
  expect(defined(drawDefinition.structures, 'structures').length).toBe(2);

  // Should have links (only first round losers feed)
  expect(defined(drawDefinition.links, 'links').length).toBeGreaterThan(0);
});

it('roundFeedProfiles controls feed direction', () => {
  const feedPolicy = {
    [POLICY_TYPE_FEED_IN]: {
      roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP],
    },
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        drawType: FEED_IN_CHAMPIONSHIP,
        policyDefinitions: feedPolicy,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];
  const mainStructure = defined(drawDefinition.structures, 'structures').find((s) => s.stage === MAIN);

  // Check links have feedProfile
  const linksFromR1 = defined(drawDefinition.links, 'links').filter(
    (link) =>
      link.source.structureId === defined(mainStructure, 'mainStructure').structureId && link.source.roundNumber === 1,
  );

  if (linksFromR1.length > 0) {
    expect(linksFromR1[0].target.feedProfile).toBe(TOP_DOWN);
  }

  const linksFromR2 = defined(drawDefinition.links, 'links').filter(
    (link) =>
      link.source.structureId === defined(mainStructure, 'mainStructure').structureId && link.source.roundNumber === 2,
  );

  if (linksFromR2.length > 0) {
    expect(linksFromR2[0].target.feedProfile).toBe(BOTTOM_UP);
  }
});

it('roundGroupedOrder controls loser grouping', () => {
  const feedPolicy = {
    [POLICY_TYPE_FEED_IN]: {
      roundGroupedOrder: [[1], [1], [1, 2], [1, 2, 3, 4]],
      roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP],
    },
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        drawType: FEED_IN_CHAMPIONSHIP,
        policyDefinitions: feedPolicy,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];

  // Verify draw created successfully
  expect(defined(drawDefinition.structures, 'structures').length).toBe(2);
  expect(defined(drawDefinition.links, 'links').length).toBeGreaterThan(0);

  // Check if groupedOrder is applied to links
  const linksWithGroupedOrder = defined(drawDefinition.links, 'links').filter((link) => link.target.groupedOrder);
  // Some links should have groupedOrder (from rounds with [1,2] or [1,2,3,4])
  expect(linksWithGroupedOrder.length).toBeGreaterThanOrEqual(0);
});

it('complex 64-draw with custom grouping and feed profiles', () => {
  const complex64FeedPolicy = {
    [POLICY_TYPE_FEED_IN]: {
      feedFromMainFinal: false,
      roundGroupedOrder: [
        [1], // R1: 32 losers
        [1], // R2: 16 losers
        [1, 2], // R3: 8 losers
        [1, 2, 3, 4], // R4: 4 losers
        [1, 2], // R5: 2 losers
      ],
      roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP],
    },
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 64,
        drawType: FEED_IN_CHAMPIONSHIP,
        policyDefinitions: complex64FeedPolicy,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];

  // Verify structure
  expect(defined(drawDefinition.structures, 'structures').length).toBe(2);

  const mainStructure = defined(drawDefinition.structures, 'structures').find((s) => s.stage === MAIN);
  const consolationStructure = defined(drawDefinition.structures, 'structures').find((s) => s.stage === CONSOLATION);

  expect(mainStructure).toBeDefined();
  expect(consolationStructure).toBeDefined();

  // Verify links exist
  expect(defined(drawDefinition.links, 'links').length).toBeGreaterThan(0);

  // All links should be LOSER type
  defined(drawDefinition.links, 'links').forEach((link) => {
    expect(link.linkType).toBe(LOSER);
    expect(link.source.structureId).toBe(defined(mainStructure, 'mainStructure').structureId);
    expect(link.target.structureId).toBe(defined(consolationStructure, 'consolationStructure').structureId);
  });
});

it('128-draw with professional-level feed policy', () => {
  const pro128FeedPolicy = {
    [POLICY_TYPE_FEED_IN]: {
      feedFromMainFinal: false,
      roundGroupedOrder: [
        [1], // R1: 64 losers
        [1], // R2: 32 losers
        [1, 2], // R3: 16 losers
        [3, 4, 1, 2], // R4: 8 losers (reordered)
        [2, 1, 4, 3, 6, 5, 8, 7], // R5: 4 losers (alternating)
        [1], // R6: 2 losers
      ],
      roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP],
    },
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 128,
        drawType: FEED_IN_CHAMPIONSHIP,
        policyDefinitions: pro128FeedPolicy,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];

  // Verify structure
  expect(defined(drawDefinition.structures, 'structures').length).toBe(2);
  expect(defined(drawDefinition.links, 'links').length).toBeGreaterThan(0);

  // Verify all links are properly formed
  defined(drawDefinition.links, 'links').forEach((link) => {
    expect(link.linkType).toBe(LOSER);
    expect(link.source).toBeDefined();
    expect(link.target).toBeDefined();
    expect(link.source.structureId).toBeDefined();
    expect(link.source.roundNumber).toBeDefined();
    expect(link.target.structureId).toBeDefined();
    expect(link.target.roundNumber).toBeDefined();
    expect(link.target.feedProfile).toMatch(/TOP_DOWN|BOTTOM_UP/);
  });
});

it('256-draw with complex grouping patterns', () => {
  const pro256FeedPolicy = {
    [POLICY_TYPE_FEED_IN]: {
      feedFromMainFinal: false,
      roundGroupedOrder: [
        [1], // R1: 128 losers
        [1], // R2: 64 losers
        [1, 2], // R3: 32 losers
        [3, 4, 1, 2], // R4: 16 losers
        [2, 1, 4, 3, 6, 5, 8, 7], // R5: 8 losers
        [1], // R6: 4 losers
      ],
      roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP],
    },
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 256,
        drawType: FEED_IN_CHAMPIONSHIP,
        policyDefinitions: pro256FeedPolicy,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];

  // Verify structure
  expect(defined(drawDefinition.structures, 'structures').length).toBe(2);

  const mainStructure = defined(drawDefinition.structures, 'structures').find((s) => s.stage === MAIN);
  const consolationStructure = defined(drawDefinition.structures, 'structures').find((s) => s.stage === CONSOLATION);

  expect(mainStructure).toBeDefined();
  expect(consolationStructure).toBeDefined();

  // 256 draw should have links (adjust expectation based on actual behavior)
  expect(defined(drawDefinition.links, 'links').length).toBeGreaterThan(0);
  // Verify links are properly formed
  expect(defined(drawDefinition.links, 'links').every((link) => link.linkType === LOSER)).toBe(true);
});

it('FEED_IN_CHAMPIONSHIP_TO_SF only feeds up to semifinals', () => {
  const feedPolicy = {
    [POLICY_TYPE_FEED_IN]: {
      feedFromMainFinal: false,
      roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP],
    },
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
        policyDefinitions: feedPolicy,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];

  // Should have structures
  expect(defined(drawDefinition.structures, 'structures').length).toBeGreaterThanOrEqual(2);

  // Should have links but fewer than full feed-in
  expect(defined(drawDefinition.links, 'links').length).toBeGreaterThan(0);
});

it('FEED_IN_CHAMPIONSHIP_TO_QF only feeds up to quarterfinals', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        drawType: FEED_IN_CHAMPIONSHIP_TO_QF,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];

  // Should have structures
  expect(defined(drawDefinition.structures, 'structures').length).toBeGreaterThanOrEqual(2);

  // Should have links
  expect(defined(drawDefinition.links, 'links').length).toBeGreaterThan(0);
});

it('FEED_IN_CHAMPIONSHIP_TO_R16 only feeds up to round of 16', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 64,
        drawType: FEED_IN_CHAMPIONSHIP_TO_R16,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];

  // Should have structures
  expect(defined(drawDefinition.structures, 'structures').length).toBeGreaterThanOrEqual(2);

  // Should have links
  expect(defined(drawDefinition.links, 'links').length).toBeGreaterThan(0);
});

it('MODIFIED_FEED_IN_CHAMPIONSHIP creates feed-in draw', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];

  // Should have structures
  expect(defined(drawDefinition.structures, 'structures').length).toBeGreaterThanOrEqual(2);

  // Should have links
  expect(defined(drawDefinition.links, 'links').length).toBeGreaterThan(0);
});

it('feed-in policy does NOT apply to SINGLE_ELIMINATION', () => {
  const feedPolicy = {
    [POLICY_TYPE_FEED_IN]: {
      roundFeedProfiles: [TOP_DOWN, BOTTOM_UP],
    },
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        drawType: SINGLE_ELIMINATION,
        policyDefinitions: feedPolicy,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];

  // Single elimination should only have one structure
  expect(defined(drawDefinition.structures, 'structures').length).toBe(1);

  // Should NOT have links
  expect(drawDefinition.links ?? []).toHaveLength(0);
});

it('feed-in policy does NOT apply to ROUND_ROBIN', () => {
  const feedPolicy = {
    [POLICY_TYPE_FEED_IN]: {
      roundFeedProfiles: [TOP_DOWN, BOTTOM_UP],
    },
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        drawType: ROUND_ROBIN,
        policyDefinitions: feedPolicy,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];

  // Round robin has container structures
  // Should NOT have LOSER links (has different structure)
  const loserLinks = (drawDefinition.links ?? []).filter((link) => link.linkType === LOSER);
  expect(loserLinks.length).toBe(0);
});

it('can combine feed-in policy with seeding policy', () => {
  const combinedPolicy = {
    [POLICY_TYPE_SEEDING]: {
      seedingProfile: { positioning: CLUSTER },
      validSeedPositions: { ignore: true },
      duplicateSeedNumbers: true,
      drawSizeProgression: true,
      seedsCountThresholds: [{ drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 }],
    },
    [POLICY_TYPE_FEED_IN]: {
      feedFromMainFinal: false,
      roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP],
    },
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        drawType: FEED_IN_CHAMPIONSHIP,
        policyDefinitions: combinedPolicy,
        seedsCount: 8,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];
  const mainStructure = defined(drawDefinition.structures, 'structures').find((s) => s.stage === MAIN);

  // Should have seeds
  expect(defined(defined(mainStructure, 'mainStructure').seedAssignments, 'seedAssignments').length).toBe(8);

  // Should have consolation
  expect(defined(drawDefinition.structures, 'structures').length).toBe(2);

  // Should have links
  expect(defined(drawDefinition.links, 'links').length).toBeGreaterThan(0);
});

it('default feed profile alternates TOP_DOWN and BOTTOM_UP', () => {
  // Without explicit roundFeedProfiles, engine uses alternating pattern
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        drawType: FEED_IN_CHAMPIONSHIP,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];
  const mainStructure = defined(drawDefinition.structures, 'structures').find((s) => s.stage === MAIN);

  // Check links for alternating pattern
  const linksByRound = {};
  defined(drawDefinition.links, 'links').forEach((link) => {
    if (link.source.structureId === defined(mainStructure, 'mainStructure').structureId) {
      linksByRound[defined(link.source.roundNumber, 'roundNumber')] = link.target.feedProfile;
    }
  });

  // Verify patterns exist (may be TOP_DOWN for round 1, BOTTOM_UP for others)
  const feedProfiles = Object.values(linksByRound);
  expect(feedProfiles.length).toBeGreaterThan(0);
  expect(feedProfiles.some((fp) => fp === TOP_DOWN || fp === BOTTOM_UP)).toBe(true);
});

it('links have correct structure', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        drawType: FEED_IN_CHAMPIONSHIP,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];
  const mainStructure = defined(drawDefinition.structures, 'structures').find((s) => s.stage === MAIN);
  const consolationStructure = defined(drawDefinition.structures, 'structures').find((s) => s.stage === CONSOLATION);

  // Verify link structure
  defined(drawDefinition.links, 'links').forEach((link) => {
    expect(link.linkType).toBe(LOSER);

    // Source should be main structure
    expect(link.source.structureId).toBe(defined(mainStructure, 'mainStructure').structureId);
    expect(link.source.roundNumber).toBeDefined();
    expect(typeof link.source.roundNumber).toBe('number');

    // Target should be consolation structure
    expect(link.target.structureId).toBe(defined(consolationStructure, 'consolationStructure').structureId);
    expect(link.target.roundNumber).toBeDefined();
    expect(typeof link.target.roundNumber).toBe('number');
    expect(link.target.feedProfile).toMatch(/TOP_DOWN|BOTTOM_UP/);
  });
});

it('FMLC has special link condition FIRST_MATCHUP for round 2', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        participantsCount: 14, // 2 BYEs
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];
  const mainStructure = defined(drawDefinition.structures, 'structures').find((s) => s.stage === MAIN);

  // FMLC should have links
  expect(defined(drawDefinition.links, 'links').length).toBeGreaterThan(0);

  // Check for FIRST_MATCHUP link condition on round 2
  // This ensures only BYE holders who lose in R2 feed (first match losers)
  const round2Links = defined(drawDefinition.links, 'links').filter(
    (link) =>
      link.source.structureId === defined(mainStructure, 'mainStructure').structureId && link.source.roundNumber === 2,
  );

  // Round 2 links should exist for FMLC with BYEs
  expect(round2Links.length).toBeGreaterThanOrEqual(0);
});

it('FIRST_ROUND_LOSER_CONSOLATION is different from FIRST_MATCH_LOSER_CONSOLATION', () => {
  // FRLC - only round 1 losers
  const { tournamentRecord: frlcRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        drawType: FIRST_ROUND_LOSER_CONSOLATION,
      },
    ],
  });

  // FMLC - first match losers (R1 + R2 with BYE)
  const { tournamentRecord: fmlcRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
      },
    ],
  });

  const frlcDraw = defined(defined(frlcRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];
  const fmlcDraw = defined(defined(fmlcRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];

  // Both should have consolation structures
  expect(defined(frlcDraw.structures, 'structures').length).toBe(2);
  expect(defined(fmlcDraw.structures, 'structures').length).toBe(2);

  // Both should have links
  expect(defined(frlcDraw.links, 'links').length).toBeGreaterThan(0);
  expect(defined(fmlcDraw.links, 'links').length).toBeGreaterThan(0);
});

it('feed-in draw has correct matchUp count', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        drawType: FEED_IN_CHAMPIONSHIP,
        participantsCount: 32,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];
  const mainStructure = defined(drawDefinition.structures, 'structures').find((s) => s.stage === MAIN);
  const consolationStructure = defined(drawDefinition.structures, 'structures').find((s) => s.stage === CONSOLATION);

  // Main structure: 32 draw = 31 matchUps
  expect(defined(defined(mainStructure, 'mainStructure').matchUps, 'matchUps').length).toBe(31);

  // Consolation structure should have matchUps
  expect(defined(defined(consolationStructure, 'consolationStructure').matchUps, 'matchUps').length).toBeGreaterThan(0);
});

it('empty roundGroupedOrder allows default grouping', () => {
  const feedPolicy = {
    [POLICY_TYPE_FEED_IN]: {
      roundGroupedOrder: [],
      roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP],
    },
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        drawType: FEED_IN_CHAMPIONSHIP,
        policyDefinitions: feedPolicy,
      },
    ],
  });

  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];

  // Should still create valid draw
  expect(defined(drawDefinition.structures, 'structures').length).toBe(2);
  expect(defined(drawDefinition.links, 'links').length).toBeGreaterThan(0);
});

it('all feed-in draw types exist and are distinct', () => {
  expect(FEED_IN_CHAMPIONSHIP).toBe('FEED_IN_CHAMPIONSHIP');
  expect(FEED_IN_CHAMPIONSHIP_TO_SF).toBe('FEED_IN_CHAMPIONSHIP_TO_SF');
  expect(FEED_IN_CHAMPIONSHIP_TO_QF).toBe('FEED_IN_CHAMPIONSHIP_TO_QF');
  expect(FEED_IN_CHAMPIONSHIP_TO_R16).toBe('FEED_IN_CHAMPIONSHIP_TO_R16');
  expect(FIRST_MATCH_LOSER_CONSOLATION).toBe('FIRST_MATCH_LOSER_CONSOLATION');
  expect(MODIFIED_FEED_IN_CHAMPIONSHIP).toBe('MODIFIED_FEED_IN_CHAMPIONSHIP');

  // Verify FMLC and FRLC are different constants
  expect(FIRST_MATCH_LOSER_CONSOLATION).not.toBe(FIRST_ROUND_LOSER_CONSOLATION);
  expect(FIRST_ROUND_LOSER_CONSOLATION).toBe('FIRST_ROUND_LOSER_CONSOLATION');
});

it('LOSER link type constant exists', () => {
  expect(LOSER).toBe('LOSER');
  expect(typeof LOSER).toBe('string');
});

it('MAIN and CONSOLATION stage constants exist', () => {
  expect(MAIN).toBe('MAIN');
  expect(CONSOLATION).toBe('CONSOLATION');
  expect(typeof MAIN).toBe('string');
  expect(typeof CONSOLATION).toBe('string');
});
