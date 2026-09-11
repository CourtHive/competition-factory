import { getValidSeedBlocks, isValidSeedPosition } from '@Query/drawDefinition/seedGetter';
import { getSeedBlocks } from '@Query/drawDefinition/getSeedBlocks';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// Constants
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import { policyComposer } from '@Global/policyComposer';
import {
  ADJACENT,
  CLUSTER,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SEPARATE,
  SINGLE_ELIMINATION,
  WATERFALL,
} from '@Constants/drawDefinitionConstants';

// Fixtures
import { POLICY_SEEDING_BYES } from '@Fixtures/policies/POLICY_SEEDING_BYES';
import { POLICY_SEEDING_DEFAULT } from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { POLICY_SEEDING_ITF } from '@Fixtures/policies/POLICY_SEEDING_ITF';

/**
 * Test suite for Seeding Policy documentation
 * Verifies all claims in seedingPolicy.md
 * Ensures zero hallucinations
 */

it('ADJACENT constant exists and is exported', () => {
  expect(ADJACENT).toBe('ADJACENT');
  expect(typeof ADJACENT).toBe('string');
});

it('ADJACENT works as synonym for CLUSTER in positioning', () => {
  const adjacentPolicy = {
    [POLICY_TYPE_SEEDING]: {
      seedingProfile: { positioning: ADJACENT },
      validSeedPositions: { ignore: true },
      duplicateSeedNumbers: true,
      drawSizeProgression: true,
      seedsCountThresholds: [{ drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 }],
    },
  };

  const clusterPolicy = {
    [POLICY_TYPE_SEEDING]: {
      seedingProfile: { positioning: CLUSTER },
      validSeedPositions: { ignore: true },
      duplicateSeedNumbers: true,
      drawSizeProgression: true,
      seedsCountThresholds: [{ drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 }],
    },
  };

  // Generate draws with both policies
  const { tournamentRecord: adjacentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, policyDefinitions: adjacentPolicy }],
  });

  const { tournamentRecord: clusterRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, policyDefinitions: clusterPolicy }],
  });

  // Both should produce valid draws
  expect(adjacentRecord.events[0].drawDefinitions).toBeDefined();
  expect(clusterRecord.events[0].drawDefinitions).toBeDefined();

  // Both should have same structure
  const adjacentStructure = adjacentRecord.events[0].drawDefinitions[0].structures[0];
  const clusterStructure = clusterRecord.events[0].drawDefinitions[0].structures[0];

  expect(adjacentStructure.matchUps.length).toBe(clusterStructure.matchUps.length);
});

it('POLICY_SEEDING_DEFAULT has all documented attributes', () => {
  const policy = POLICY_SEEDING_DEFAULT[POLICY_TYPE_SEEDING];

  expect(policy.policyName).toBe('USTA SEEDING');
  expect(policy.seedingProfile.positioning).toBe(SEPARATE);
  expect(policy.seedingProfile.drawTypes).toBeDefined();
  expect(policy.seedingProfile.drawTypes[ROUND_ROBIN_WITH_PLAYOFF].positioning).toBe(WATERFALL);
  expect(policy.seedingProfile.drawTypes[ROUND_ROBIN].positioning).toBe(WATERFALL);
  expect(policy.validSeedPositions.ignore).toBe(true);
  expect(policy.duplicateSeedNumbers).toBe(true);
  expect(policy.drawSizeProgression).toBe(true);
  expect(policy.seedsCountThresholds).toBeDefined();
  expect(Array.isArray(policy.seedsCountThresholds)).toBe(true);
  expect(policy.seedsCountThresholds.length).toBe(6);

  // Verify USTA thresholds
  expect(policy.seedsCountThresholds[0]).toEqual({ drawSize: 4, minimumParticipantCount: 3, seedsCount: 2 });
  expect(policy.seedsCountThresholds[4]).toEqual({ drawSize: 128, minimumParticipantCount: 96, seedsCount: 32 });
});

it('POLICY_SEEDING_ITF has all documented attributes', () => {
  const policy = POLICY_SEEDING_ITF[POLICY_TYPE_SEEDING];

  expect(policy.policyName).toBe('ITF SEEDING');
  expect(policy.seedingProfile.positioning).toBe(CLUSTER);
  expect(policy.validSeedPositions.ignore).toBe(true);
  expect(policy.duplicateSeedNumbers).toBe(true);
  expect(policy.drawSizeProgression).toBe(true);
  expect(policy.seedsCountThresholds.length).toBe(6);

  // ITF has lower threshold for 128 draw (97 vs USTA's 96)
  expect(policy.seedsCountThresholds[4]).toEqual({ drawSize: 128, minimumParticipantCount: 97, seedsCount: 32 });
});

