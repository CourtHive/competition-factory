import { PROTECTED_RANKING, RATING } from '@Constants/seedingConstants';
import POLICY_SEEDING_ITF from '@Fixtures/policies/POLICY_SEEDING_ITF';
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import {
  ADDITIONAL_SEEDS_EXHAUSTED,
  INVALID_PARTICIPANT_ID,
  SEEDSCOUNT_GREATER_THAN_DRAW_SIZE,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

// A governing body that protects a returning player adds a seed ABOVE the draw's normal count,
// so that nobody is displaced from a seeding slot they earned. `additionalSeeds` expresses that
// as a policy rule with a ceiling, rather than as `enforcePolicyLimits: false` — which is an
// operator override, indistinguishable from a mistake, and unbounded.
//
// POLICY_SEEDING_ITF yields 8 seeds at drawSize 32 with 24+ participants.

const withAllowance = (maxCount: number, bases?: string[]) => ({
  [POLICY_TYPE_SEEDING]: {
    ...POLICY_SEEDING_ITF[POLICY_TYPE_SEEDING],
    additionalSeeds: { maxCount, ...(bases ? { bases } : {}) },
  },
});

function generate({ policyDefinitions, seedsCount, drawSize = 32, participantsCount = 32 }: any) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ policyDefinitions, participantsCount, seedsCount, drawSize }],
  });
  tournamentEngine.setState(tournamentRecord);
  const drawId = tournamentRecord.events?.[0]?.drawDefinitions?.[0]?.drawId;
  const result: any = tournamentEngine.getEvent({ drawId });
  const structure = result.drawDefinition.structures[0];
  const positionAssignments = structure.positionAssignments;
  const seedPositions = (structure.seedAssignments ?? [])
    .filter((a: any) => a.participantId)
    .map((a: any) => positionAssignments.find((p: any) => p.participantId === a.participantId)?.drawPosition);
  return { drawId, event: result.event, structure, seedPositions };
}

it('clamps to the threshold when the policy declares no allowance', () => {
  // The unchanged ITF policy is the control: 10 requested, 8 granted.
  expect(generate({ policyDefinitions: POLICY_SEEDING_ITF, seedsCount: 10 }).structure.seedLimit).toEqual(8);
});

it('permits seeds above the threshold, up to the declared allowance', () => {
  expect(generate({ policyDefinitions: withAllowance(2), seedsCount: 10 }).structure.seedLimit).toEqual(10);
});

it('the allowance is a ceiling, not a licence', () => {
  // 12 requested against a threshold of 8 and an allowance of 2 lands on 10, not 12.
  expect(generate({ policyDefinitions: withAllowance(2), seedsCount: 12 }).structure.seedLimit).toEqual(10);
});

it('additional seeds displace nobody', () => {
  // The point of the feature. The eight seeds the draw would have had occupy the same eight
  // drawPositions whether or not two more seeds exist; the extras take positions from the NEXT
  // seed block. Compare position SETS — which position each seed drew within a block is random.
  const baseline = generate({ policyDefinitions: POLICY_SEEDING_ITF, seedsCount: 8 });
  const extended = generate({ policyDefinitions: withAllowance(2), seedsCount: 10 });

  const sorted = (positions: number[]) => [...positions].sort((a, b) => a - b);
  expect(baseline.seedPositions).toHaveLength(8);
  expect(extended.seedPositions).toHaveLength(10);
  expect(sorted(extended.seedPositions.slice(0, 8))).toEqual(sorted(baseline.seedPositions));
});

it('getSeedsCount reports the allowance without folding it into the count', () => {
  const asked: any = tournamentEngine.getSeedsCount({
    policyDefinitions: withAllowance(4),
    participantsCount: 32,
    drawSize: 32,
  });
  expect(asked.seedsCount).toEqual(8);
  expect(asked.additionalSeedsAllowed).toEqual(4);
});

