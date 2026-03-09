import { assignDrawPosition as assignPosition } from '@Mutate/matchUps/drawPositions/positionAssignment';
import { resolveDrawPositions } from '@Assemblies/generators/drawDefinitions/drawPositionsResolver';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { addExtension } from '@Mutate/extensions/addExtension';
import { findExtension } from '@Acquire/findExtension';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION, NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { DRAFT_STATE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type ResolveDraftPositionsArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  applyResults?: boolean;
  tierIndex?: number;
  event?: Event;
};

export function resolveDraftPositions({
  tournamentRecord,
  drawDefinition,
  applyResults = true,
  tierIndex: targetTierIndex,
  event,
}: ResolveDraftPositionsArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const { extension } = findExtension({ element: drawDefinition, name: DRAFT_STATE });
  if (!extension?.value) return { error: NOT_FOUND, info: 'No active draft found' };

  const draftState = extension.value;
  if (draftState.status === 'COMPLETE') return { error: INVALID_VALUES, info: 'Draft is already complete' };

  const structureId = draftState.structureId;
  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: NOT_FOUND, info: 'Structure not found' };

  const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId });
  if (!positionAssignments) return { error: NOT_FOUND, info: 'No position assignments' };

  // resolve tiers sequentially — earlier tiers get priority
  const allResolutions: Record<number, string> = {};
  const tierReports: any[] = [];

  // deep copy so working mutations don't affect the actual draw structure
  const workingAssignments = positionAssignments.map((a: any) => ({ ...a }));

  // validate targetTierIndex if provided
  if (targetTierIndex !== undefined) {
    if (targetTierIndex < 0 || targetTierIndex >= draftState.tiers.length) {
      return { error: INVALID_VALUES, info: 'Invalid tier index' };
    }
    if (draftState.tiers[targetTierIndex].resolved) {
      return { error: INVALID_VALUES, info: 'Tier already resolved' };
    }
    // ensure all earlier tiers are resolved
    for (let i = 0; i < targetTierIndex; i++) {
      if (!draftState.tiers[i].resolved) {
        return { error: INVALID_VALUES, info: `Tier ${i + 1} must be resolved first` };
      }
    }
  }

  for (let tierIndex = 0; tierIndex < draftState.tiers.length; tierIndex++) {
    const tier = draftState.tiers[tierIndex];
    if (tier.resolved) continue;
    if (targetTierIndex !== undefined && tierIndex !== targetTierIndex) continue;

    // compute currently unassigned positions from working copy
    const currentlyUnassigned = new Set(
      workingAssignments.filter((a: any) => !a.participantId && !a.bye && !a.qualifier).map((a: any) => a.drawPosition),
    );

    // build participantFactors for this tier, filtering preferences to only include
    // currently unassigned positions (resolveDrawPositions doesn't do this internally)
    const participantsWithPreferences: Record<string, { preferences: number[] }> = {};
    const participantsWithoutPreferences: string[] = [];

    for (const participantId of tier.participantIds) {
      const prefs = draftState.preferences[participantId];
      const validPrefs = prefs?.filter((p: number) => currentlyUnassigned.has(p));
      if (validPrefs?.length) {
        participantsWithPreferences[participantId] = { preferences: validPrefs };
      } else {
        participantsWithoutPreferences.push(participantId);
      }
    }

    // resolve participants who submitted preferences
    if (Object.keys(participantsWithPreferences).length) {
      const { drawPositionResolutions, report } = resolveDrawPositions({
        positionAssignments: workingAssignments,
        participantFactors: participantsWithPreferences,
      });

      if (drawPositionResolutions) {
        for (const [dp, pid] of Object.entries(drawPositionResolutions)) {
          allResolutions[Number(dp)] = pid as string;
          // update working assignments so next tier sees these as taken
          const assignment = workingAssignments.find((a) => a.drawPosition === Number(dp));
          if (assignment) assignment.participantId = pid as string;
        }
      }

      tierReports.push({ tierIndex, preferenceReport: report, participantsWithoutPreferences });
    }

    // participants without preferences get random placement
    // remaining unassigned positions
    if (participantsWithoutPreferences.length) {
      const unassigned = workingAssignments
        .filter((a) => !a.participantId && !a.bye && !a.qualifier)
        .map((a) => a.drawPosition);

      // simple random assignment for no-preference participants
      const shuffled = [...unassigned].sort(() => Math.random() - 0.5);
      for (let i = 0; i < participantsWithoutPreferences.length && i < shuffled.length; i++) {
        const dp = shuffled[i];
        const pid = participantsWithoutPreferences[i];
        allResolutions[dp] = pid;
        const assignment = workingAssignments.find((a) => a.drawPosition === dp);
        if (assignment) assignment.participantId = pid;
      }

      tierReports.push({
        tierIndex,
        randomAssignment: participantsWithoutPreferences.length,
      });
    }

    tier.resolved = true;
  }

  // build transparency report
  const transparencyReport = buildTransparencyReport(draftState, allResolutions);

  // apply results — actually assign participants to draw positions
  if (applyResults) {
    const errors: any[] = [];
    for (const [drawPosition, participantId] of Object.entries(allResolutions)) {
      const result = assignPosition({
        drawPosition: Number(drawPosition),
        participantId,
        tournamentRecord: tournamentRecord!,
        drawDefinition,
        structureId,
        event,
      });
      if (result.error) {
        errors.push({ drawPosition: Number(drawPosition), participantId, error: result.error });
      }
    }

    // update unassigned positions to reflect placements
    const resolvedPositions = new Set(Object.keys(allResolutions).map(Number));
    draftState.unassignedDrawPositions = (draftState.unassignedDrawPositions || []).filter(
      (p: number) => !resolvedPositions.has(p),
    );

    // mark COMPLETE only when all tiers are resolved
    const allResolved = draftState.tiers.every((t: any) => t.resolved);
    if (allResolved) {
      draftState.status = 'COMPLETE';
      draftState.resolvedAt = new Date().toISOString();
      draftState.transparencyReport = transparencyReport;
    }

    addExtension({
      element: drawDefinition,
      extension: { name: DRAFT_STATE, value: draftState },
    });

    if (errors.length) {
      return { ...SUCCESS, errors, drawPositionResolutions: allResolutions, tierReports, transparencyReport };
    }
  }

  return { ...SUCCESS, drawPositionResolutions: allResolutions, tierReports, transparencyReport };
}

function buildTransparencyReport(
  draftState: any,
  resolutions: Record<number, string>,
): { participantId: string; preferences: number[]; assignedPosition: number; preferenceMatch: number | null }[] {
  const report: any[] = [];

  // invert resolutions: participantId → drawPosition
  const participantPositions: Record<string, number> = {};
  for (const [dp, pid] of Object.entries(resolutions)) {
    participantPositions[pid] = Number(dp);
  }

  for (const tier of draftState.tiers) {
    for (const participantId of tier.participantIds) {
      const preferences = draftState.preferences[participantId] ?? [];
      const assignedPosition = participantPositions[participantId];
      const preferenceIndex = preferences.indexOf(assignedPosition);
      report.push({
        participantId,
        preferences,
        assignedPosition,
        preferenceMatch: preferenceIndex >= 0 ? preferenceIndex + 1 : null, // 1-indexed: got 1st, 2nd, 3rd pref or null
      });
    }
  }

  return report;
}