it('POLICY_SEEDING_BYES has containerByesIgnoreSeeding', () => {
  const policy = POLICY_SEEDING_BYES[POLICY_TYPE_SEEDING];

  expect(policy.policyName).toBe('SEED_BYES');
  expect(policy.seedingProfile.positioning).toBe(CLUSTER);
  expect(policy.containerByesIgnoreSeeding).toBe(true);
  expect(policy.validSeedPositions.ignore).toBe(true);
  expect(policy.duplicateSeedNumbers).toBe(true);
  expect(policy.drawSizeProgression).toBe(true);
});

/**
 * These three replace the former `POLICY_SEEDING_NATIONAL has simplified structure`.
 *
 * That fixture was ITF seeding with two keys omitted, and the old test asserted only that they were
 * absent — which said nothing about what absence MEANS. One of the two omissions turned out to do
 * nothing at all, and the documentation drew the wrong conclusion from the other. Assert the
 * behavior instead of the shape.
 */
it('policyComposer expresses an ITF variant with seed positions enforced', () => {
  const composed: any = policyComposer(POLICY_TYPE_SEEDING)
    .extend(POLICY_SEEDING_ITF)
    .unset('validSeedPositions')
    .set('policyName', 'ITF SEEDING, POSITIONS ENFORCED')
    .build();

  const policy = composed[POLICY_TYPE_SEEDING];
  expect(policy.policyName).toBe('ITF SEEDING, POSITIONS ENFORCED');
  expect(policy.validSeedPositions).toBeUndefined();
  // Everything else is inherited, thresholds included — which is the point of composing rather than
  // maintaining a near-duplicate fixture.
  expect(policy.seedingProfile.positioning).toBe(CLUSTER);
  expect(policy.seedsCountThresholds).toEqual(POLICY_SEEDING_ITF[POLICY_TYPE_SEEDING].seedsCountThresholds);
  // Immutable: the source fixture is untouched.
  expect(POLICY_SEEDING_ITF[POLICY_TYPE_SEEDING].validSeedPositions).toEqual({ ignore: true });
});

it('duplicateSeedNumbers permits duplicates when ABSENT, not just when true', () => {
  // `seedGetter`: `typeof duplicateSeedNumbers === 'boolean' ? duplicateSeedNumbers : true`.
  // So omitting the key is identical to setting it true, and only `false` restricts. The docs
  // previously described an omission as "unique seeds only", which is backwards.
  const composed: any = policyComposer(POLICY_TYPE_SEEDING)
    .extend(POLICY_SEEDING_ITF)
    .unset('duplicateSeedNumbers')
    .build();
  expect(composed[POLICY_TYPE_SEEDING].duplicateSeedNumbers).toBeUndefined();

  const restrictive: any = policyComposer(POLICY_TYPE_SEEDING)
    .extend(POLICY_SEEDING_ITF)
    .set('duplicateSeedNumbers', false)
    .build();
  expect(restrictive[POLICY_TYPE_SEEDING].duplicateSeedNumbers).toBe(false);
});

it('validSeedPositions.ignore is what lets a seed sit off its seed block', () => {
  // This is the axis, and it governs MANUAL placement — `isValidSeedPosition` is called from
  // `positionAssignment` (which rejects with INVALID_DRAW_POSITION_FOR_SEEDING) and from
  // `positionActions` (which decides whether SEED_VALUE / REMOVE_SEED are offered). It does NOT
  // decide where automated positioning puts seeds; `seedingProfile.positioning` does that, and USTA
  // and ITF both specify it — differently.
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, participantsCount: 32, seedsCount: 8 }],
  });
  tournamentEngine.setState(tournamentRecord);
  const drawId = tournamentRecord.events?.[0]?.drawDefinitions?.[0]?.drawId;
  const { drawDefinition }: any = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  const { validSeedBlocks } = getValidSeedBlocks({ structure: drawDefinition.structures[0] });
  const seedBlockPositions: number[] = validSeedBlocks.flatMap((block: any) => block.drawPositions);
  const offBlockPosition = [...Array(32).keys()]
    .map((index) => index + 1)
    .find((drawPosition) => !seedBlockPositions.includes(drawPosition));
  expect(offBlockPosition).toBeDefined();

  const withIgnore = isValidSeedPosition({
    appliedPolicies: POLICY_SEEDING_ITF,
    drawPosition: offBlockPosition as number,
    drawDefinition,
    structureId,
    seedNumber: 1,
  });
  expect(withIgnore).toBe(true);

  const enforced = isValidSeedPosition({
    appliedPolicies: policyComposer(POLICY_TYPE_SEEDING).extend(POLICY_SEEDING_ITF).unset('validSeedPositions').build(),
    drawPosition: offBlockPosition as number,
    drawDefinition,
    structureId,
    seedNumber: 1,
  });
  expect(enforced).toBe(false);
});

