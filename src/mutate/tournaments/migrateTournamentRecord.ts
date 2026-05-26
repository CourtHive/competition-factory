// constants and types
import {
  COMPETITION_STATE,
  DELEGATED_OUTCOME,
  DISABLE_AUTO_CALC,
  DISABLE_LINKS,
  DISABLED,
  DRAFT_STATE,
  FACTORY,
  FLIGHT_PROFILE,
  LINEUPS,
  LINKED_TOURNAMENTS,
  ROUND_TARGET,
  SCHEDULE_LIMITS,
  SCHEDULE_TIMING,
  SCHEDULING_PROFILE,
  SUB_ORDER,
  TALLY,
} from '@Constants/extensionConstants';
import {
  ALLOCATE_COURTS,
  ASSIGN_COURT,
  ASSIGN_OFFICIAL,
  ASSIGN_VENUE,
  COURT_ANNOTATION,
  COURT_ORDER,
  HOME_PARTICIPANT_ID,
  SCHEDULED_DATE,
  SCHEDULED_TIME,
  TIME_MODIFIERS,
} from '@Constants/timeItemConstants';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type ExtensionPromotion = {
  name: string;
  attribute: string;
  // optional value translator (used by linkedTournamentIds shape change)
  translate?: (legacyValue: any) => any;
};

type GroupExtensionPromotion = {
  name: string;
  groupAttribute: string;
  leafAttribute: string;
};

// Schedule timeItem → matchUp.schedule.<attribute>. Lifecycle items
// (START_TIME / STOP_TIME / RESUME_TIME / END_TIME) are NOT promoted —
// matchUpDuration() walks them as an ordered history.
const MATCHUP_SCHEDULE_TIMEITEM_PROMOTIONS: { itemType: string; attribute: string }[] = [
  { itemType: SCHEDULED_DATE, attribute: 'scheduledDate' },
  { itemType: SCHEDULED_TIME, attribute: 'scheduledTime' },
  { itemType: ASSIGN_COURT, attribute: 'courtId' },
  { itemType: ASSIGN_VENUE, attribute: 'venueId' },
  { itemType: COURT_ORDER, attribute: 'courtOrder' },
  { itemType: COURT_ANNOTATION, attribute: 'courtAnnotation' },
  { itemType: ALLOCATE_COURTS, attribute: 'allocatedCourts' },
  { itemType: TIME_MODIFIERS, attribute: 'timeModifiers' },
  { itemType: HOME_PARTICIPANT_ID, attribute: 'homeParticipantId' },
  { itemType: ASSIGN_OFFICIAL, attribute: 'official' },
];

function promoteFlatExtension(element: any, p: ExtensionPromotion, clearLegacy: boolean): boolean {
  const extensions = element?.extensions;
  if (!Array.isArray(extensions)) return false;
  const idx = extensions.findIndex((e: any) => e?.name === p.name);
  if (idx === -1) return false;

  const legacyValue = extensions[idx].value;
  const value = p.translate ? p.translate(legacyValue) : legacyValue;
  if (element[p.attribute] === undefined) element[p.attribute] = value;

  if (clearLegacy) extensions.splice(idx, 1);
  return true;
}

function promoteGroupExtension(element: any, p: GroupExtensionPromotion, clearLegacy: boolean): boolean {
  const extensions = element?.extensions;
  if (!Array.isArray(extensions)) return false;
  const idx = extensions.findIndex((e: any) => e?.name === p.name);
  if (idx === -1) return false;

  if (!element[p.groupAttribute]) element[p.groupAttribute] = {};
  if (element[p.groupAttribute][p.leafAttribute] === undefined) {
    element[p.groupAttribute][p.leafAttribute] = extensions[idx].value;
  }

  if (clearLegacy) extensions.splice(idx, 1);
  return true;
}

function promoteMatchUpScheduleTimeItem(
  matchUp: any,
  itemType: string,
  attribute: string,
  clearLegacy: boolean,
): boolean {
  const timeItems = matchUp?.timeItems;
  if (!Array.isArray(timeItems)) return false;

  // schedule itemTypes are last-write-wins, so pick the most-recent entry
  const matching = timeItems.filter((t: any) => t?.itemType === itemType);
  if (!matching.length) return false;
  const latest = matching.toSorted((a: any, b: any) => {
    const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aT - bT;
  })[matching.length - 1];

  if (latest.itemValue === undefined || latest.itemValue === null) {
    // an explicit clear sentinel — strip but do not write a first-class value
    if (clearLegacy) matchUp.timeItems = timeItems.filter((t: any) => t?.itemType !== itemType);
    return true;
  }

  matchUp.schedule = matchUp.schedule ?? {};
  if (matchUp.schedule[attribute] === undefined) matchUp.schedule[attribute] = latest.itemValue;

  if (clearLegacy) matchUp.timeItems = timeItems.filter((t: any) => t?.itemType !== itemType);
  return true;
}