it('getSeedsCount reports no allowance when no threshold matched', () => {
  // An allowance is expressed relative to a count. With 2 participants no ITF threshold applies,
  // so there is nothing for an additional seed to be additional TO.
  const asked: any = tournamentEngine.getSeedsCount({
    policyDefinitions: withAllowance(4),
    participantsCount: 2,
    drawSize: 32,
  });
  expect(asked.seedsCount).toEqual(0);
  expect(asked.additionalSeedsAllowed).toEqual(0);
});

it('reports what remains of the allowance', () => {
  const { drawId, structure } = generate({ policyDefinitions: withAllowance(3), seedsCount: 9 });
  const allowance: any = tournamentEngine.getAdditionalSeedsAllowance({
    structureId: structure.structureId,
    drawId,
  });
  expect(allowance.thresholdSeedsCount).toEqual(8);
  expect(allowance.additionalSeedsAllowed).toEqual(3);
  expect(allowance.additionalSeedsAssigned).toEqual(1);
  expect(allowance.additionalSeedsRemaining).toEqual(2);
});

it('a seedLimit below the threshold has consumed none of the allowance', () => {
  // Four seeds in a draw whose threshold is eight: the next seed it gains is an ordinary seed.
  const { drawId, structure } = generate({ policyDefinitions: withAllowance(2), seedsCount: 4 });
  const allowance: any = tournamentEngine.getAdditionalSeedsAllowance({
    structureId: structure.structureId,
    drawId,
  });
  expect(allowance.seedLimit).toEqual(4);
  expect(allowance.additionalSeedsAssigned).toEqual(0);
  expect(allowance.additionalSeedsRemaining).toEqual(2);
});

it('adds a seed after generation and records why it exists', () => {
  const { drawId, event, structure } = generate({ policyDefinitions: withAllowance(2), seedsCount: 8 });
  const unseeded = structure.positionAssignments
    .map((assignment: any) => assignment.participantId)
    .filter(Boolean)
    .find(
      (participantId: string) =>
        !structure.seedAssignments.some((assignment: any) => assignment.participantId === participantId),
    );

  const result: any = tournamentEngine.addAdditionalSeed({
    structureId: structure.structureId,
    seedingBasis: PROTECTED_RANKING,
    participantId: unseeded,
    eventId: event.eventId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.seedNumber).toEqual(9);

  const updated: any = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0];
  expect(updated.seedLimit).toEqual(9);
  const added = updated.seedAssignments.find((assignment: any) => assignment.seedNumber === 9);
  expect(added.participantId).toEqual(unseeded);
  expect(added.seedingBasis).toEqual(PROTECTED_RANKING);

  // the eight seeds already there keep their numbers and their participants
  expect(updated.seedAssignments.filter((a: any) => a.seedNumber <= 8).map((a: any) => a.participantId)).toEqual(
    structure.seedAssignments.map((a: any) => a.participantId),
  );
});

it('refuses once the allowance is spent, and mutates nothing', () => {
  const { drawId, event, structure } = generate({ policyDefinitions: withAllowance(1), seedsCount: 9 });
  const unseeded = structure.positionAssignments
    .map((assignment: any) => assignment.participantId)
    .filter(Boolean)
    .find(
      (participantId: string) =>
        !structure.seedAssignments.some((assignment: any) => assignment.participantId === participantId),
    );

  const result: any = tournamentEngine.addAdditionalSeed({
    structureId: structure.structureId,
    seedingBasis: RATING,
    participantId: unseeded,
    eventId: event.eventId,
    drawId,
  });
  expect(result.error).toEqual(ADDITIONAL_SEEDS_EXHAUSTED);

  const updated: any = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0];
  expect(updated.seedLimit).toEqual(9);
  expect(updated.seedAssignments).toHaveLength(9);
});

it('refuses a participant who is not in the draw, and mutates nothing', () => {
  const { drawId, event, structure } = generate({ policyDefinitions: withAllowance(2), seedsCount: 8 });
  const result: any = tournamentEngine.addAdditionalSeed({
    structureId: structure.structureId,
    participantId: 'not-an-entrant',
    seedingBasis: PROTECTED_RANKING,
    eventId: event.eventId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_ID);

  const updated: any = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0];
  expect(updated.seedLimit).toEqual(8);
  expect(updated.seedAssignments).toHaveLength(8);
});