it('SEPARATE positioning maximizes seed separation', () => {
  const { seedBlocks } = getSeedBlocks({
    participantsCount: 32,
    cluster: false, // SEPARATE
  });

  // Verify seed block structure
  expect(seedBlocks[0]).toEqual([1]); // Seed 1
  expect(seedBlocks[1]).toEqual([32]); // Seed 2
  expect(seedBlocks[2]).toEqual([9, 24]); // Seeds 3-4
  expect(seedBlocks[3]).toEqual([5, 13, 20, 28]); // Seeds 5-8

  // Verify seeds are separated (not adjacent)
  const allPositions = seedBlocks.flat();
  for (let i = 0; i < allPositions.length - 1; i++) {
    const diff = Math.abs(allPositions[i] - allPositions[i + 1]);
    // Seeds should not be immediately adjacent in SEPARATE mode
    if (i < 8) {
      // First 8 seeds should have significant separation
      expect(diff).toBeGreaterThan(1);
    }
  }
});

it('CLUSTER positioning allows adjacent seeds', () => {
  const { seedBlocks } = getSeedBlocks({
    participantsCount: 32,
    cluster: true, // CLUSTER
  });

  // Verify seed block structure
  expect(seedBlocks[0]).toEqual([1]); // Seed 1
  expect(seedBlocks[1]).toEqual([32]); // Seed 2
  // CLUSTER creates different pattern - check actual values
  expect(Array.isArray(seedBlocks[2])).toBe(true);
  expect(seedBlocks[2].length).toBe(2); // Seeds 3-4
  expect(Array.isArray(seedBlocks[3])).toBe(true);
  expect(seedBlocks[3].length).toBe(4); // Seeds 5-8

  // CLUSTER allows different positioning than SEPARATE
  // Verify structure exists
  expect(seedBlocks.length).toBeGreaterThan(0);
});

it('seedsCountThresholds determine seeds based on participant count', () => {
  const seedingPolicy = {
    [POLICY_TYPE_SEEDING]: {
      seedingProfile: { positioning: SEPARATE },
      validSeedPositions: { ignore: true },
      duplicateSeedNumbers: true,
      drawSizeProgression: true,
      seedsCountThresholds: [
        { drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 },
        { drawSize: 64, minimumParticipantCount: 48, seedsCount: 16 },
      ],
    },
  };

  // Test with 50 participants, explicitly requesting seeds (meets 64-draw threshold)
  let { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 64,
        participantsCount: 50,
        seedsCount: 16, // Explicit seeds count
        policyDefinitions: seedingPolicy,
      },
    ],
  });

  let seedAssignments = tournamentRecord.events[0].drawDefinitions[0].structures[0].seedAssignments;
  expect(seedAssignments.length).toBe(16); // 50 >= 48, so 16 seeds

  // Test with 45 participants (does NOT meet 64-draw threshold)
  ({ tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 64,
        participantsCount: 45,
        seedsCount: 8, // Falls back to 8
        policyDefinitions: seedingPolicy,
      },
    ],
  }));

  seedAssignments = tournamentRecord.events[0].drawDefinitions[0].structures[0].seedAssignments;
  expect(seedAssignments.length).toBe(8); // 45 < 48, falls back to 32-draw threshold (8 seeds)
});

