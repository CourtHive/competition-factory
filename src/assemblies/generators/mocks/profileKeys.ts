import type {
  GenerateTournamentRecordArgs,
  ModifyTournamentRecordArgs,
  MockParticipantsProfile,
  MockScenarioProfile,
  MockLeagueProfile,
  MockVenueProfile,
  MockEventProfile,
  MockDrawProfile,
} from '@Types/mocksTypes';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * The keys each mocksEngine profile accepts, at runtime: the closed types in mocksTypes.ts make an unknown
 * key a compile error for TypeScript callers, and these refuse it for everyone else (JS, JSON, a cast).
 *
 * Each list is tied to its type in BOTH directions by the assertions at the bottom, so a key added to
 * a type and not here (or the reverse) fails the type check rather than drifting.
 */
export const GENERATE_TOURNAMENT_RECORD_KEYS = [
  'autoEntryPositions',
  'autoSchedule',
  'completeAllMatchUps',
  'drawProfiles',
  'endDate',
  'eventProfiles',
  'hydrateCollections',
  'isMock',
  'leagueProfiles',
  'matchUpStatusProfile',
  'nonRandom',
  'participants',
  'participantsProfile',
  'periodLength',
  'policyDefinitions',
  'random',
  'randomWinningSide',
  'ratingsParameters',
  'scenarioProfile',
  'scheduleCompletedMatchUps',
  'schedulingProfile',
  'setState',
  'startDate',
  'tournamentAttributes',
  'tournamentExtensions',
  'tournamentName',
  'uuids',
  'venueProfiles',
] as const;
export const MODIFY_TOURNAMENT_RECORD_KEYS = [
  'autoEntryPositions',
  'autoSchedule',
  'completeAllMatchUps',
  'drawProfiles',
  'eventProfiles',
  'hydrateCollections',
  'isMock',
  'keepPartial',
  'matchUpStatusProfile',
  'nonRandom',
  'participantsProfile',
  'periodLength',
  'random',
  'randomWinningSide',
  'ratingsParameters',
  'schedulingProfile',
  'setState',
  'tournamentRecord',
  'uuids',
  'venueProfiles',
] as const;
export const DRAW_PROFILE_KEYS = [
  'addEvent',
  'addNameBaseToAttributeName',
  'alternatesCount',
  'appliedPolicies',
  'applyPositioning',
  'assignSeedsCount',
  'automated',
  'buildTeams',
  'category',
  'completeAllMatchUps',
  'completionGoal',
  'considerEventEntries',
  'consolationStructureName',
  'drawEntries',
  'drawExtensions',
  'drawId',
  'drawMatic',
  'drawName',
  'drawSize',
  'drawType',
  'drawTypeCoercion',
  'enableDoubleRobin',
  'enforceGender',
  'enforceMinimumDrawSize',
  'enforcePolicyLimits',
  'eventAttributes',
  'eventExtensions',
  'eventId',
  'eventName',
  'eventType',
  'excessParticipantAlternates',
  'exitProfileLimit',
  'feedPolicy',
  'finishingPositionLimit',
  'finishingPositionNaming',
  'finishingPositionOffset',
  'gender',
  'generate',
  'groupNameBase',
  'groupNames',
  'hydrateCollections',
  'hydrateRoundNames',
  'idPrefix',
  'ignoreAllowedDrawTypes',
  'ignoreDefaults',
  'ignoreStageSpace',
  'isMock',
  'matchUpFormat',
  'matchUpStatusProfile',
  'matchUpType',
  'outcomes',
  'overwriteExisting',
  'pairingProfile',
  'participantsCount',
  'placeByes',
  'placementGroup',
  'playoffAttributes',
  'playoffStructureNameBase',
  'policyDefinitions',
  'processCodes',
  'provisionalPositioning',
  'publish',
  'qualifiersCount',
  'qualifyingOnly',
  'qualifyingPlaceholder',
  'qualifyingPositions',
  'qualifyingProfiles',
  'qualifyingRoundNumber',
  'random',
  'randomWinningSide',
  'rankingRange',
  'requireSequential',
  'roundLimit',
  'roundOffset',
  'roundOffsetLimit',
  'roundProfile',
  'roundTarget',
  'roundsCount',
  'scaleName',
  'scaledParticipantsCount',
  'seedAssignmentProfile',
  'seedByRanking',
  'seedLimit',
  'seededParticipants',
  'seedingProfile',
  'seedingScaleName',
  'seedsCount',
  'skipRounds',
  'stage',
  'stageSequence',
  'staggeredEntry',
  'structureId',
  'structureName',
  'structureNameMap',
  'structureOptions',
  'targetMatchUpIds',
  'teamGenders',
  'teamNames',
  'tieFormat',
  'tieFormatId',
  'tieFormatName',
  'timeItems',
  'tournamentAlternates',
  'uniqueParticipants',
  'uuids',
  'voluntaryConsolation',
  'withPlayoffs',
] as const;
export const EVENT_PROFILE_KEYS = [
  'autoEntryPositions',
  'ballType',
  'category',
  'completeAllMatchUps',
  'discipline',
  'drawProfiles',
  'eventAttributes',
  'eventExtensions',
  'eventId',
  'eventIndex',
  'eventLevel',
  'eventName',
  'eventType',
  'gender',
  'isMock',
  'matchUpStatusProfile',
  'participantsProfile',
  'policyDefinitions',
  'processCodes',
  'publish',
  'randomWinningSide',
  'rankingRange',
  'ratingsParameters',
  'scaledParticipantsCount',
  'surfaceCategory',
  'tieFormat',
  'tieFormatName',
  'timeItems',
  'uuids',
] as const;
export const VENUE_PROFILE_KEYS = [
  'courtIds',
  'courtNames',
  'courtTimings',
  'courtsCount',
  'dateAvailability',
  'defaultEndTime',
  'defaultStartTime',
  'endTime',
  'idPrefix',
  'isPrimary',
  'startTime',
  'venueAbbreviation',
  'venueDateAvailability',
  'venueId',
  'venueName',
] as const;
export const LEAGUE_PROFILE_KEYS = [
  'automated',
  'category',
  'eventId',
  'eventName',
  'gender',
  'idPrefix',
  'individualParticipants',
  'leagueId',
  'leagueName',
  'pairingProfile',
  'participantsProfile',
  'roundsCount',
  'startDate',
  'teamProfiles',
  'teamsCount',
  'tieFormat',
  'tieFormatName',
] as const;
export const PARTICIPANTS_PROFILE_KEYS = [
  'addressProps',
  'categories',
  'category',
  'consideredDate',
  'idPrefix',
  'inContext',
  'individualParticipants',
  'matchUpType',
  'nationalityCodeType',
  'nationalityCodes',
  'nationalityCodesCount',
  'participantRole',
  'participantType',
  'participantsCount',
  'personData',
  'personExtensions',
  'personIds',
  'rankingRange',
  'ratingsParameters',
  'ratingsValues',
  'scaleAllParticipants',
  'scaledParticipantsCount',
  'sex',
  'teamKey',
  'teamSize',
  'uuids',
  'valuesInstanceLimit',
  'withIOC',
  'withISO2',
] as const;
export const SCENARIO_PROFILE_KEYS = [
  'anchor',
  'assignCourts',
  'called',
  'checkedIn',
  'conflicts',
  'minutesBeforeAnchor',
] as const;

