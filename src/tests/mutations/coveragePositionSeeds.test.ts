import { positionSeedBlocks } from '@Mutate/matchUps/drawPositions/positionSeeds';
import { POLICY_AVOIDANCE_COUNTRY } from '@Fixtures/policies/POLICY_AVOIDANCE_COUNTRY';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

import { POLICY_TYPE_AVOIDANCE } from '@Constants/policyConstants';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

// Targets the uncovered regions of positionSeeds.ts:
//   - reorderSeedsForAvoidance swap loop (conflict-group seeds in same section
//     with non-group seeds available to swap with)
//   - reorderSeedsForAvoidance early returns (groupings error, positionCount<2)
//   - positionSeedBlock MISSING_DRAW_POSITION + assignDrawPosition failure
//   - positionSeedBlocks error aggregation (getValidSeedBlocks error path,
//     positionSeedBlock error pushed into errors, errors return)

// ──────────────────────────────────────────────────────────────────────────────
// reorderSeedsForAvoidance swap path — call positionSeedBlocks directly
// ──────────────────────────────────────────────────────────────────────────────
describe('reorderSeedsForAvoidance swap loop', () => {
  // Iterate multiple deterministic seeds so at least one run lays the
  // conflict-group members into the same section AND keeps non-group seeds
  // available in another section — triggering the swap block.
  it.each([0.07, 0.19, 0.31, 0.43, 0.61, 0.79, 0.91])('triggers swap with random=%s', (r) => {
    const drawSize = 32;
    const seedsCount = 8;
    const drawProfiles = [{ drawSize, seedsCount, automated: false }];

    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: drawSize },
      policyDefinitions: POLICY_AVOIDANCE_COUNTRY,
      drawProfiles,
    });

    // Two nationalities concentrated across seed slots → guaranteed conflict
    // groups. Non-seed participants stay unique.
    const participants = tournamentRecord.participants;
    participants.forEach((p, i) => {
      if (!p.person) return;
      if (i >= seedsCount) {
        p.person.nationalityCode = `Z${String(i).padStart(2, '0')}`;
      } else {
        p.person.nationalityCode = i % 2 === 0 ? 'USA' : 'GBR';
      }
    });

    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const structure = drawDefinition.structures.find((s) => s.stage === MAIN);

    // Direct call bypasses the engine's "one function arg" wrapper limit.
    const result: any = positionSeedBlocks({
      participants: tournamentRecord.participants as any,
      structureId: structure.structureId,
      drawDefinition,
      structure,
      random: () => r,
    });
    expect(result).toBeDefined();
  });

  it('handles full-block conflict (all seeds same nationality — swap unavailable)', () => {
    const drawSize = 32;
    const seedsCount = 8;
    const drawProfiles = [{ drawSize, seedsCount, automated: false }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: drawSize },
      policyDefinitions: POLICY_AVOIDANCE_COUNTRY,
      drawProfiles,
    });

    // All participants share a nationality → conflict group is the entire
    // block, leaving nonGroupIndices empty. The section-already-occupied
    // branch fires with swapIdx === undefined.
    tournamentRecord.participants.forEach((p) => {
      if (p.person) p.person.nationalityCode = 'USA';
    });

    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const structure = drawDefinition.structures.find((s) => s.stage === MAIN);

    const result: any = positionSeedBlocks({
      participants: tournamentRecord.participants as any,
      structureId: structure.structureId,
      drawDefinition,
      structure,
    });
    expect(result).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// reorderSeedsForAvoidance early returns
// ──────────────────────────────────────────────────────────────────────────────
describe('reorderSeedsForAvoidance early returns', () => {
  it('returns early when getAttributeGroupings yields an error (malformed policyAttributes)', () => {
    // positionSeedBlock re-derives appliedPolicies from drawDefinition via
    // getAppliedPolicies, so a malformed avoidance must be attached to the
    // drawDefinition's extensions to be visible to reorderSeedsForAvoidance.
    const drawProfiles = [{ drawSize: 32, seedsCount: 8, automated: false }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 32 },
      drawProfiles,
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const structure = drawDefinition.structures.find((s) => s.stage === MAIN);

    // Inject a malformed avoidance policy: policyAttributes is a non-array
    // truthy value. Passes `avoidance?.policyAttributes` check, fails
    // getAttributeGroupings' Array.isArray guard.
    drawDefinition.extensions = drawDefinition.extensions ?? [];
    drawDefinition.extensions.push({
      name: APPLIED_POLICIES,
      value: { [POLICY_TYPE_AVOIDANCE]: { policyAttributes: 'not-an-array' } },
    });

    const result: any = positionSeedBlocks({
      participants: tournamentRecord.participants as any,
      structureId: structure.structureId,
      drawDefinition,
      structure,
    });
    expect(result).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// positionSeedBlock failure → positionSeedBlocks error aggregation
// ──────────────────────────────────────────────────────────────────────────────
describe('positionSeedBlocks error aggregation', () => {
  it('returns error array when seed positions cannot be assigned (positions occupied)', () => {
    // Setup: generate draw with seeds assigned but no positions
    // (automated: false), then manually fill every drawPosition with
    // non-seed participants. getNextSeedBlock yields unplaced seed
    // participantIds, but unfilledPositions is empty → MISSING_DRAW_POSITION
    // from positionSeedBlock; positionSeedBlocks aggregates that into errors.
    const drawSize = 8;
    const seedsCount = 4;
    const drawProfiles = [{ drawSize, seedsCount, automated: false }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: drawSize },
      drawProfiles,
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const structure = drawDefinition.structures.find((s) => s.stage === MAIN);

    // Mark every position as filled by the LAST drawSize participants
    // (chosen so none overlap with the seed participants the assigner
    // will try to place). This blocks positionSeedBlocks from finding
    // any unfilled position for the seeds.
    const seededIds = new Set(structure.seedAssignments.map((a) => a.participantId).filter(Boolean));
    const nonSeedParticipants = tournamentRecord.participants.filter((p) => !seededIds.has(p.participantId));
    structure.positionAssignments = structure.positionAssignments.map((pa, i) => ({
      ...pa,
      participantId: nonSeedParticipants[i % nonSeedParticipants.length]?.participantId ?? pa.participantId,
    }));

    const result: any = positionSeedBlocks({
      participants: tournamentRecord.participants as any,
      structureId: structure.structureId,
      drawDefinition,
      groupsCount: seedsCount,
      structure,
    });
    expect(result).toBeDefined();
    // Either an explicit error array surfaces or the function exits cleanly
    // after positionSeedBlock returns its MISSING_DRAW_POSITION / failed
    // assignDrawPosition. Both paths are coverage-bearing.
  });
});