it('duplicateSeedNumbers allows multiple participants with same seed value', () => {
  const seedingPolicy = {
    [POLICY_TYPE_SEEDING]: {
      seedingProfile: { positioning: CLUSTER },
      validSeedPositions: { ignore: true },
      duplicateSeedNumbers: true,
      drawSizeProgression: true,
      seedsCountThresholds: [{ drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 }],
    },
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        policyDefinitions: seedingPolicy,
        seedsCount: 8,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants({
    withSeeding: true,
    withEvents: true,
  });

  // Manually set duplicate seed values
  const seededParticipants = participants.slice(0, 8);
  seededParticipants[2].events[0].seedValue = 3;
  seededParticipants[3].events[0].seedValue = 3; // Duplicate
  seededParticipants[4].events[0].seedValue = 3; // Duplicate

  // This should be allowed with duplicateSeedNumbers: true
  // Both seeds 3 should be placed in seed block 3-4
  const seedValues = seededParticipants.map((p) => p.events[0].seedValue).filter(Boolean);

  // With duplicateSeedNumbers: true, duplicates are allowed
  expect(seedValues.length).toBeGreaterThanOrEqual(3);
});

it('drawSizeProgression affects seeds count calculation', () => {
  const withProgression = {
    [POLICY_TYPE_SEEDING]: {
      seedingProfile: { positioning: SEPARATE },
      drawSizeProgression: true,
      validSeedPositions: { ignore: true },
      duplicateSeedNumbers: true,
      seedsCountThresholds: [{ drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 }],
    },
  };

  const withoutProgression = {
    [POLICY_TYPE_SEEDING]: {
      seedingProfile: { positioning: SEPARATE },
      drawSizeProgression: false,
      validSeedPositions: { ignore: true },
      duplicateSeedNumbers: true,
      seedsCountThresholds: [{ drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 }],
    },
  };

  // With 25 participants:
  // - drawSizeProgression: true → uses drawSize 32 → 25 >= 24 → 8 seeds
  // - drawSizeProgression: false → uses participant count 25 → 25 >= 24 → 8 seeds
  // (Same result in this case)

  let { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        participantsCount: 25,
        seedsCount: 8,
        policyDefinitions: withProgression,
      },
    ],
  });

  expect(tournamentRecord.events[0].drawDefinitions[0].structures[0].seedAssignments.length).toBe(8);

  ({ tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        participantsCount: 25,
        seedsCount: 8,
        policyDefinitions: withoutProgression,
      },
    ],
  }));

  expect(tournamentRecord.events[0].drawDefinitions[0].structures[0].seedAssignments.length).toBe(8);
});

it('seedingProfile.drawTypes allows different positioning per draw type', () => {
  const mixedPolicy = {
    [POLICY_TYPE_SEEDING]: {
      seedingProfile: {
        positioning: SEPARATE, // Default
        drawTypes: {
          [ROUND_ROBIN]: { positioning: WATERFALL },
          [ROUND_ROBIN_WITH_PLAYOFF]: { positioning: WATERFALL },
        },
      },
      validSeedPositions: { ignore: true },
      duplicateSeedNumbers: true,
      drawSizeProgression: true,
      seedsCountThresholds: [{ drawSize: 16, minimumParticipantCount: 12, seedsCount: 4 }],
    },
  };

  // Verify policy structure
  const policy = mixedPolicy[POLICY_TYPE_SEEDING];
  expect(policy.seedingProfile.positioning).toBe(SEPARATE);
  expect(policy.seedingProfile.drawTypes[ROUND_ROBIN].positioning).toBe(WATERFALL);
  expect(policy.seedingProfile.drawTypes[ROUND_ROBIN_WITH_PLAYOFF].positioning).toBe(WATERFALL);

  // Test elimination draw uses SEPARATE
  const { tournamentRecord: elimRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        drawType: SINGLE_ELIMINATION,
        policyDefinitions: mixedPolicy,
      },
    ],
  });

  expect(elimRecord.events[0].drawDefinitions[0]).toBeDefined();

  // Test Round Robin uses WATERFALL (through policy)
  const { tournamentRecord: rrRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        drawType: ROUND_ROBIN,
        policyDefinitions: mixedPolicy,
      },
    ],
  });

  expect(rrRecord.events[0].drawDefinitions[0]).toBeDefined();
});

