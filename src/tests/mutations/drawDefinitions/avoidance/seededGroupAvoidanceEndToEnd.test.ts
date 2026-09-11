import { positionSeedBlocks } from '@Mutate/matchUps/drawPositions/positionSeeds';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { createSeededRandom } from '@Tools/prng';
import { expect, it } from 'vitest';

// constants and types
import { POLICY_TYPE_AVOIDANCE } from '@Constants/policyConstants';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { GROUP } from '@Constants/participantConstants';

/**
 * Seeded `directive` avoidance, end to end: does grouping two seeds actually MOVE them apart?
 *
 * The companion test (`seededGroupAvoidance.test.ts`) proves the isolated call resolves a GROUP once
 * `idCollections` is supplied. This one proves the resolution reaches placement — that the fix has a
 * consequence a tournament director would see, not just a truer return value.
 *
 * It is written as a paired comparison rather than a single assertion because seed placement is
 * randomised: the same fixture is generated twice per PRNG seed, once with the avoidance policy and
 * once without, and the two placements are compared. That makes the control intrinsic — if the
 * unpolicied run never crowds the pair into one section, the fixture proves nothing and the test says
 * so explicitly rather than passing on a lucky layout.
 *
 * Falsified against reverted source: removing `idCollections` from the `getAttributeGroupings` call
 * in `reorderSeedsForAvoidance` takes conflictGroups to zero for every PRNG seed and returns the
 * policied placement to exactly the unpolicied one — the CONFLICTS assertion below then fails.
 */

const DRAW_SIZE = 32;
const SEEDS_COUNT = 8;
// Seeds 5-8 are the only block with more than two members, which is what the avoidance branch
// requires. Seeds 1-2 are useless here: the seeding algorithm forces them apart unaided.
const GROUPED_SEED_VALUES = [5, 6];
const PRNG_SEEDS = [1, 2, 3, 7, 11, 13, 17, 19, 23, 29];

type Placement = { sameSection: boolean; positions: (number | undefined)[] };

function placeSeeds(prngSeed: number, withAvoidancePolicy: boolean): Placement | undefined {
  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: DRAW_SIZE, seedsCount: SEEDS_COUNT, automated: false }],
    participantsProfile: { participantsCount: DRAW_SIZE },
    nonRandom: prngSeed,
  });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
  const structure = drawDefinition.structures.find((s: any) => s.stage === MAIN);

  const seedHolder: Record<number, string> = {};
  for (const assignment of structure.seedAssignments ?? []) {
    const seedValue = assignment.seedValue ?? assignment.seedNumber;
    if (assignment.participantId) seedHolder[seedValue] = assignment.participantId;
  }
  const groupMembers = GROUPED_SEED_VALUES.map((seedValue) => seedHolder[seedValue]).filter(Boolean);
  if (groupMembers.length !== GROUPED_SEED_VALUES.length) return undefined;

  tournamentEngine.createGroupParticipant({
    individualParticipantIds: groupMembers,
    groupName: 'Coaching Stable',
  });

  if (withAvoidancePolicy) {
    // MERGE into the existing APPLIED_POLICIES extension rather than pushing a second one.
    // `getAppliedPolicies` reads the FIRST extension of that name, and the generated draw already
    // carries one holding the seeding policy — so a pushed duplicate is silently ignored and the
    // policy never arrives. That produces a test that "runs" and measures nothing.
    drawDefinition.extensions = drawDefinition.extensions ?? [];
    const applied = drawDefinition.extensions.find((extension: any) => extension.name === APPLIED_POLICIES);
    const avoidance = { policyAttributes: [{ directive: 'groupParticipants' }] };
    if (applied) applied.value = { ...applied.value, [POLICY_TYPE_AVOIDANCE]: avoidance };
    else drawDefinition.extensions.push({ name: APPLIED_POLICIES, value: { [POLICY_TYPE_AVOIDANCE]: avoidance } });
  }

  // Deliberately NOT filtered to INDIVIDUAL: `idCollections.groupParticipants` is built by filtering
  // this array for `participantType === GROUP`, so excluding GROUPs empties the directive and the
  // run silently measures nothing.
  const participants = tournamentEngine.getParticipants({ withGroupings: true }).participants ?? [];
  expect(participants.some((participant: any) => participant.participantType === GROUP)).toEqual(true);

  positionSeedBlocks({
    structureId: structure.structureId,
    random: createSeededRandom(prngSeed),
    drawDefinition,
    participants,
    structure,
  });

  const positionOf = (participantId: string) =>
    (structure.positionAssignments ?? []).find((assignment: any) => assignment.participantId === participantId)
      ?.drawPosition;

  const positions = groupMembers.map(positionOf);
  // With a single conflict group the algorithm splits the block's positions into two sections
  // (`sectionCount = max(2, conflictGroups.length)`), so "same section" is the upper/lower split of
  // the seed block — the granularity the avoidance actually reasons about.
  const sectionOf = (position?: number) => {
    if (position === undefined) return -1;
    return position <= DRAW_SIZE / 2 ? 0 : 1;
  };
  const sections = positions.map(sectionOf);
  return { sameSection: sections[0] === sections[1], positions };
}

it('moves grouped seeds apart, and only when they would otherwise share a section', () => {
  const compared = PRNG_SEEDS.map((prngSeed) => ({
    without: placeSeeds(prngSeed, false),
    with: placeSeeds(prngSeed, true),
    prngSeed,
  })).filter((row) => row.without && row.with);

  expect(compared.length).toEqual(PRNG_SEEDS.length);

  const conflicts = compared.filter((row) => row.without?.sameSection);
  const stillConflicted = compared.filter((row) => row.with?.sameSection);

  // The fixture must actually produce the problem being solved. Without this the run below could
  // pass on a layout that never crowded the pair together, certifying nothing.
  expect(conflicts.length).toBeGreaterThan(0);

  // Every conflict is resolved once the policy is applied.
  expect(stillConflicted.length).toEqual(0);

  // And the policy is not just shuffling everything: where there was no conflict, placement is
  // untouched. A policy that moved seeds unconditionally would also satisfy the assertion above.
  const unconflicted = compared.filter((row) => !row.without?.sameSection);
  expect(unconflicted.length).toBeGreaterThan(0);
  for (const row of unconflicted) {
    expect(row.with?.positions).toEqual(row.without?.positions);
  }
});