it('refuses a structure that does not exist', () => {
  const { drawId } = generate({ policyDefinitions: withAllowance(2), seedsCount: 8 });
  expect((tournamentEngine.getAdditionalSeedsAllowance({ structureId: 'nope', drawId }) as any).error).toEqual(
    STRUCTURE_NOT_FOUND,
  );
  expect(
    (
      tournamentEngine.addAdditionalSeed({
        seedingBasis: PROTECTED_RANKING,
        participantId: 'anyone',
        structureId: 'nope',
        drawId,
      }) as any
    ).error,
  ).toEqual(STRUCTURE_NOT_FOUND);
});

it('refuses to seed past the last drawPosition', () => {
  // An allowance cannot conjure positions. A 4-draw seeded to its limit has nowhere to put a 5th.
  const { drawId, structure } = generate({
    policyDefinitions: withAllowance(10),
    participantsCount: 4,
    seedsCount: 4,
    drawSize: 4,
  });
  expect(structure.seedLimit).toEqual(4);

  const participantId = structure.positionAssignments.find((a: any) => a.participantId)?.participantId;
  const result: any = tournamentEngine.addAdditionalSeed({
    structureId: structure.structureId,
    seedingBasis: PROTECTED_RANKING,
    participantId,
    drawId,
  });
  expect(result.error).toEqual(SEEDSCOUNT_GREATER_THAN_DRAW_SIZE);
});

it('restores seedLimit when the seed assignment itself fails', () => {
  // The rollback the docstring promises. Under `validSeedPositions: { strict: true }` a
  // participant already standing outside the new seed's block cannot take it — and the raised
  // seedLimit must not survive the refusal, or the draw silently claims a seed it does not have.
  const strict = {
    [POLICY_TYPE_SEEDING]: {
      ...POLICY_SEEDING_ITF[POLICY_TYPE_SEEDING],
      validSeedPositions: { strict: true },
      additionalSeeds: { maxCount: 2 },
    },
  };
  const { drawId, structure } = generate({ policyDefinitions: strict, seedsCount: 8 });
  const seeded = structure.seedAssignments.map((a: any) => a.participantId);
  const seedPositions = new Set(
    structure.positionAssignments.filter((a: any) => seeded.includes(a.participantId)).map((a: any) => a.drawPosition),
  );
  // someone positioned well away from any block a 9th seed could occupy
  const stranded = structure.positionAssignments.find(
    (a: any) => a.participantId && !seedPositions.has(a.drawPosition) && a.drawPosition % 2 === 0,
  );

  const result: any = tournamentEngine.addAdditionalSeed({
    participantId: stranded.participantId,
    structureId: structure.structureId,
    seedingBasis: PROTECTED_RANKING,
    drawId,
  });
  expect(result.error).toBeDefined();

  const updated: any = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0];
  expect(updated.seedLimit).toEqual(8);
  expect(updated.seedAssignments).toHaveLength(8);
});

it('honours an explicit participantsCount over the positions on the board', () => {
  // Threshold rows match on minimumParticipantCount. ITF needs 24 at drawSize 32; told there are
  // 12, no 32-row applies and the 16-row governs instead.
  const { drawId, structure } = generate({ policyDefinitions: withAllowance(2), seedsCount: 8 });
  const asBoard: any = tournamentEngine.getAdditionalSeedsAllowance({
    structureId: structure.structureId,
    drawId,
  });
  const asTold: any = tournamentEngine.getAdditionalSeedsAllowance({
    structureId: structure.structureId,
    participantsCount: 12,
    drawId,
  });
  expect(asBoard.thresholdSeedsCount).toEqual(8);
  expect(asTold.thresholdSeedsCount).toEqual(4);
  expect(asTold.additionalSeedsAssigned).toEqual(4); // seedLimit 8 against a threshold of 4
});