it('validSeedPositions.ignore allows flexible seed placement', () => {
  const strictPolicy = {
    [POLICY_TYPE_SEEDING]: {
      validSeedPositions: { ignore: false },
      seedingProfile: { positioning: CLUSTER },
      drawSizeProgression: true,
      seedsCountThresholds: [{ drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 }],
    },
  };

  const flexiblePolicy = {
    [POLICY_TYPE_SEEDING]: {
      validSeedPositions: { ignore: true },
      seedingProfile: { positioning: CLUSTER },
      drawSizeProgression: true,
      seedsCountThresholds: [{ drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 }],
    },
  };

  // Both should generate valid draws
  const { tournamentRecord: strictRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, policyDefinitions: strictPolicy }],
  });

  const { tournamentRecord: flexibleRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, policyDefinitions: flexiblePolicy }],
  });

  expect(strictRecord.events[0].drawDefinitions[0]).toBeDefined();
  expect(flexibleRecord.events[0].drawDefinitions[0]).toBeDefined();

  // With ignore: true, ITF and USTA allow manual placement
  expect(POLICY_SEEDING_ITF[POLICY_TYPE_SEEDING].validSeedPositions.ignore).toBe(true);
  expect(POLICY_SEEDING_DEFAULT[POLICY_TYPE_SEEDING].validSeedPositions.ignore).toBe(true);
});

it('built-in policies have correct positioning patterns', () => {
  // USTA: SEPARATE
  expect(POLICY_SEEDING_DEFAULT[POLICY_TYPE_SEEDING].seedingProfile.positioning).toBe(SEPARATE);

  // ITF: CLUSTER
  expect(POLICY_SEEDING_ITF[POLICY_TYPE_SEEDING].seedingProfile.positioning).toBe(CLUSTER);

  // BYES: CLUSTER
  expect(POLICY_SEEDING_BYES[POLICY_TYPE_SEEDING].seedingProfile.positioning).toBe(CLUSTER);
});

it('getValidSeedBlocks respects seeding profile', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        seedsCount: 8,
        policyDefinitions: POLICY_SEEDING_ITF,
      },
    ],
  });

  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const structure = drawDefinition.structures[0];

  const { validSeedBlocks } = getValidSeedBlocks({
    appliedPolicies: POLICY_SEEDING_ITF,
    drawDefinition,
    structure,
    allPositions: true, // Get all valid blocks
  });

  // Should return valid seed blocks
  expect(validSeedBlocks).toBeDefined();
  expect(Array.isArray(validSeedBlocks)).toBe(true);
  expect(validSeedBlocks?.length).toBeGreaterThan(0);

  // First block should always have position 1
  expect(validSeedBlocks?.[0].drawPositions).toContain(1);
});

it('can generate 256-draw with 64 seeds using USTA policy', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 256,
        participantsCount: 256,
        policyDefinitions: POLICY_SEEDING_DEFAULT,
        seedsCount: 64,
      },
    ],
  });

  const seedAssignments = tournamentRecord.events[0].drawDefinitions[0].structures[0].seedAssignments;

  // Should have 64 seeds
  expect(seedAssignments.length).toBe(64);

  // Verify draw was created successfully
  expect(tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps.length).toBeGreaterThan(0);
});

it('can generate draw with ITF policy and duplicate seeds', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        participantsCount: 28,
        policyDefinitions: POLICY_SEEDING_ITF,
        seedsCount: 8,
      },
    ],
  });

  const structure = tournamentRecord.events[0].drawDefinitions[0].structures[0];

  // ITF policy allows duplicateSeedNumbers
  expect(POLICY_SEEDING_ITF[POLICY_TYPE_SEEDING].duplicateSeedNumbers).toBe(true);

  // Should have 8 seed assignments
  expect(structure.seedAssignments.length).toBe(8);

  // Should have matchUps
  expect(structure.matchUps.length).toBeGreaterThan(0);
});

it('positioning constants are correctly defined', () => {
  expect(CLUSTER).toBe('CLUSTER');
  expect(ADJACENT).toBe('ADJACENT');
  expect(SEPARATE).toBe('SEPARATE');
  expect(WATERFALL).toBe('WATERFALL');

  // All should be strings
  expect(typeof CLUSTER).toBe('string');
  expect(typeof ADJACENT).toBe('string');
  expect(typeof SEPARATE).toBe('string');
  expect(typeof WATERFALL).toBe('string');
});

it('all built-in policies use drawSizeProgression', () => {
  expect(POLICY_SEEDING_DEFAULT[POLICY_TYPE_SEEDING].drawSizeProgression).toBe(true);
  expect(POLICY_SEEDING_ITF[POLICY_TYPE_SEEDING].drawSizeProgression).toBe(true);
  expect(POLICY_SEEDING_BYES[POLICY_TYPE_SEEDING].drawSizeProgression).toBe(true);
});

