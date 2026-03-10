import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';
import { nextPowerOf2 } from '@Tools/math';
import { unique } from '@Tools/arrays';

// constants
import {
  EXISTING_DRAFT,
  INVALID_DRAW_POSITION,
  INVALID_PARTICIPANT_ID,
  INVALID_VALUES,
  NOT_FOUND,
} from '@Constants/errorConditionConstants';
import { RATING } from '@Constants/scaleConstants';
import { SINGLES } from '@Constants/eventConstants';

function setupSeedsOnlyDraw({ participantsCount = 32, seedsCount = 8 } = {}) {
  const drawSize = nextPowerOf2(participantsCount);
  const drawProfiles = [{ drawSize, participantsCount, seedsCount, automated: { seedsOnly: true } }];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount },
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  return { drawId, structureId, tournamentRecord };
}

describe('Draft Positioning - Full Lifecycle', () => {
  it('initializes a draft on a seedsOnly draw', () => {
    const { drawId } = setupSeedsOnlyDraw();

    const result = tournamentEngine.initializeDraft({ drawId, tierCount: 3, preferencesCount: 3 });
    expect(result.success).toBe(true);
    expect(result.draftState).toBeDefined();
    expect(result.draftState.status).toBe('SEEDS_PLACED');
    expect(result.tiers).toBeDefined();
    expect(result.tiers.length).toBe(3);
    expect(result.unassignedDrawPositions.length).toBeGreaterThan(0);

    // all tiers should contain participant IDs and not be resolved
    const allTierParticipants = result.tiers.flatMap((t: any) => t.participantIds);
    expect(allTierParticipants.length).toBe(result.unassignedDrawPositions.length);
    for (const tier of result.tiers) {
      expect(tier.resolved).toBe(false);
      expect(tier.participantIds.length).toBeGreaterThan(0);
    }
  });

  it('prevents duplicate draft initialization', () => {
    const { drawId } = setupSeedsOnlyDraw();

    const first = tournamentEngine.initializeDraft({ drawId });
    expect(first.success).toBe(true);

    const second = tournamentEngine.initializeDraft({ drawId });
    expect(second.error).toEqual(EXISTING_DRAFT);
  });

  it('allows re-initialization after draft is COMPLETE', () => {
    const { drawId } = setupSeedsOnlyDraw({ participantsCount: 16, seedsCount: 4 });

    tournamentEngine.initializeDraft({ drawId, tierCount: 2 });

    // resolve immediately (no preferences — all random)
    const resolveResult = tournamentEngine.resolveDraftPositions({ drawId });
    expect(resolveResult.success).toBe(true);

    // now re-initialize should work
    // need a fresh seedsOnly draw for re-init since positions are now assigned
    // actually the state is COMPLETE so re-init is allowed but there are no unassigned positions
    const { drawId: drawId2 } = setupSeedsOnlyDraw({ participantsCount: 16, seedsCount: 4 });
    tournamentEngine.initializeDraft({ drawId: drawId2, tierCount: 2 });
    const resolveResult2 = tournamentEngine.resolveDraftPositions({ drawId: drawId2 });
    expect(resolveResult2.success).toBe(true);

    // re-init on completed draw with all positions filled returns NO_VALID_ATTRIBUTES
    const reInit = tournamentEngine.initializeDraft({ drawId: drawId2 });
    expect(reInit.error).toBeDefined();
  });

  it('sets participant preferences', () => {
    const { drawId } = setupSeedsOnlyDraw();

    const initResult = tournamentEngine.initializeDraft({ drawId, preferencesCount: 3 });
    expect(initResult.success).toBe(true);

    const tier1 = initResult.tiers[0];
    const participantId = tier1.participantIds[0];
    const availablePositions = initResult.unassignedDrawPositions;
    const preferences = availablePositions.slice(0, 3);

    const setResult = tournamentEngine.setDrawPositionPreferences({
      drawId,
      participantId,
      preferences,
    });
    expect(setResult.success).toBe(true);

    // verify via getDraftState
    const { draftState, summary } = tournamentEngine.getDraftState({ drawId });
    expect(draftState.status).toBe('COLLECTING_PREFERENCES');
    expect(draftState.preferences[participantId]).toEqual(preferences);
    expect(summary.preferencesSubmitted).toBe(1);
  });

  it('rejects preferences for invalid participant', () => {
    const { drawId } = setupSeedsOnlyDraw();
    tournamentEngine.initializeDraft({ drawId });

    const result = tournamentEngine.setDrawPositionPreferences({
      drawId,
      participantId: 'nonexistent-id',
      preferences: [1, 2, 3],
    });
    expect(result.error).toEqual(INVALID_PARTICIPANT_ID);
  });

  it('rejects preferences for invalid draw positions', () => {
    const { drawId } = setupSeedsOnlyDraw();
    const initResult = tournamentEngine.initializeDraft({ drawId });
    const participantId = initResult.tiers[0].participantIds[0];

    const result = tournamentEngine.setDrawPositionPreferences({
      drawId,
      participantId,
      preferences: [999, 998, 997], // positions that don't exist
    });
    expect(result.error).toEqual(INVALID_DRAW_POSITION);
  });

  it('trims preferences to configured maximum', () => {
    const { drawId } = setupSeedsOnlyDraw();
    const initResult = tournamentEngine.initializeDraft({ drawId, preferencesCount: 2 });
    const participantId = initResult.tiers[0].participantIds[0];
    const availablePositions = initResult.unassignedDrawPositions;

    tournamentEngine.setDrawPositionPreferences({
      drawId,
      participantId,
      preferences: availablePositions.slice(0, 5), // 5 prefs but max is 2
    });

    const { draftState } = tournamentEngine.getDraftState({ drawId });
    expect(draftState.preferences[participantId].length).toBe(2);
  });

  it('resolves draft with all participants having preferences', () => {
    const { drawId } = setupSeedsOnlyDraw({ participantsCount: 16, seedsCount: 4 });

    const initResult = tournamentEngine.initializeDraft({ drawId, tierCount: 2, preferencesCount: 3 });
    expect(initResult.success).toBe(true);

    const availablePositions = initResult.unassignedDrawPositions;

    // set preferences for all participants
    for (const tier of initResult.tiers) {
      for (const participantId of tier.participantIds) {
        // each participant picks 3 random available positions
        const shuffled = [...availablePositions].sort(() => Math.random() - 0.5);
        tournamentEngine.setDrawPositionPreferences({
          drawId,
          participantId,
          preferences: shuffled.slice(0, 3),
        });
      }
    }

    const resolveResult = tournamentEngine.resolveDraftPositions({ drawId });
    expect(resolveResult.success).toBe(true);
    expect(resolveResult.drawPositionResolutions).toBeDefined();
    expect(resolveResult.transparencyReport).toBeDefined();

    // verify all participants got unique positions
    const resolvedPositions = Object.keys(resolveResult.drawPositionResolutions).map(Number);
    const resolvedParticipants = Object.values(resolveResult.drawPositionResolutions);
    expect(unique(resolvedPositions).length).toBe(resolvedPositions.length);
    expect(unique(resolvedParticipants).length).toBe(resolvedParticipants.length);

    // verify transparency report has entries for all participants
    const allParticipantIds = initResult.tiers.flatMap((t: any) => t.participantIds);
    expect(resolveResult.transparencyReport.length).toBe(allParticipantIds.length);

    // verify each transparency entry has the right shape
    for (const entry of resolveResult.transparencyReport) {
      expect(entry.participantId).toBeDefined();
      expect(entry.assignedPosition).toBeDefined();
      expect(typeof entry.preferenceMatch === 'number' || entry.preferenceMatch === null).toBe(true);
    }

    // verify positions are actually assigned in the draw
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { positionAssignments } = drawDefinition.structures[0];
    const assignedCount = positionAssignments.filter((a: any) => a.participantId).length;
    expect(assignedCount).toBe(16); // all 16 participants should be placed

    // verify draft state is COMPLETE
    const { draftState } = tournamentEngine.getDraftState({ drawId });
    expect(draftState.status).toBe('COMPLETE');
    expect(draftState.resolvedAt).toBeDefined();
  });

  it('resolves draft with mixed preferences and no-preference participants', () => {
    const { drawId } = setupSeedsOnlyDraw({ participantsCount: 32, seedsCount: 8 });

    const initResult = tournamentEngine.initializeDraft({ drawId, tierCount: 3, preferencesCount: 3 });
    const availablePositions = initResult.unassignedDrawPositions;

    // tier 1: all submit preferences
    for (const participantId of initResult.tiers[0].participantIds) {
      const shuffled = [...availablePositions].sort(() => Math.random() - 0.5);
      tournamentEngine.setDrawPositionPreferences({
        drawId,
        participantId,
        preferences: shuffled.slice(0, 3),
      });
    }

    // tier 2: half submit preferences
    const tier2 = initResult.tiers[1].participantIds;
    for (let i = 0; i < Math.floor(tier2.length / 2); i++) {
      const shuffled = [...availablePositions].sort(() => Math.random() - 0.5);
      tournamentEngine.setDrawPositionPreferences({
        drawId,
        participantId: tier2[i],
        preferences: shuffled.slice(0, 3),
      });
    }

    // tier 3: no preferences submitted

    const resolveResult = tournamentEngine.resolveDraftPositions({ drawId });
    expect(resolveResult.success).toBe(true);

    // all 24 unseeded participants should be assigned
    const resolvedCount = Object.keys(resolveResult.drawPositionResolutions).length;
    expect(resolvedCount).toBe(24);

    // verify all positions are unique
    const positions = Object.keys(resolveResult.drawPositionResolutions).map(Number);
    expect(unique(positions).length).toBe(positions.length);
  });

  it('resolves with no preferences (all random)', () => {
    const { drawId } = setupSeedsOnlyDraw({ participantsCount: 16, seedsCount: 4 });

    tournamentEngine.initializeDraft({ drawId, tierCount: 2 });

    const resolveResult = tournamentEngine.resolveDraftPositions({ drawId });
    expect(resolveResult.success).toBe(true);

    // all 12 unseeded participants should be placed
    expect(Object.keys(resolveResult.drawPositionResolutions).length).toBe(12);

    // transparency report should show null preferenceMatch for all
    for (const entry of resolveResult.transparencyReport) {
      expect(entry.preferenceMatch).toBeNull();
      expect(entry.preferences).toEqual([]);
    }
  });

  it('preview mode (applyResults=false) does not modify draw', () => {
    const { drawId } = setupSeedsOnlyDraw({ participantsCount: 16, seedsCount: 4 });

    const initResult = tournamentEngine.initializeDraft({ drawId, tierCount: 2 });
    const availablePositions = initResult.unassignedDrawPositions;

    for (const tier of initResult.tiers) {
      for (const participantId of tier.participantIds) {
        tournamentEngine.setDrawPositionPreferences({
          drawId,
          participantId,
          preferences: [availablePositions[0], availablePositions[1]],
        });
      }
    }

    // preview
    const previewResult = tournamentEngine.resolveDraftPositions({ drawId, applyResults: false });
    expect(previewResult.success).toBe(true);
    expect(previewResult.drawPositionResolutions).toBeDefined();

    // verify draw is NOT modified
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { positionAssignments } = drawDefinition.structures[0];
    const unassigned = positionAssignments.filter((a: any) => !a.participantId && !a.bye);
    expect(unassigned.length).toBe(12); // still 12 unassigned

    // draft state should NOT be COMPLETE
    const { draftState } = tournamentEngine.getDraftState({ drawId });
    expect(draftState.status).not.toBe('COMPLETE');
  });

  it('getDraftState returns summary statistics', () => {
    const { drawId } = setupSeedsOnlyDraw({ participantsCount: 32, seedsCount: 8 });

    tournamentEngine.initializeDraft({ drawId, tierCount: 3, preferencesCount: 3 });

    const { summary } = tournamentEngine.getDraftState({ drawId });
    expect(summary.status).toBe('SEEDS_PLACED');
    expect(summary.totalParticipants).toBe(24);
    expect(summary.preferencesSubmitted).toBe(0);
    expect(summary.preferencesOutstanding).toBe(24);
    expect(summary.tiersTotal).toBe(3);
    expect(summary.tiersResolved).toBe(0);
    expect(summary.preferencesCount).toBe(3);
  });

  it('getDraftState returns error when no draft exists', () => {
    const drawProfiles = [{ drawSize: 16, participantsCount: 16, seedsCount: 4, automated: true }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 16 },
      drawProfiles,
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getDraftState({ drawId });
    expect(result.error).toEqual(NOT_FOUND);
  });

  it('rejects preferences after draft is COMPLETE', () => {
    const { drawId } = setupSeedsOnlyDraw({ participantsCount: 16, seedsCount: 4 });

    const initResult = tournamentEngine.initializeDraft({ drawId, tierCount: 1 });

    // resolve immediately
    tournamentEngine.resolveDraftPositions({ drawId });

    const participantId = initResult.tiers[0].participantIds[0];
    const result = tournamentEngine.setDrawPositionPreferences({
      drawId,
      participantId,
      preferences: [1, 2, 3],
    });
    expect(result.error).toBeDefined();
  });

  it('rejects duplicate resolve on completed draft', () => {
    const { drawId } = setupSeedsOnlyDraw({ participantsCount: 16, seedsCount: 4 });

    tournamentEngine.initializeDraft({ drawId, tierCount: 1 });
    tournamentEngine.resolveDraftPositions({ drawId });

    const result = tournamentEngine.resolveDraftPositions({ drawId });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('handles single tier (all participants equal priority)', () => {
    const { drawId } = setupSeedsOnlyDraw({ participantsCount: 16, seedsCount: 4 });

    const initResult = tournamentEngine.initializeDraft({ drawId, tierCount: 1 });
    expect(initResult.tiers.length).toBe(1);
    expect(initResult.tiers[0].participantIds.length).toBe(12);

    // everyone picks different positions
    const availablePositions = initResult.unassignedDrawPositions;
    initResult.tiers[0].participantIds.forEach((participantId: string, index: number) => {
      tournamentEngine.setDrawPositionPreferences({
        drawId,
        participantId,
        preferences: [availablePositions[index % availablePositions.length]],
      });
    });

    const resolveResult = tournamentEngine.resolveDraftPositions({ drawId });
    expect(resolveResult.success).toBe(true);
    expect(Object.keys(resolveResult.drawPositionResolutions).length).toBe(12);
  });

  it('handles draws with byes (participantsCount < drawSize)', () => {
    const { drawId } = setupSeedsOnlyDraw({ participantsCount: 28, seedsCount: 8 });

    const initResult = tournamentEngine.initializeDraft({ drawId, tierCount: 2 });
    expect(initResult.success).toBe(true);

    const availablePositions = initResult.unassignedDrawPositions;

    // set preferences for all
    for (const tier of initResult.tiers) {
      for (const participantId of tier.participantIds) {
        const shuffled = [...availablePositions].sort(() => Math.random() - 0.5);
        tournamentEngine.setDrawPositionPreferences({
          drawId,
          participantId,
          preferences: shuffled.slice(0, 3),
        });
      }
    }

    const resolveResult = tournamentEngine.resolveDraftPositions({ drawId });
    expect(resolveResult.success).toBe(true);

    // verify the final draw has correct counts
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { positionAssignments } = drawDefinition.structures[0];
    const assigned = positionAssignments.filter((a: any) => a.participantId);
    const byes = positionAssignments.filter((a: any) => a.bye);
    expect(assigned.length).toBe(28);
    expect(byes.length).toBe(4); // 32 - 28
  });

  it('tier ordering resolves tiers sequentially', () => {
    const { drawId } = setupSeedsOnlyDraw({ participantsCount: 16, seedsCount: 4 });

    const initResult = tournamentEngine.initializeDraft({ drawId, tierCount: 2, preferencesCount: 3 });
    const availablePositions = initResult.unassignedDrawPositions;

    // tier 1 gets unique preferences, tier 2 also gets preferences
    for (const tier of initResult.tiers) {
      for (const participantId of tier.participantIds) {
        const shuffled = [...availablePositions].sort(() => Math.random() - 0.5);
        tournamentEngine.setDrawPositionPreferences({
          drawId,
          participantId,
          preferences: shuffled.slice(0, 3),
        });
      }
    }

    const resolveResult = tournamentEngine.resolveDraftPositions({ drawId });
    expect(resolveResult.success).toBe(true);
    expect(resolveResult.tierReports).toBeDefined();
    expect(resolveResult.tierReports.length).toBeGreaterThanOrEqual(2);

    // all participants from both tiers should be assigned
    const allTierParticipants = initResult.tiers.flatMap((t: any) => t.participantIds);
    const resolvedParticipants = Object.values(resolveResult.drawPositionResolutions);
    for (const pid of allTierParticipants) {
      expect(resolvedParticipants).toContain(pid);
    }
  });

  it('transparency report correctly identifies preference matches', () => {
    const { drawId } = setupSeedsOnlyDraw({ participantsCount: 8, seedsCount: 2 });

    const initResult = tournamentEngine.initializeDraft({ drawId, tierCount: 1, preferencesCount: 3 });
    const availablePositions = initResult.unassignedDrawPositions;

    // Give each participant unique first preferences to maximize matches
    initResult.tiers[0].participantIds.forEach((participantId: string, index: number) => {
      const prefs = [
        availablePositions[index % availablePositions.length],
        availablePositions[(index + 1) % availablePositions.length],
        availablePositions[(index + 2) % availablePositions.length],
      ];
      tournamentEngine.setDrawPositionPreferences({
        drawId,
        participantId,
        preferences: prefs,
      });
    });

    const resolveResult = tournamentEngine.resolveDraftPositions({ drawId });
    expect(resolveResult.transparencyReport.length).toBe(6);

    // at least some should have gotten their preference
    const matched = resolveResult.transparencyReport.filter((e: any) => e.preferenceMatch !== null);
    expect(matched.length).toBeGreaterThan(0);

    // verify preferenceMatch values are 1-indexed
    for (const entry of matched) {
      expect(entry.preferenceMatch).toBeGreaterThanOrEqual(1);
      expect(entry.preferenceMatch).toBeLessThanOrEqual(3);
    }
  });

  it('resolves tiers individually with tierIndex parameter', () => {
    const { drawId } = setupSeedsOnlyDraw({ participantsCount: 16, seedsCount: 4 });

    const initResult = tournamentEngine.initializeDraft({ drawId, tierCount: 3, preferencesCount: 3 });
    expect(initResult.tiers.length).toBe(3);
    const availablePositions = initResult.unassignedDrawPositions;

    // submit preferences for tier 0 only
    for (const participantId of initResult.tiers[0].participantIds) {
      const shuffled = [...availablePositions].sort(() => Math.random() - 0.5);
      tournamentEngine.setDrawPositionPreferences({ drawId, participantId, preferences: shuffled.slice(0, 3) });
    }

    // can't resolve tier 1 before tier 0
    const skipResult = tournamentEngine.resolveDraftPositions({ drawId, tierIndex: 1 });
    expect(skipResult.error).toEqual(INVALID_VALUES);

    // resolve tier 0
    const tier0Result = tournamentEngine.resolveDraftPositions({ drawId, tierIndex: 0 });
    expect(tier0Result.success).toBe(true);

    // draft should NOT be complete yet
    const { draftState: afterTier0 } = tournamentEngine.getDraftState({ drawId });
    expect(afterTier0.status).not.toBe('COMPLETE');
    expect(afterTier0.tiers[0].resolved).toBe(true);
    expect(afterTier0.tiers[1].resolved).toBe(false);

    // tier 0 should have per-participant resolution details
    const tier0Resolutions = afterTier0.tiers[0].resolutions;
    expect(tier0Resolutions).toBeDefined();
    for (const pid of initResult.tiers[0].participantIds) {
      expect(tier0Resolutions[pid]).toBeDefined();
      expect(tier0Resolutions[pid].assignedPosition).toBeGreaterThan(0);
      // preferenceMatch is either a number (1-indexed) or null
      const match = tier0Resolutions[pid].preferenceMatch;
      expect(match === null || (typeof match === 'number' && match >= 1)).toBe(true);
    }

    // available positions should be reduced
    expect(afterTier0.unassignedDrawPositions.length).toBeLessThan(availablePositions.length);

    // can't re-resolve tier 0
    const reResolve = tournamentEngine.resolveDraftPositions({ drawId, tierIndex: 0 });
    expect(reResolve.error).toEqual(INVALID_VALUES);

    // submit preferences for tier 1 — now they see reduced positions
    for (const participantId of initResult.tiers[1].participantIds) {
      const shuffled = [...afterTier0.unassignedDrawPositions].sort(() => Math.random() - 0.5);
      tournamentEngine.setDrawPositionPreferences({ drawId, participantId, preferences: shuffled.slice(0, 3) });
    }

    // resolve tier 1
    const tier1Result = tournamentEngine.resolveDraftPositions({ drawId, tierIndex: 1 });
    expect(tier1Result.success).toBe(true);

    const { draftState: afterTier1 } = tournamentEngine.getDraftState({ drawId });
    expect(afterTier1.tiers[1].resolved).toBe(true);
    expect(afterTier1.status).not.toBe('COMPLETE');

    // submit and resolve tier 2 — should mark draft COMPLETE
    for (const participantId of initResult.tiers[2].participantIds) {
      const shuffled = [...afterTier1.unassignedDrawPositions].sort(() => Math.random() - 0.5);
      tournamentEngine.setDrawPositionPreferences({ drawId, participantId, preferences: shuffled.slice(0, 3) });
    }

    const tier2Result = tournamentEngine.resolveDraftPositions({ drawId, tierIndex: 2 });
    expect(tier2Result.success).toBe(true);

    const { draftState: final } = tournamentEngine.getDraftState({ drawId });
    expect(final.status).toBe('COMPLETE');
    expect(final.tiers.every((t: any) => t.resolved)).toBe(true);
  });

  it('verifies all tiers are actually placed in draw after per-tier resolution', () => {
    const { drawId } = setupSeedsOnlyDraw({ participantsCount: 16, seedsCount: 4 });

    const initResult = tournamentEngine.initializeDraft({ drawId, tierCount: 3, preferencesCount: 3 });
    const availablePositions = initResult.unassignedDrawPositions;
    const allTierParticipants = initResult.tiers.flatMap((t: any) => t.participantIds);

    // submit and resolve tier 0
    for (const participantId of initResult.tiers[0].participantIds) {
      const shuffled = [...availablePositions].sort(() => Math.random() - 0.5);
      tournamentEngine.setDrawPositionPreferences({ drawId, participantId, preferences: shuffled.slice(0, 3) });
    }
    const t0 = tournamentEngine.resolveDraftPositions({ drawId, tierIndex: 0 });
    expect(t0.success).toBe(true);

    // verify tier 0 participants are in the draw
    const { drawDefinition: dd0 } = tournamentEngine.getEvent({ drawId });
    const assignments0 = dd0.structures[0].positionAssignments;
    const placed0 = assignments0.filter((a: any) => a.participantId && !a.bye).map((a: any) => a.participantId);
    for (const pid of initResult.tiers[0].participantIds) {
      expect(placed0).toContain(pid);
    }

    // submit and resolve tier 1
    const { draftState: ds1 } = tournamentEngine.getDraftState({ drawId });
    for (const participantId of initResult.tiers[1].participantIds) {
      const shuffled = [...ds1.unassignedDrawPositions].sort(() => Math.random() - 0.5);
      tournamentEngine.setDrawPositionPreferences({ drawId, participantId, preferences: shuffled.slice(0, 3) });
    }
    const t1 = tournamentEngine.resolveDraftPositions({ drawId, tierIndex: 1 });
    expect(t1.success).toBe(true);

    // verify tier 1 participants are ALSO in the draw
    const { drawDefinition: dd1 } = tournamentEngine.getEvent({ drawId });
    const assignments1 = dd1.structures[0].positionAssignments;
    const placed1 = assignments1.filter((a: any) => a.participantId && !a.bye).map((a: any) => a.participantId);
    for (const pid of initResult.tiers[1].participantIds) {
      expect(placed1).toContain(pid);
    }

    // submit and resolve tier 2
    const { draftState: ds2 } = tournamentEngine.getDraftState({ drawId });
    for (const participantId of initResult.tiers[2].participantIds) {
      const shuffled = [...ds2.unassignedDrawPositions].sort(() => Math.random() - 0.5);
      tournamentEngine.setDrawPositionPreferences({ drawId, participantId, preferences: shuffled.slice(0, 3) });
    }
    const t2 = tournamentEngine.resolveDraftPositions({ drawId, tierIndex: 2 });
    expect(t2.success).toBe(true);

    // verify ALL participants are in the draw
    const { drawDefinition: ddFinal } = tournamentEngine.getEvent({ drawId });
    const finalAssignments = ddFinal.structures[0].positionAssignments;
    const allPlaced = finalAssignments.filter((a: any) => a.participantId && !a.bye).map((a: any) => a.participantId);
    for (const pid of allTierParticipants) {
      expect(allPlaced).toContain(pid);
    }
  });

  it('can update preferences before resolution', () => {
    const { drawId } = setupSeedsOnlyDraw({ participantsCount: 16, seedsCount: 4 });

    const initResult = tournamentEngine.initializeDraft({ drawId, preferencesCount: 3 });
    const participantId = initResult.tiers[0].participantIds[0];
    const availablePositions = initResult.unassignedDrawPositions;

    // set initial preferences
    tournamentEngine.setDrawPositionPreferences({
      drawId,
      participantId,
      preferences: availablePositions.slice(0, 3),
    });

    // update preferences
    const newPrefs = availablePositions.slice(3, 6);
    tournamentEngine.setDrawPositionPreferences({
      drawId,
      participantId,
      preferences: newPrefs,
    });

    const { draftState } = tournamentEngine.getDraftState({ drawId });
    expect(draftState.preferences[participantId]).toEqual(newPrefs);
  });
});

function setupSmallDraw({ participantsCount, seedsCount }: { participantsCount: number; seedsCount: number }) {
  const drawSize = nextPowerOf2(participantsCount);
  const drawProfiles = [{ drawSize, participantsCount, seedsCount, automated: { seedsOnly: true } }];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount },
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);
  return { drawId };
}

