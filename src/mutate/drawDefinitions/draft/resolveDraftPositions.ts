import { assignDrawPosition as assignPosition } from '@Mutate/matchUps/drawPositions/positionAssignment';
import { resolveDrawPositions } from '@Assemblies/generators/drawDefinitions/drawPositionsResolver';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION, NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { DRAFT_STATE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type ResolveDraftPositionsArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  random?: () => number;
  applyResults?: boolean;
  tierIndex?: number;
  event?: Event;
};

export function resolveDraftPositions({
  tournamentRecord,
  drawDefinition,
  applyResults = true,
  tierIndex: targetTierIndex,
  random,
  event,
}: ResolveDraftPositionsArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const draftState = firstClassOrExtension({ element: drawDefinition, attribute: 'draftState', name: DRAFT_STATE });
  if (!draftState) return { error: NOT_FOUND, info: 'No active draft found' };
  if (draftState.status === 'COMPLETE') return { error: INVALID_VALUES, info: 'Draft is already complete' };

  const structureId = draftState.structureId;
  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: NOT_FOUND, info: 'Structure not found' };

  const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId });
  if (!positionAssignments) return { error: NOT_FOUND, info: 'No position assignments' };

  const tierValidation = validateTargetTier({ draftState, targetTierIndex });
  if (tierValidation?.error) return tierValidation;

  // deep copy so working mutations don't affect the actual draw structure
  const workingAssignments = positionAssignments.map((a: any) => ({ ...a }));

  // resolve tiers sequentially — earlier tiers get priority
  const allResolutions: Record<number, string> = {};
  const tierReports: any[] = [];

  for (let tierIndex = 0; tierIndex < draftState.tiers.length; tierIndex++) {
    const tier = draftState.tiers[tierIndex];
    if (tier.resolved) continue;
    if (targetTierIndex !== undefined && tierIndex !== targetTierIndex) continue;

    resolveTier({ draftState, tier, tierIndex, workingAssignments, allResolutions, tierReports, random });
    tier.resolved = true;
  }

  // build transparency report
  const transparencyReport = buildTransparencyReport(draftState, allResolutions);

  if (applyResults) {
    const result = applyResolutions({
      allResolutions,
      tournamentRecord,
      drawDefinition,
      structureId,
      draftState,
      transparencyReport,
      tierReports,
      event,
    });
    if (result) return result;
  }

  return { ...SUCCESS, drawPositionResolutions: allResolutions, tierReports, transparencyReport };
}

function validateTargetTier({ draftState, targetTierIndex }): { error?: any; info?: string } | undefined {
  if (targetTierIndex === undefined) return undefined;

  if (targetTierIndex < 0 || targetTierIndex >= draftState.tiers.length) {
    return { error: INVALID_VALUES, info: 'Invalid tier index' };
  }
  if (draftState.tiers[targetTierIndex].resolved) {
    return { error: INVALID_VALUES, info: 'Tier already resolved' };
  }
  for (let i = 0; i < targetTierIndex; i++) {
    if (!draftState.tiers[i].resolved) {
      return { error: INVALID_VALUES, info: `Tier ${i + 1} must be resolved first` };
    }
  }
  return undefined;
}

function resolveTier({ draftState, tier, tierIndex, workingAssignments, allResolutions, tierReports, random }) {
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
        const assignment = workingAssignments.find((a) => a.drawPosition === Number(dp));
        if (assignment) assignment.participantId = pid as string;
      }
    }

    tierReports.push({ tierIndex, preferenceReport: report, participantsWithoutPreferences });
  }

  // participants without preferences get random placement
  if (participantsWithoutPreferences.length) {
    const unassigned = workingAssignments
      .filter((a) => !a.participantId && !a.bye && !a.qualifier)
      .map((a) => a.drawPosition);

    const rng = random ?? Math.random;
    const shuffled = [...unassigned].sort(() => rng() - 0.5);
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
}

function applyResolutions({
  allResolutions,
  tournamentRecord,
  drawDefinition,
  structureId,
  draftState,
  transparencyReport,
  tierReports,
  event,
}): any {
  const errors: any[] = [];
  for (const [drawPosition, participantId] of Object.entries(allResolutions)) {
    const result = assignPosition({
      drawPosition: Number(drawPosition),
      participantId: participantId as string,
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
  draftState.unassignedDrawPositions = (draftState.unassignedDrawPositions ?? []).filter(
    (p: number) => !resolvedPositions.has(p),
  );

  storeTierResolutions({ draftState, allResolutions });

  // mark COMPLETE only when all tiers are resolved
  const allResolved = draftState.tiers.every((t: any) => t.resolved);
  if (allResolved) {
    draftState.status = 'COMPLETE';
    draftState.resolvedAt = new Date().toISOString();
    draftState.transparencyReport = transparencyReport;
  }

  setFirstClassOrExtension({
    element: drawDefinition,
    attribute: 'draftState',
    name: DRAFT_STATE,
    value: draftState,
  });

  if (errors.length) {
    return { ...SUCCESS, errors, drawPositionResolutions: allResolutions, tierReports, transparencyReport };
  }

  return undefined;
}

function storeTierResolutions({ draftState, allResolutions }) {
  const participantPositions: Record<string, number> = {};
  for (const [dp, pid] of Object.entries(allResolutions)) {
    participantPositions[pid as string] = Number(dp);
  }
  for (const tier of draftState.tiers) {
    if (!tier.resolved || tier.resolutions) continue;
    const tierResolutions: Record<string, { assignedPosition: number; preferenceMatch: number | null }> = {};
    for (const participantId of tier.participantIds) {
      const assignedPosition = participantPositions[participantId];
      if (assignedPosition === undefined) continue;
      const preferences = draftState.preferences[participantId] ?? [];
      const prefIdx = preferences.indexOf(assignedPosition);
      tierResolutions[participantId] = {
        assignedPosition,
        preferenceMatch: prefIdx >= 0 ? prefIdx + 1 : null,
      };
    }
    tier.resolutions = tierResolutions;
  }
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
