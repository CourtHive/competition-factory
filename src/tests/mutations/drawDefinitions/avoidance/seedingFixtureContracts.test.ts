import { getAttributeGroupings } from '@Query/participants/getAttributeGrouping';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, describe, it } from 'vitest';

// constants and types
import { GROUP, INDIVIDUAL } from '@Constants/participantConstants';
import { POLICY_TYPE_AVOIDANCE } from '@Constants/policyConstants';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

/**
 * Three fixture behaviours that each produced a confident FALSE NEGATIVE while diagnosing seeded
 * avoidance — a test that executed the code, asserted successfully, and measured nothing.
 *
 * They are pinned here because the cost has already been paid twice. `TASKS.md` carried
 * "seeded avoidance is dead TWICE OVER" for months on the strength of a reading that trap 3 fully
 * explains, and the end-to-end proof was recorded as unwritable on that basis.
 *
 * None of these is a defect. Each is defensible behaviour that is merely INVISIBLE at the call site,
 * which is exactly the kind of thing a characterization test is for: if any of them changes, this
 * file fails and the change becomes a decision instead of a surprise.
 */

const DRAW_SIZE = 32;
const SEEDS_COUNT = 8;

function generatedDraw(nonRandom = 1) {
  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: DRAW_SIZE, seedsCount: SEEDS_COUNT, automated: false }],
    participantsProfile: { participantsCount: DRAW_SIZE },
    nonRandom,
  });
  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
  return { drawDefinition, structure: drawDefinition.structures.find((s: any) => s.stage === MAIN) };
}

describe('trap 1 — a duplicate APPLIED_POLICIES extension is silently ignored', () => {
  /**
   * FALSE CONCLUSION IT PREVENTS: "I attached the avoidance policy to the drawDefinition and the
   * code still cannot see it, therefore the policy does not reach positionSeeds."
   *
   * `getAppliedPolicies` reads the FIRST extension named APPLIED_POLICIES. A generated draw already
   * carries one holding the seeding policy, so a *pushed* second extension never wins. The policy
   * has to be MERGED into the existing value.
   */
  it('ignores a pushed second extension, and honours a merged one', () => {
    const { drawDefinition } = generatedDraw();
    const avoidance = { policyAttributes: [{ directive: 'groupParticipants' }] };

    // The generated draw already has one, which is the whole reason the push below loses.
    const preExisting = (drawDefinition.extensions ?? []).filter((e: any) => e.name === APPLIED_POLICIES);
    expect(preExisting.length).toEqual(1);

    drawDefinition.extensions.push({ name: APPLIED_POLICIES, value: { [POLICY_TYPE_AVOIDANCE]: avoidance } });
    const afterPush = getAppliedPolicies({ drawDefinition }).appliedPolicies;
    expect(afterPush?.[POLICY_TYPE_AVOIDANCE]).toBeUndefined();
    // Control: the read itself works — the FIRST extension's policies come back fine. Without this,
    // an appliedPolicies of `{}` for any unrelated reason would satisfy the assertion above.
    expect(Object.keys(afterPush ?? {}).length).toBeGreaterThan(0);

    // Merging into the first one is what actually works.
    drawDefinition.extensions = drawDefinition.extensions.filter((e: any) => e.name !== APPLIED_POLICIES);
    drawDefinition.extensions.push({
      name: APPLIED_POLICIES,
      value: { ...preExisting[0].value, [POLICY_TYPE_AVOIDANCE]: avoidance },
    });
    const afterMerge = getAppliedPolicies({ drawDefinition }).appliedPolicies;
    expect(afterMerge?.[POLICY_TYPE_AVOIDANCE]).toBeDefined();
  });
});