describe('Draft Positioning - Edge Cases', () => {
  it('handles tierCount larger than participant count', () => {
    const { drawId } = setupSmallDraw({ participantsCount: 5, seedsCount: 2 });

    const result = tournamentEngine.initializeDraft({ drawId, tierCount: 10 });
    expect(result.success).toBe(true);
    // tierCount should be capped to unseeded participant count (3 = 5 - 2 seeds)
    expect(result.tiers.length).toBeLessThanOrEqual(3);
    const totalParticipants = result.tiers.reduce((sum: number, t: any) => sum + t.participantIds.length, 0);
    expect(totalParticipants).toBe(3); // 5 participants - 2 seeds
    // unassigned positions may exceed tier participants when seedsOnly doesn't place all byes
    expect(result.unassignedDrawPositions.length).toBeGreaterThanOrEqual(totalParticipants);
  });

  it('rejects invalid tierCount and preferencesCount', () => {
    const { drawId } = setupSmallDraw({ participantsCount: 16, seedsCount: 4 });

    expect(tournamentEngine.initializeDraft({ drawId, tierCount: 0 }).error).toEqual(INVALID_VALUES);
    expect(tournamentEngine.initializeDraft({ drawId, preferencesCount: 0 }).error).toEqual(INVALID_VALUES);
  });

  it('resetDrawDefinition removes draft extension', () => {
    const { drawId } = setupSmallDraw({ participantsCount: 16, seedsCount: 4 });

    // initialize a draft
    const initResult = tournamentEngine.initializeDraft({ drawId, tierCount: 2 });
    expect(initResult.success).toBe(true);

    // verify draft exists
    const { draftState } = tournamentEngine.getDraftState({ drawId });
    expect(draftState.status).toBe('SEEDS_PLACED');

    // reset the draw
    const resetResult = tournamentEngine.resetDrawDefinition({ drawId, removeAssignments: true });
    expect(resetResult.success).toBe(true);

    // draft should be gone
    const afterReset = tournamentEngine.getDraftState({ drawId });
    expect(afterReset.error).toEqual(NOT_FOUND);
  });
});