const TOURNAMENT_FLAT_PROMOTIONS: ExtensionPromotion[] = [
  { name: FACTORY, attribute: 'factory' },
  {
    name: LINKED_TOURNAMENTS,
    attribute: 'linkedTournamentIds',
    // historical shape `{tournamentIds: string[]}` flattens to a plain `string[]`
    translate: (legacy) => legacy?.tournamentIds ?? legacy,
  },
];

const TOURNAMENT_GROUP_PROMOTIONS: GroupExtensionPromotion[] = [
  { name: SCHEDULING_PROFILE, groupAttribute: 'scheduling', leafAttribute: 'profile' },
  { name: SCHEDULE_LIMITS, groupAttribute: 'scheduling', leafAttribute: 'dailyLimits' },
  { name: SCHEDULE_TIMING, groupAttribute: 'scheduling', leafAttribute: 'timing' },
];

const EVENT_PROMOTIONS: ExtensionPromotion[] = [{ name: FLIGHT_PROFILE, attribute: 'flightProfile' }];
const ENTRY_PROMOTIONS: ExtensionPromotion[] = [{ name: ROUND_TARGET, attribute: 'roundTarget' }];

const DRAW_DEFINITION_PROMOTIONS: ExtensionPromotion[] = [
  { name: FLIGHT_PROFILE, attribute: 'flightProfile' },
  { name: LINEUPS, attribute: 'lineUps' },
  { name: DRAFT_STATE, attribute: 'draftState' },
  { name: COMPETITION_STATE, attribute: 'competitionState' },
];

const STRUCTURE_PROMOTIONS: ExtensionPromotion[] = [{ name: ROUND_TARGET, attribute: 'roundTarget' }];

const POSITION_ASSIGNMENT_PROMOTIONS: ExtensionPromotion[] = [
  { name: TALLY, attribute: 'tally' },
  { name: SUB_ORDER, attribute: 'subOrder' },
  { name: DISABLE_LINKS, attribute: 'disableLinks' },
];

const MATCHUP_PROMOTIONS: ExtensionPromotion[] = [
  { name: DELEGATED_OUTCOME, attribute: 'delegatedOutcome' },
  { name: DISABLE_AUTO_CALC, attribute: 'disableAutoCalc' },
];

const VENUE_PROMOTIONS: ExtensionPromotion[] = [{ name: DISABLED, attribute: 'disabled' }];
const COURT_PROMOTIONS: ExtensionPromotion[] = [{ name: DISABLED, attribute: 'disabled' }];

type MigrationCounts = {
  tournament: number;
  events: number;
  entries: number;
  drawDefinitions: number;
  structures: number;
  positionAssignments: number;
  matchUps: number;
  matchUpScheduleTimeItems: number;
  venues: number;
  courts: number;
};

type MigrationResult = ResultType & {
  promoted?: MigrationCounts;
  totalPromoted?: number;
};

type MigrateTournamentRecordArgs = {
  tournamentRecord: Tournament;
  // when true (default) the legacy `extensions[]` entry / schedule timeItem is
  // removed after the first-class attribute is set. set to false for a
  // non-destructive "shadow" migration that leaves both surfaces present.
  clearLegacy?: boolean;
};

/**
 * One-shot CODES upgrade. Walks a tournamentRecord and promotes every
 * canonical legacy extension and schedule-timeItem to its first-class
 * attribute. Idempotent — running twice is a no-op because each promotion
 * only writes when the first-class field is unset.
 *
 * Use this when upgrading historical records that were written by a
 * factory < 5.0.0 (LEGACY-style storage). After running, the record reads
 * identically under NATIVE / DUAL / LEGACY engine write modes.
 */
function applyFlatPromotions(element: any, promotions: ExtensionPromotion[], clearLegacy: boolean): number {
  let n = 0;
  for (const p of promotions) {
    if (promoteFlatExtension(element, p, clearLegacy)) n += 1;
  }
  return n;
}