type Missing<T, K extends readonly string[]> = Exclude<keyof T, K[number]>;
type Extra<T, K extends readonly string[]> = Exclude<K[number], keyof T>;
type Same<T, K extends readonly string[]> = [Missing<T, K> | Extra<T, K>] extends [never] ? true : false;
const generate_tournament_recordInSync: Same<GenerateTournamentRecordArgs, typeof GENERATE_TOURNAMENT_RECORD_KEYS> =
  true;
const modify_tournament_recordInSync: Same<ModifyTournamentRecordArgs, typeof MODIFY_TOURNAMENT_RECORD_KEYS> = true;
const draw_profileInSync: Same<MockDrawProfile, typeof DRAW_PROFILE_KEYS> = true;
const event_profileInSync: Same<MockEventProfile, typeof EVENT_PROFILE_KEYS> = true;
const venue_profileInSync: Same<MockVenueProfile, typeof VENUE_PROFILE_KEYS> = true;
const league_profileInSync: Same<MockLeagueProfile, typeof LEAGUE_PROFILE_KEYS> = true;
const participants_profileInSync: Same<MockParticipantsProfile, typeof PARTICIPANTS_PROFILE_KEYS> = true;
const scenario_profileInSync: Same<MockScenarioProfile, typeof SCENARIO_PROFILE_KEYS> = true;
export const profileKeysInSync = [
  generate_tournament_recordInSync,
  modify_tournament_recordInSync,
  draw_profileInSync,
  event_profileInSync,
  venue_profileInSync,
  league_profileInSync,
  participants_profileInSync,
  scenario_profileInSync,
];

