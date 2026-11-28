import {
  APPLIED_POLICIES,
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

import type { Extension } from '@Types/tournamentTypes';

export type ExtensionPromotion = {
  name: string;
  attribute: string;
  // optional value translator (used by linkedTournamentIds shape change)
  translate?: (legacyValue: Extension['value']) => unknown;
};

export type GroupExtensionPromotion = {
  name: string;
  groupAttribute: string;
  leafAttribute: string;
};

// Schedule timeItem → matchUp.schedule.<attribute>. Lifecycle items
// (START_TIME / STOP_TIME / RESUME_TIME / END_TIME) are NOT promoted —
// matchUpDuration() walks them as an ordered history.
export const MATCHUP_SCHEDULE_TIMEITEM_PROMOTIONS: { itemType: string; attribute: string }[] = [
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

export const TOURNAMENT_FLAT_PROMOTIONS: ExtensionPromotion[] = [
  { name: APPLIED_POLICIES, attribute: 'appliedPolicies' },
  { name: FACTORY, attribute: 'factory' },
  {
    name: LINKED_TOURNAMENTS,
    attribute: 'linkedTournamentIds',
    // historical shape `{tournamentIds: string[]}` flattens to a plain `string[]`
    translate: (legacy) => (legacy as { tournamentIds?: string[] } | undefined)?.tournamentIds ?? legacy,
  },
];

export const TOURNAMENT_GROUP_PROMOTIONS: GroupExtensionPromotion[] = [
  { name: SCHEDULING_PROFILE, groupAttribute: 'scheduling', leafAttribute: 'profile' },
  { name: SCHEDULE_LIMITS, groupAttribute: 'scheduling', leafAttribute: 'dailyLimits' },
  { name: SCHEDULE_TIMING, groupAttribute: 'scheduling', leafAttribute: 'timing' },
];

export const EVENT_PROMOTIONS: ExtensionPromotion[] = [
  { name: APPLIED_POLICIES, attribute: 'appliedPolicies' },
  { name: FLIGHT_PROFILE, attribute: 'flightProfile' },
];
export const ENTRY_PROMOTIONS: ExtensionPromotion[] = [{ name: ROUND_TARGET, attribute: 'roundTarget' }];

// No FLIGHT_PROFILE here: a flight profile lives on the EVENT only. Nothing ever wrote one on a draw (0 of 428 corpus
// records, 0 of 16 CODES fixtures); a stray draw-level extension stays an extension, which nothing reads either.
export const DRAW_DEFINITION_PROMOTIONS: ExtensionPromotion[] = [
  { name: APPLIED_POLICIES, attribute: 'appliedPolicies' },
  { name: LINEUPS, attribute: 'lineUps' },
  { name: DRAFT_STATE, attribute: 'draftState' },
  { name: COMPETITION_STATE, attribute: 'competitionState' },
];

export const STRUCTURE_PROMOTIONS: ExtensionPromotion[] = [
  { name: APPLIED_POLICIES, attribute: 'appliedPolicies' },
  { name: ROUND_TARGET, attribute: 'roundTarget' },
];

export const POSITION_ASSIGNMENT_PROMOTIONS: ExtensionPromotion[] = [
  { name: TALLY, attribute: 'tally' },
  { name: SUB_ORDER, attribute: 'subOrder' },
  { name: DISABLE_LINKS, attribute: 'disableLinks' },
];

export const MATCHUP_PROMOTIONS: ExtensionPromotion[] = [
  { name: DELEGATED_OUTCOME, attribute: 'delegatedOutcome' },
  { name: DISABLE_AUTO_CALC, attribute: 'disableAutoCalc' },
];

export const VENUE_PROMOTIONS: ExtensionPromotion[] = [{ name: DISABLED, attribute: 'disabled' }];
export const COURT_PROMOTIONS: ExtensionPromotion[] = [{ name: DISABLED, attribute: 'disabled' }];

export type LegacyShapeCounts = {
  tournament: number;
  events: number;
  entries: number;
  drawDefinitions: number;
  structures: number;
  positionAssignments: number;
  matchUps: number;
  matchUpScheduleTimeItems: number;
  matchUpCheckIns: number;
  drawPositions: number;
  goesTo: number;
  participantPresence: number;
  penaltyLabels: number;
  venues: number;
  courts: number;
};

export function emptyLegacyShapeCounts(): LegacyShapeCounts {
  return {
    tournament: 0,
    events: 0,
    entries: 0,
    drawDefinitions: 0,
    structures: 0,
    positionAssignments: 0,
    matchUps: 0,
    matchUpScheduleTimeItems: 0,
    matchUpCheckIns: 0,
    drawPositions: 0,
    goesTo: 0,
    participantPresence: 0,
    penaltyLabels: 0,
    venues: 0,
    courts: 0,
  };
}