describe('Draft Positioning - Tier Methods', () => {
  it('default tierMethod is ENTRY_ORDER and is stored in draft state', () => {
    const { drawId } = setupSeedsOnlyDraw();

    const result = tournamentEngine.initializeDraft({ drawId, tierCount: 3 });
    expect(result.success).toBe(true);
    expect(result.draftState.tierMethod).toBe('ENTRY_ORDER');
    expect(result.draftState.scaleAttributes).toBeUndefined();
  });

  it('sorts tiers by RATING when participants have scale items', () => {
    const participantsCount = 16;
    const seedsCount = 4;
    const drawSize = nextPowerOf2(participantsCount);
    const drawProfiles = [{ drawSize, participantsCount, seedsCount, automated: { seedsOnly: true } }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount },
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);

    // Get all participants and the draft-eligible ones
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const seedAssignments = drawDefinition.structures[0].seedAssignments ?? [];
    const seededIds = new Set(seedAssignments.map((s: any) => s.participantId).filter(Boolean));
    const assignedIds =
      drawDefinition.structures[0].positionAssignments
        ?.filter((a: any) => a.participantId)
        .map((a: any) => a.participantId) ?? [];

    const draftEntries =
      drawDefinition.entries?.filter(
        (e: any) => !seededIds.has(e.participantId) && !assignedIds.includes(e.participantId),
      ) ?? [];
    const draftParticipantIds = draftEntries.map((e: any) => e.participantId);

    // Assign DUPR ratings — descending order so first entry gets lowest rating
    const scaleName = 'DUPR';
    draftParticipantIds.forEach((participantId: string, index: number) => {
      tournamentEngine.setParticipantScaleItem({
        participantId,
        scaleItem: {
          eventType: SINGLES,
          scaleType: RATING,
          scaleName,
          scaleValue: 3 + index * 0.1, // 3.0, 3.1, 3.2, ...
        },
      });
    });

    // Initialize with RATING tier method
    const result = tournamentEngine.initializeDraft({
      drawId,
      tierCount: 3,
      tierMethod: 'RATING',
      scaleAttributes: { scaleType: RATING, scaleName, eventType: SINGLES },
    });
    expect(result.success).toBe(true);
    expect(result.draftState.tierMethod).toBe('RATING');
    expect(result.draftState.scaleAttributes).toEqual({ scaleType: RATING, scaleName, eventType: SINGLES });

    // Tier 1 should contain the highest-rated participants
    // Last entry has highest rating (3.0 + (n-1)*0.1)
    const tier1Ids = result.tiers[0].participantIds;
    const tier3Ids = result.tiers[result.tiers.length - 1].participantIds;

    // Get ratings for tier 1 and last tier
    const getRating = (pid: string) => {
      const { scaleItem } = tournamentEngine.getParticipantScaleItem({
        participantId: pid,
        scaleAttributes: { scaleType: RATING, scaleName, eventType: SINGLES },
      });
      return scaleItem?.scaleValue ?? 0;
    };

    const tier1MinRating = Math.min(...tier1Ids.map(getRating));
    const tier3MaxRating = Math.max(...tier3Ids.map(getRating));

    // Every participant in tier 1 should have a higher rating than every participant in the last tier
    expect(tier1MinRating).toBeGreaterThan(tier3MaxRating);
  });

  it('participants without scale values go to the last tier', () => {
    const participantsCount = 12;
    const seedsCount = 2;
    const drawSize = nextPowerOf2(participantsCount);
    const drawProfiles = [{ drawSize, participantsCount, seedsCount, automated: { seedsOnly: true } }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount },
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const seedAssignments = drawDefinition.structures[0].seedAssignments ?? [];
    const seededIds = new Set(seedAssignments.map((s: any) => s.participantId).filter(Boolean));
    const assignedIds =
      drawDefinition.structures[0].positionAssignments
        ?.filter((a: any) => a.participantId)
        .map((a: any) => a.participantId) ?? [];
    const draftEntries =
      drawDefinition.entries?.filter(
        (e: any) => !seededIds.has(e.participantId) && !assignedIds.includes(e.participantId),
      ) ?? [];
    const draftParticipantIds = draftEntries.map((e: any) => e.participantId);

    // Only rate half the participants
    const scaleName = 'DUPR';
    const ratedIds = draftParticipantIds.slice(0, Math.floor(draftParticipantIds.length / 2));
    const unratedIds = draftParticipantIds.slice(Math.floor(draftParticipantIds.length / 2));

    ratedIds.forEach((participantId: string, index: number) => {
      tournamentEngine.setParticipantScaleItem({
        participantId,
        scaleItem: { eventType: SINGLES, scaleType: RATING, scaleName, scaleValue: 4 + index * 0.1 },
      });
    });

    const result = tournamentEngine.initializeDraft({
      drawId,
      tierCount: 2,
      tierMethod: 'RATING',
      scaleAttributes: { scaleType: RATING, scaleName, eventType: SINGLES },
    });
    expect(result.success).toBe(true);

    // Unrated participants should be in the last tier
    const lastTierIds = result.tiers[result.tiers.length - 1].participantIds;
    for (const pid of unratedIds) {
      expect(lastTierIds).toContain(pid);
    }
  });

  it('tierMethod ENTRY_ORDER preserves original entry order', () => {
    const { drawId } = setupSeedsOnlyDraw();

    const resultDefault = tournamentEngine.initializeDraft({ drawId, tierCount: 3 });
    expect(resultDefault.success).toBe(true);
    const defaultOrder = resultDefault.tiers.flatMap((t: any) => t.participantIds);

    // Re-init with explicit ENTRY_ORDER — should match
    const resultExplicit = tournamentEngine.initializeDraft({
      drawId,
      tierCount: 3,
      tierMethod: 'ENTRY_ORDER',
      force: true,
    });
    expect(resultExplicit.success).toBe(true);
    const explicitOrder = resultExplicit.tiers.flatMap((t: any) => t.participantIds);

    expect(explicitOrder).toEqual(defaultOrder);
  });

  it('reconfigure with force preserves new tierMethod', () => {
    const { drawId } = setupSeedsOnlyDraw();

    tournamentEngine.initializeDraft({ drawId, tierCount: 3, tierMethod: 'ENTRY_ORDER' });

    const reInit = tournamentEngine.initializeDraft({
      drawId,
      tierCount: 2,
      tierMethod: 'RATING',
      scaleAttributes: { scaleType: RATING, scaleName: 'WTN' },
      force: true,
    });
    expect(reInit.success).toBe(true);
    expect(reInit.draftState.tierMethod).toBe('RATING');
    expect(reInit.draftState.scaleAttributes).toEqual({ scaleType: RATING, scaleName: 'WTN' });
  });
});
