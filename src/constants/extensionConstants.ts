export const ACTIVE_SUSPENSION = 'activeSuspension';
export const APPLIED_POLICIES = 'appliedPolicies';
export const CONTEXT = 'context';
export const DELEGATED_OUTCOME = 'delegatedOutcome';
export const DISABLED = 'disabled';
export const DISABLE_AUTO_CALC = 'disableAutoCalc';
export const DISABLE_LINKS = 'disableLinks';
export const DISPLAY = 'display';
export const DRAFT_STATE = 'draftState';
export const DRAW_DELETIONS = 'drawDeletions';
export const DRAW_PROFILE = 'drawProfile';
export const ENTRY_PROFILE = 'entryProfile';
export const EVENT_PROFILE = 'eventProfile';
export const EVENT_WITHDRAWAL_REQUESTS = 'eventWithdrawalRequests';
export const FACTORY = 'factory';
export const FLIGHT_PROFILE = 'flightProfile';
export const GROUPING_ATTRIBUTE = 'groupingAttribute';
export const LINEUPS = 'lineUps';
export const LINKED_TOURNAMENTS = 'linkedTournamentsIds';
export const MUTATION_LOCKS = 'mutationLocks';
export const PARTICIPANT_REPRESENTATIVES = 'participantRepresentatives';
export const PERSON_REQUESTS = 'personRequests';
export const POSITION_ACTIONS = 'positionActions';
export const RANKING_POINTS = 'rankingPoints';
export const REGISTRATION = 'registration';
export const ROUND_TARGET = 'roundTarget';
export const SCHEDULE_LIMITS = 'scheduleLimits';
export const SCHEDULE_TIMING = 'scheduleTiming';
export const SCHEDULING_PROFILE = 'schedulingProfile';
export const STATUS_DETAIL = 'statusDetail';
export const SUB_ORDER = 'subOrder';
export const TALLY = 'tally';
export const TIE_FORMAT_MODIFICATIONS = 'tieFormatModification';

export const extensionConstants = {
  ACTIVE_SUSPENSION,
  APPLIED_POLICIES,
  CONTEXT, // used to capture, e.g. context in which a venue was added
  DELEGATED_OUTCOME,
  DISABLED,
  DISABLE_LINKS,
  DISABLE_AUTO_CALC,
  DISPLAY,
  DRAFT_STATE,
  DRAW_DELETIONS,
  DRAW_PROFILE,
  ENTRY_PROFILE, // used for drawGeneration; not relevant for anonymized tournaments
  EVENT_PROFILE,
  EVENT_WITHDRAWAL_REQUESTS,
  FLIGHT_PROFILE,
  GROUPING_ATTRIBUTE, // for generating teams; not relevant for anonymized tournaments
  LINEUPS,
  LINKED_TOURNAMENTS,
  MUTATION_LOCKS,
  PARTICIPANT_REPRESENTATIVES,
  PERSON_REQUESTS,
  POSITION_ACTIONS,
  RANKING_POINTS, // for attaching points awarded to tournamentRecord
  REGISTRATION,
  ROUND_TARGET,
  SCHEDULE_LIMITS,
  SCHEDULE_TIMING,
  SCHEDULING_PROFILE,
  STATUS_DETAIL, // attached to event.entries
  SUB_ORDER,
  TALLY,
  TIE_FORMAT_MODIFICATIONS, // for auditing, not important when anonymized
  FACTORY, // used for capturing versioning of factory and other TODS document processors
};

export const internalExtensions = [
  DELEGATED_OUTCOME,
  DISABLED,
  DISABLE_AUTO_CALC,
  DISABLE_LINKS,
  FLIGHT_PROFILE,
  LINEUPS,
  LINKED_TOURNAMENTS,
  MUTATION_LOCKS,
  PARTICIPANT_REPRESENTATIVES,
  PERSON_REQUESTS,
  ROUND_TARGET,
  SCHEDULE_LIMITS,
  SCHEDULE_TIMING,
  SCHEDULING_PROFILE,
  SUB_ORDER,
  TALLY,
  TIE_FORMAT_MODIFICATIONS,
];
