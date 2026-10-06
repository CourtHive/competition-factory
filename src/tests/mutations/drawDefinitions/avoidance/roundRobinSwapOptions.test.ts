import { getSwapOptions } from '@Query/drawDefinition/avoidance/getSwapOptions';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_AVOIDANCE } from '@Constants/policyConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

/**
 * getAvoidanceConflicts reports an elimination conflict as a pair of positioned participants but a
 * round robin conflict as a pair of drawPositions. getSwapOptions read `.drawPosition` from every
 * conflict member, so round robin conflicts yielded no swap options and avoidance never repaired a
 * round robin group.
 */
describe('round robin avoidance swaps', () => {
  it('a round robin conflict (a drawPosition pair) yields swap options', () => {
    // groups [1-4] and [5-8]; 1 and 2 share a nationality, everyone else is distinct
    const values = { 1: ['A'], 2: ['A'], 3: ['B'], 4: ['C'], 5: ['D'], 6: ['E'], 7: ['F'], 8: ['G'] };
    const positionedParticipants = Object.entries(values).map(([drawPosition, value]) => ({
      participantId: `p${drawPosition}`,
      drawPosition: Number(drawPosition),
      values: value,
    }));

    const swapOptions = getSwapOptions({
      potentialDrawPositions: [1, 2, 3, 4, 5, 6, 7, 8],
      drawPositionGroups: [
        [1, 2, 3, 4],
        [5, 6, 7, 8],
      ],
      avoidanceConflicts: [[1, 2]],
      positionedParticipants,
      isRoundRobin: true,
    });

    expect(swapOptions.length).toBeGreaterThan(0);
    // only the conflicted participants move, and never into each other's position
    for (const option of swapOptions as any[]) {
      expect([1, 2]).toContain(option.drawPosition);
      expect(option.possibleDrawPositions).not.toContain(1);
      expect(option.possibleDrawPositions).not.toContain(2);
    }
  });

  it('nationality avoidance separates round robin groups', () => {
    // 32 participants from 4 nationalities (8 each) in 8 groups of 4: one of each per group is possible.
    // Fixed PRNG seeds keep this deterministic. Measured: 63 same-nationality group-mates across these
    // seeds before the fix, 29 after.
    const PRNG_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let sameNationalityGroupMates = 0;

    for (const nonRandom of PRNG_SEEDS) {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        participantsProfile: { participantsCount: 32, nationalityCodesCount: 4, valuesInstanceLimit: 8 },
        drawProfiles: [
          {
            policyDefinitions: { [POLICY_TYPE_AVOIDANCE]: { policyAttributes: [{ key: 'person.nationalityCode' }] } },
            drawType: ROUND_ROBIN,
            seedsCount: 0,
            drawSize: 32,
          },
        ],
        nonRandom,
      });

      const nationality = Object.fromEntries(
        tournamentRecord.participants.map((participant) => [
          participant.participantId,
          participant.person?.nationalityCode,
        ]),
      );
      const container = tournamentRecord.events[0].drawDefinitions[0].structures[0];
      for (const group of container.structures ?? []) {
        const codes = (group.positionAssignments ?? [])
          .map(({ participantId }) => participantId && nationality[participantId])
          .filter(Boolean);
        sameNationalityGroupMates += codes.length - new Set(codes).size;
      }
    }

    expect(sameNationalityGroupMates).toBeLessThan(40);
  });
});