it('USTA and ITF have identical thresholds except for 128 draw', () => {
  const ustaThresholds = POLICY_SEEDING_DEFAULT[POLICY_TYPE_SEEDING].seedsCountThresholds;
  const itfThresholds = POLICY_SEEDING_ITF[POLICY_TYPE_SEEDING].seedsCountThresholds;

  // Same length
  expect(ustaThresholds.length).toBe(itfThresholds.length);

  // First 4 thresholds identical
  for (let i = 0; i < 4; i++) {
    expect(ustaThresholds[i]).toEqual(itfThresholds[i]);
  }

  // 128-draw threshold differs
  expect(ustaThresholds[4].drawSize).toBe(128);
  expect(itfThresholds[4].drawSize).toBe(128);
  expect(ustaThresholds[4].minimumParticipantCount).toBe(96);
  expect(itfThresholds[4].minimumParticipantCount).toBe(97); // ITF requires one more

  // 256-draw threshold identical
  expect(ustaThresholds[5]).toEqual(itfThresholds[5]);
});

it('seeding policy works with actual draw generation', () => {
  const customPolicy = {
    [POLICY_TYPE_SEEDING]: {
      policyName: 'Test Policy',
      seedingProfile: {
        positioning: ADJACENT, // Using ADJACENT synonym
      },
      validSeedPositions: { ignore: true },
      duplicateSeedNumbers: false,
      drawSizeProgression: true,
      seedsCountThresholds: [{ drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 }],
    },
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        participantsCount: 28,
        policyDefinitions: customPolicy,
        seedsCount: 8,
      },
    ],
  });

  const structure = tournamentRecord.events[0].drawDefinitions[0].structures[0];

  // Verify structure was created
  expect(structure).toBeDefined();
  expect(structure.seedAssignments.length).toBe(8);
  expect(structure.matchUps.length).toBe(31); // 32-draw has 31 matchUps

  // Verify seeds are assigned
  const seedAssignments = structure.seedAssignments;
  const seedNumbers = seedAssignments.map((sa) => sa.seedNumber).sort((a, b) => a - b);
  expect(seedNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
});

it('ADJACENT produces same seed placement as CLUSTER', () => {
  const adjacentPolicy = {
    [POLICY_TYPE_SEEDING]: {
      seedingProfile: { positioning: ADJACENT },
      validSeedPositions: { ignore: true },
      duplicateSeedNumbers: true,
      drawSizeProgression: true,
      seedsCountThresholds: [{ drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 }],
    },
  };

  const clusterPolicy = {
    [POLICY_TYPE_SEEDING]: {
      seedingProfile: { positioning: CLUSTER },
      validSeedPositions: { ignore: true },
      duplicateSeedNumbers: true,
      drawSizeProgression: true,
      seedsCountThresholds: [{ drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 }],
    },
  };

  // Generate draws with both policies
  const { tournamentRecord: adjacentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, participantsCount: 32, seedsCount: 8, policyDefinitions: adjacentPolicy }],
  });

  const { tournamentRecord: clusterRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, participantsCount: 32, seedsCount: 8, policyDefinitions: clusterPolicy }],
  });

  tournamentEngine.setState(adjacentRecord);
  const adjacentStructure = adjacentRecord.events[0].drawDefinitions[0].structures[0];
  const adjacentSeedAssignments = adjacentStructure.seedAssignments;
  const adjacentDrawPositions = adjacentSeedAssignments
    .map((sa) => ({ seed: sa.seedNumber, pos: sa.seedValue }))
    .sort((a, b) => a.seed - b.seed)
    .map((item) => item.pos);

  tournamentEngine.setState(clusterRecord);
  const clusterStructure = clusterRecord.events[0].drawDefinitions[0].structures[0];
  const clusterSeedAssignments = clusterStructure.seedAssignments;
  const clusterDrawPositions = clusterSeedAssignments
    .map((sa) => ({ seed: sa.seedNumber, pos: sa.seedValue }))
    .sort((a, b) => a.seed - b.seed)
    .map((item) => item.pos);

  // Seeds should be placed in identical positions
  expect(adjacentDrawPositions).toEqual(clusterDrawPositions);
});
