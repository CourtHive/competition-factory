import { getAttributeGroupings } from '@Query/participants/getAttributeGrouping';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { GROUP, INDIVIDUAL } from '@Constants/participantConstants';

/**
 * `directive`-based avoidance — groups, teams and pairs — was a silent no-op for SEEDED players.
 *
 * `positionSeeds.reorderSeedsForAvoidance` called `getAttributeGroupings` with `targetParticipantIds`,
 * `policyAttributes` and `participants`, but **without `idCollections`**. `getAttributeGrouping.ts`
 * resolves a `directive` policy purely from `idCollections[directive]`, so the call returned `{}`, no
 * conflict groups were found, and the function returned early having done nothing.
 *
 * The consequence ran the wrong way round from intuition: a TD who grouped a coach's stable and ticked
 * "Groups" got avoidance for the *unseeded* members and silence for the *seeds* — the players most
 * likely to share a coach, and the ones placed first. `randomUnseededSeparation` builds `idCollections`
 * correctly, which is why the unseeded half worked and nobody noticed.
 *
 * The first test below is the one that matters: it isolates the exact call, so it fails for this reason
 * and no other. A draw-level assertion alone would be at the mercy of seed-block randomisation and
 * could pass on a lucky layout.
 */

const GROUP_DIRECTIVE = [{ directive: 'groupParticipants' }];

it('resolves a GROUP directive only when idCollections is supplied — the omitted argument', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ participantsCount: 8 });
  tournamentEngine.setState(tournamentRecord);

  const individuals =
    tournamentEngine.getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } }).participants ?? [];
  const memberIds = individuals.slice(0, 2).map(({ participantId }) => participantId);

  const created = tournamentEngine.createGroupParticipant({
    individualParticipantIds: memberIds,
    groupName: 'Coaching Stable',
  });
  expect(created.success).toEqual(true);

  const participants = tournamentEngine.getParticipants({ withGroupings: true }).participants ?? [];
  const groupParticipants = participants
    .filter(({ participantType }) => participantType === GROUP)
    .map(({ participantId }) => participantId);
  expect(groupParticipants.length).toEqual(1);

  // WITHOUT — what `positionSeeds` used to do. Empty, so no conflict is ever detected.
  const without: any = getAttributeGroupings({
    targetParticipantIds: memberIds,
    policyAttributes: GROUP_DIRECTIVE,
    participants,
  });
  expect(Object.keys(without)).toEqual([]);

  // WITH — the group is resolved and both members are in it. This is the pair of runs that makes the
  // omission a measured fact rather than a reading of the code.
  const withCollections: any = getAttributeGroupings({
    idCollections: { groupParticipants, teamParticipants: [], pairParticipants: [] },
    targetParticipantIds: memberIds,
    policyAttributes: GROUP_DIRECTIVE,
    participants,
  });
  const resolved = Object.values(withCollections)[0] as string[];
  expect(resolved).toBeDefined();
  expect([...resolved].sort()).toEqual([...memberIds].sort());
});

/**
 * NOT covered here, deliberately, and the reason is worth more than the test would have been.
 *
 * An end-to-end assertion — group two seeds, generate, expect different halves — was written, and it
 * passed **with the fix and without it**. Instrumenting the call site explained why:
 * `positionSeeds` reads its policy from `getAppliedPolicies({ drawDefinition })`, and at seed-placement
 * time that returns `["seeding"]` only — `avoidance` is `undefined`. A policy supplied through
 * `generateDrawDefinition({ policyDefinitions })` is not attached to the drawDefinition yet, so the
 * whole avoidance branch in `positionSeeds` never executes.
 *
 * So seeded directive-avoidance is dead for a second, independent reason, and this fix is a
 * prerequisite rather than a cure. See TASKS.md — "factory: seeded avoidance is dead twice over".
 * Do not add an end-to-end test here until that is resolved: it can only be vacuous.
 */