type Check = { keys: readonly string[]; path: string; value: unknown };

/**
 * What an engine adds to a method's params on the way in (`executeMethod`, `paramsMiddleware`): the held
 * records, the active tournament's id, and the `tournamentId` that selects a record. A caller of
 * `tournamentEngine.modifyTournamentRecord` did not pass these, so they are not its options to refuse.
 */
export const ENGINE_SUPPLIED_KEYS = ['activeTournamentId', 'tournamentRecords', 'tournamentId'] as const;

/**
 * The first key, in any profile the call carries, that the generators do not read. A misplaced option
 * was silently ignored (the 2026-10-15 sweep found 26 drawProfiles whose `completeAllMatchUps` did
 * nothing, and typos such as `mathcUpType`); refused, it names itself.
 */
export function checkProfileKeys(
  params: Record<string, unknown> | undefined,
  keys: readonly string[],
  supplied: readonly string[] = [],
) {
  if (!params || typeof params !== 'object') return undefined;
  const checks: Check[] = [{ keys: [...keys, ...supplied], path: '', value: params }];
  const add = (key: string, profileKeys: readonly string[], value: unknown) => {
    if (Array.isArray(value))
      value.forEach((item, index) => checks.push({ keys: profileKeys, path: `${key}[${index}]`, value: item }));
    else if (value && typeof value === 'object') checks.push({ keys: profileKeys, path: key, value });
  };
  add('participantsProfile', PARTICIPANTS_PROFILE_KEYS, params.participantsProfile);
  add('scenarioProfile', SCENARIO_PROFILE_KEYS, params.scenarioProfile);
  add('leagueProfiles', LEAGUE_PROFILE_KEYS, params.leagueProfiles);
  add('venueProfiles', VENUE_PROFILE_KEYS, params.venueProfiles);
  add('eventProfiles', EVENT_PROFILE_KEYS, params.eventProfiles);
  add('drawProfiles', DRAW_PROFILE_KEYS, params.drawProfiles);
  if (Array.isArray(params.eventProfiles)) {
    params.eventProfiles.forEach((eventProfile, index) =>
      add(`eventProfiles[${index}].drawProfiles`, DRAW_PROFILE_KEYS, eventProfile?.drawProfiles),
    );
  }

  for (const { keys: allowed, path, value } of checks) {
    if (!value || typeof value !== 'object') continue;
    const allowedKeys = new Set<string>(allowed);
    const unknown = Object.keys(value).find((key) => !allowedKeys.has(key));
    if (unknown) {
      const option = path ? `${path}.${unknown}` : unknown;
      return { error: INVALID_VALUES, info: `unknown mocksEngine option: ${option}`, context: { option } };
    }
  }
  return undefined;
}