function applyGroupPromotions(element: any, promotions: GroupExtensionPromotion[], clearLegacy: boolean): number {
  let n = 0;
  for (const p of promotions) {
    if (promoteGroupExtension(element, p, clearLegacy)) n += 1;
  }
  return n;
}

function migrateTournamentLevel(record: any, counts: MigrationCounts, clearLegacy: boolean) {
  counts.tournament += applyFlatPromotions(record, TOURNAMENT_FLAT_PROMOTIONS, clearLegacy);
  counts.tournament += applyGroupPromotions(record, TOURNAMENT_GROUP_PROMOTIONS, clearLegacy);
}

function migrateVenuesAndCourts(record: any, counts: MigrationCounts, clearLegacy: boolean) {
  for (const venue of record.venues ?? []) {
    counts.venues += applyFlatPromotions(venue, VENUE_PROMOTIONS, clearLegacy);
    for (const court of venue.courts ?? []) {
      counts.courts += applyFlatPromotions(court, COURT_PROMOTIONS, clearLegacy);
    }
  }
}

function migrateDrawDefinition(drawDefinition: any, counts: MigrationCounts, clearLegacy: boolean) {
  counts.drawDefinitions += applyFlatPromotions(drawDefinition, DRAW_DEFINITION_PROMOTIONS, clearLegacy);
  for (const entry of drawDefinition.entries ?? []) {
    counts.entries += applyFlatPromotions(entry, ENTRY_PROMOTIONS, clearLegacy);
  }
  walkStructures(drawDefinition.structures ?? [], counts, clearLegacy);
}

function migrateEvent(event: any, counts: MigrationCounts, clearLegacy: boolean) {
  counts.events += applyFlatPromotions(event, EVENT_PROMOTIONS, clearLegacy);
  for (const entry of event.entries ?? []) {
    counts.entries += applyFlatPromotions(entry, ENTRY_PROMOTIONS, clearLegacy);
  }
  for (const drawDefinition of event.drawDefinitions ?? []) {
    migrateDrawDefinition(drawDefinition, counts, clearLegacy);
  }
}

function sumCounts(counts: MigrationCounts): number {
  let total = 0;
  for (const value of Object.values(counts)) total += value;
  return total;
}

export function migrateTournamentRecord({
  tournamentRecord,
  clearLegacy = true,
}: MigrateTournamentRecordArgs): MigrationResult {
  if (!tournamentRecord || typeof tournamentRecord !== 'object') return { error: MISSING_TOURNAMENT_RECORD };

  const counts: MigrationCounts = {
    tournament: 0,
    events: 0,
    entries: 0,
    drawDefinitions: 0,
    structures: 0,
    positionAssignments: 0,
    matchUps: 0,
    matchUpScheduleTimeItems: 0,
    venues: 0,
    courts: 0,
  };

  migrateTournamentLevel(tournamentRecord, counts, clearLegacy);
  migrateVenuesAndCourts(tournamentRecord, counts, clearLegacy);
  for (const event of tournamentRecord.events ?? []) {
    migrateEvent(event, counts, clearLegacy);
  }

  return { ...SUCCESS, promoted: counts, totalPromoted: sumCounts(counts) };
}

function migrateMatchUpSchedule(matchUp: any, counts: MigrationCounts, clearLegacy: boolean) {
  for (const { itemType, attribute } of MATCHUP_SCHEDULE_TIMEITEM_PROMOTIONS) {
    if (promoteMatchUpScheduleTimeItem(matchUp, itemType, attribute, clearLegacy)) {
      counts.matchUpScheduleTimeItems += 1;
    }
  }
}

function walkStructures(structures: any[], counts: MigrationCounts, clearLegacy: boolean) {
  for (const structure of structures) {
    counts.structures += applyFlatPromotions(structure, STRUCTURE_PROMOTIONS, clearLegacy);
    for (const assignment of structure.positionAssignments ?? []) {
      counts.positionAssignments += applyFlatPromotions(assignment, POSITION_ASSIGNMENT_PROMOTIONS, clearLegacy);
    }
    for (const matchUp of structure.matchUps ?? []) {
      counts.matchUps += applyFlatPromotions(matchUp, MATCHUP_PROMOTIONS, clearLegacy);
      migrateMatchUpSchedule(matchUp, counts, clearLegacy);
    }
    if (Array.isArray(structure.structures)) walkStructures(structure.structures, counts, clearLegacy);
  }
}
