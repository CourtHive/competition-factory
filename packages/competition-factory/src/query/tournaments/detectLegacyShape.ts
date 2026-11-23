import { matchUpsOf, positionAssignmentsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { hasStoredGoesTo, needsFinishingRounds } from '@Query/matchUps/addGoesTo';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { normalizePenaltyType } from '@Query/participants/normalizePenaltyType';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { SANCTIONING_CONSTRAINTS } from '@Constants/extensionConstants';
import { SIGN_IN_STATUS } from '@Constants/participantConstants';
import { CHECK_IN, CHECK_OUT } from '@Constants/timeItemConstants';
import {
  COURT_PROMOTIONS,
  DRAW_DEFINITION_PROMOTIONS,
  ENTRY_PROMOTIONS,
  EVENT_PROMOTIONS,
  MATCHUP_PROMOTIONS,
  MATCHUP_SCHEDULE_TIMEITEM_PROMOTIONS,
  POSITION_ASSIGNMENT_PROMOTIONS,
  STRUCTURE_PROMOTIONS,
  TOURNAMENT_FLAT_PROMOTIONS,
  TOURNAMENT_GROUP_PROMOTIONS,
  VENUE_PROMOTIONS,
  emptyLegacyShapeCounts,
  type ExtensionPromotion,
  type LegacyShapeCounts,
} from '@Constants/legacyShapePromotions';

import type { DrawDefinition, Extension, MatchUp, Structure, Tournament } from '@Types/tournamentTypes';

export type { LegacyShapeCounts } from '@Constants/legacyShapePromotions';

function extensionCount(owner: { extensions?: Extension[] }, definitions: ExtensionPromotion[]) {
  if (!Array.isArray(owner.extensions) || !owner.extensions.length) return 0;
  let count = 0;
  for (const { name, attribute } of definitions) {
    if (Reflect.get(owner, attribute) === undefined && owner.extensions.some((e) => e?.name === name)) count++;
  }
  return count;
}

function tournamentExtensions(record: Tournament) {
  let count = extensionCount(record, TOURNAMENT_FLAT_PROMOTIONS);
  if (!Array.isArray(record.extensions) || !record.extensions.length) return count;
  for (const { name, groupAttribute, leafAttribute } of TOURNAMENT_GROUP_PROMOTIONS) {
    if (
      Reflect.get(record, groupAttribute)?.[leafAttribute] === undefined &&
      record.extensions.some((e) => e?.name === name)
    )
      count++;
  }
  if (record.sanction?.constraints === undefined && record.extensions.some((e) => e?.name === SANCTIONING_CONSTRAINTS))
    count++;
  return count;
}

function inspectMatch(match: MatchUp, counts: LegacyShapeCounts) {
  counts.matchUps += extensionCount(match, MATCHUP_PROMOTIONS);
  // Inspect the sequence itself. Array.some skips a true sparse slot.
  let previous = -Infinity;
  for (const position of Array.isArray(match.drawPositions) ? match.drawPositions : []) {
    if (!position || position < previous) {
      counts.drawPositions++;
      break;
    }
    previous = position;
  }
  if (!Array.isArray(match.timeItems)) return;
  let missing: Set<string> | undefined;
  for (const item of match.timeItems) {
    if (!item?.itemType) continue;
    if (item.itemType === CHECK_IN || item.itemType === CHECK_OUT) {
      if (!Array.isArray(match.checkIns)) counts.matchUpCheckIns++;
      continue;
    }
    const attribute = MATCHUP_SCHEDULE_TIMEITEM_PROMOTIONS.find((p) => p.itemType === item.itemType)?.attribute;
    if (attribute && (!match.schedule || Reflect.get(match.schedule, attribute) === undefined)) {
      (missing ??= new Set()).add(attribute);
    }
  }
  counts.matchUpScheduleTimeItems += missing?.size ?? 0;
}

function inspectStructures(structures: Structure[], counts: LegacyShapeCounts) {
  for (const structure of structures) {
    counts.structures += extensionCount(structure, STRUCTURE_PROMOTIONS);
    for (const seat of positionAssignmentsOf(structure) ?? [])
      counts.positionAssignments += extensionCount(seat, POSITION_ASSIGNMENT_PROMOTIONS);
    for (const match of matchUpsOf(structure) ?? []) inspectMatch(match, counts);
    const children = structuresOf(structure);
    if (children) inspectStructures(children, counts);
  }
}

function inspectDraw(draw: DrawDefinition, counts: LegacyShapeCounts) {
  counts.drawDefinitions += extensionCount(draw, DRAW_DEFINITION_PROMOTIONS);
  for (const entry of draw.entries ?? []) counts.entries += extensionCount(entry, ENTRY_PROMOTIONS);
  inspectStructures(draw.structures ?? [], counts);
  if (hasStoredGoesTo({ drawDefinition: draw }) && !needsFinishingRounds(draw)) return;
  const skipsEdges = draw.structures?.some(
    (structure) => (!structuresOf(structure) && !matchUpsOf(structure)) || isAdHoc({ structure }),
  );
  if (!skipsEdges) counts.goesTo++;
}

/** Count stored legacy-only shapes, at their migration scopes. The goesTo count flags draws
 * for inspection using the cheap storage predicates. It does not derive or verify an edge. */
export function detectLegacyShape(record: Tournament) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { error: MISSING_TOURNAMENT_RECORD };
  const legacyShapes = emptyLegacyShapeCounts();
  legacyShapes.tournament = tournamentExtensions(record);
  for (const participant of record.participants ?? []) {
    if (!Array.isArray(participant.presence) && Array.isArray(participant.timeItems)) {
      for (const item of participant.timeItems)
        if (item?.itemType === SIGN_IN_STATUS) legacyShapes.participantPresence++;
    }
    for (const penalty of participant.penalties ?? []) {
      if (normalizePenaltyType(penalty?.penaltyType) !== penalty?.penaltyType) legacyShapes.penaltyLabels++;
    }
  }
  for (const venue of record.venues ?? []) {
    legacyShapes.venues += extensionCount(venue, VENUE_PROMOTIONS);
    for (const court of venue.courts ?? []) legacyShapes.courts += extensionCount(court, COURT_PROMOTIONS);
  }
  for (const event of record.events ?? []) {
    legacyShapes.events += extensionCount(event, EVENT_PROMOTIONS);
    for (const entry of event.entries ?? []) legacyShapes.entries += extensionCount(entry, ENTRY_PROMOTIONS);
    for (const draw of event.drawDefinitions ?? []) inspectDraw(draw, legacyShapes);
  }
  return {
    success: true as const,
    legacyShapes,
    total: Object.values(legacyShapes).reduce((sum, count) => sum + count, 0),
  };
}