describe('trap 2 — a directive needs GROUP participants present in the participants array', () => {
  /**
   * FALSE CONCLUSION IT PREVENTS: "The policy is applied and the group exists, but no conflict group
   * is found, therefore directive avoidance is broken."
   *
   * `reorderSeedsForAvoidance` builds `idCollections.groupParticipants` by filtering the SAME
   * participants array it was handed for `participantType === GROUP`. Handing it a list filtered to
   * INDIVIDUAL empties the directive silently — the call succeeds and returns nothing.
   */
  it('finds nothing when GROUPs are filtered out, and finds the group when they are not', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ participantsCount: 8, setState: true });
    const individuals =
      tournamentEngine.getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } }).participants ?? [];
    const memberIds = individuals.slice(0, 2).map(({ participantId }: any) => participantId);
    expect(tournamentRecord).toBeDefined();

    tournamentEngine.createGroupParticipant({ individualParticipantIds: memberIds, groupName: 'Coaching Stable' });

    const policyAttributes = [{ directive: 'groupParticipants' }];
    const collectionsFrom = (participants: any[]) => ({
      groupParticipants: participants.filter((p) => p.participantType === GROUP).map((p) => p.participantId),
      teamParticipants: [],
      pairParticipants: [],
    });

    const all = tournamentEngine.getParticipants({ withGroupings: true }).participants ?? [];
    const onlyIndividuals = all.filter((p: any) => p.participantType === INDIVIDUAL);

    // Filtered — the shape that reads as "avoidance is broken".
    const filtered: any = getAttributeGroupings({
      idCollections: collectionsFrom(onlyIndividuals),
      targetParticipantIds: memberIds,
      participants: onlyIndividuals,
      policyAttributes,
    });
    expect(Object.keys(filtered)).toEqual([]);

    // Unfiltered — the group resolves, with both members.
    const unfiltered: any = getAttributeGroupings({
      idCollections: collectionsFrom(all),
      targetParticipantIds: memberIds,
      participants: all,
      policyAttributes,
    });
    const groupings = Object.values(unfiltered) as string[][];
    expect(groupings.some((ids) => ids.length === 2)).toEqual(true);
  });
});

describe('trap 3 — seedsCount alone creates seed SLOTS and seeds nobody', () => {
  /**
   * FALSE CONCLUSION IT PREVENTS: "I generated a 32 draw with 8 seeds and the avoidance branch never
   * runs, therefore the policy never reaches positionSeeds."
   *
   * It never runs because `unplacedSeedParticipantIds.length > 2` fails at ZERO — the guard's SEEDS
   * term, not its policy term. Seeding requires SEEDING scale items plus a `seedingScaleName`, which
   * mocksEngine's drawProfiles path applies internally (`applySeedingScales`) and a hand-built
   * addEvent + addEventEntries + generateDrawDefinition fixture does not.
   *
   * This is the trap that most likely produced the original "defect 2" diagnosis.
   */
  it('leaves seed slots unfilled without a seeding scale', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: DRAW_SIZE },
      setState: true,
    });
    const { event } = tournamentEngine.addEvent({ event: { eventName: 'unseeded', eventType: 'SINGLES' } });
    const participantIds = tournamentRecord.participants
      .slice(0, DRAW_SIZE)
      .map(({ participantId }: any) => participantId);
    tournamentEngine.addEventEntries({ eventId: event.eventId, participantIds });

    const result: any = tournamentEngine.generateDrawDefinition({ eventId: event.eventId, seedsCount: SEEDS_COUNT });
    const structure = result.drawDefinition.structures[0];
    const slots = structure.seedAssignments?.length ?? 0;
    const seeded = (structure.seedAssignments ?? []).filter((a: any) => a.participantId).length;

    expect(slots).toEqual(SEEDS_COUNT);
    expect(seeded).toEqual(0); // ← the whole point
  });

  it('fills them when mocksEngine drawProfiles supplies the seeding scale', () => {
    const { structure } = generatedDraw();
    const seeded = (structure.seedAssignments ?? []).filter((a: any) => a.participantId).length;
    expect(seeded).toEqual(SEEDS_COUNT);
  });
});
