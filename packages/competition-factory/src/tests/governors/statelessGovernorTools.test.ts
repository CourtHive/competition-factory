import { TEMPLATE_RANKING_POINTS_WTA, resolveTieFormat } from '@courthive/competition-catalogue';
import { defined } from '@Tests/helpers/defined';
import { AvailabilityEngine } from '@Assemblies/engines/availability/AvailabilityEngine';
import * as availabilityExport from '@Assemblies/engines/availability';
import { officiatingEngine } from '@Assemblies/engines/officiating';
import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import ratchet from './statelessGovernorTools.json';
import * as governors from '@Assemblies/governors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';
import * as tools from '@Assemblies/tools';

// constants
import { POLICY_TYPE_LADDER, POLICY_TYPE_RANKING_POINTS, POLICY_TYPE_SANCTIONING } from '@Constants/policyConstants';
import { INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { CHALLENGE_ISSUED, INSERTION, RATING } from '@Constants/ladderConstants';
import { MAIN, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { SINGLES, TEAM_EVENT } from '@Constants/eventConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { ADVANCE_TOP_N } from '@Constants/seasonConstants';

/**
 * THE STATELESS GOVERNOR TOOLS, CONFIRMED (slice A of the engine API migration).
 *
 * The candidates are the 99 governor exports a role inventory of the governors
 * lists as a query taking one params object and naming no state key in its signature. A candidate is CONFIRMED when, for
 * every input below, three calls give deep-equal results: through the engine with no record loaded, through the engine
 * with a realistic record loaded (the input taken from that record where it has one, so a function that started reading
 * the record would see something), and directly as the governor function. Each confirmed tool has at least one input
 * that is answered, not refused. The inputs name no state (no ids, no record objects): what the engine resolves from an
 * id is state by definition. One normalisation: mcpValidator's `createdAt` and `timestamp`, which its replay takes from
 * the wall clock; every other tool answers identically, field for field.
 *
 * NEEDS-STATE is shown, not asserted: its input is answered differently, or refused, without the record. That includes
 * a tool which answers from its input when an optional input is passed and otherwise reads the record the engine
 * supplies (getChallengeState and isChallengeInRange without `policy`): moving an engine call to a tool would silently
 * drop the attached policy. OWN-ENGINE tools are sanctioning and officiating queries their own engines feed.
 *
 * `statelessGovernorTools.json` is the ratchet: a confirmed tool that starts depending on state fails here, and so does
 * an excluded one whose reason stops holding (a needs-state tool that no longer reads the record, a thrower that no
 * longer throws, an own-engine tool that leaves its engine), and so does any drift between the list and these cases.
 *
 * EXPOSED (slice C): each confirmed tool has a standalone home, `exposed[name]` (`tools.<domain>.<member>`, or the
 * `availability` export), holding the governor's own function, so the two cannot drift while 7.x keeps the engine
 * routes. A confirmed tool without one is in `unexposed`, with the reason.
 */

type Params = Record<string, any>;
/** `normalise` names fields whose values are replaced before comparing: only fields a call cannot reproduce */
type Case = { label: string; params: () => Params; normalise?: string[] };

// ---------------------------------------------------------------------------------------------------------------------
// the loaded record: elimination with seeds, round robin, a TEAM event, venues, all completed; ladder and presence policy
// ---------------------------------------------------------------------------------------------------------------------

const LADDER_POLICY = {
  policyName: 'club ladder',
  ordering: RATING,
  movement: INSERTION,
  challengeRange: 1,
  acceptanceDays: 30,
};
const PRESENCE = { COMPETITOR: { signIn: { expectation: 'required' }, matchCheckIn: { expectation: 'advisory' } } };

const generated = mocksEngine.generateTournamentRecord({
  participantsProfile: { scaledParticipantsCount: 8 },
  drawProfiles: [
    { drawSize: 8, seedsCount: 2 },
    { drawSize: 4, drawType: ROUND_ROBIN },
    { drawSize: 4, eventType: TEAM_EVENT, tieFormat: resolveTieFormat('DOMINANT_DUO') },
  ],
  venueProfiles: [{ courtsCount: 2 }],
  policyDefinitions: {
    [POLICY_TYPE_LADDER]: LADDER_POLICY,
    [POLICY_TYPE_SANCTIONING]: { policyName: 'presence', presence: PRESENCE },
  },
  completeAllMatchUps: true,
});
const { tournamentRecord } = generated;
// a draft schedule scenario, read only from the record
tournamentRecord.scheduling = { scenarios: [{ scenarioId: 'draft', scenarioName: 'Draft', placements: [] }] };
tournamentRecord.timeItems = [{ itemType: 'NOTE', itemValue: 'on the record', createdAt: '2026-01-01T00:00:00Z' }];
const [eliminationDrawId, roundRobinDrawId, teamDrawId] = generated.drawIds;
const [eliminationEventId] = generated.eventIds;

tournamentEngine.setState(tournamentRecord);
const hydrated: any[] = tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps;
const drawOf = (drawId: string) => tournamentEngine.getEvent({ drawId }).drawDefinition;
const eliminationDraw = drawOf(eliminationDrawId);
const roundRobinDraw = drawOf(roundRobinDrawId);
const teamEvent = tournamentEngine.getEvent({ drawId: teamDrawId }).event;
const eliminationEvent = tournamentEngine.getEvent({ eventId: eliminationEventId }).event;
tournamentEngine.reset();

const singles = hydrated.filter((m) => m.drawId === eliminationDrawId);
const final = singles.find((m) => m.roundNumber === 3);
const firstRound = singles.filter((m) => m.roundNumber === 1);
const dual = hydrated.find((m) => m.drawId === teamDrawId && m.matchUpType === TEAM_EVENT);
const tieFormat = teamEvent.tieFormat;
const participant = defined(tournamentRecord.participants, 'participants').find(
  (p: any) => p.participantType === 'INDIVIDUAL',
);
const venue = defined(tournamentRecord.venues, 'venues')[0];
const roundRobinAssignment = roundRobinDraw.structures[0].structures[0].positionAssignments.find((a: any) => a.tally);

const FORMAT = 'SET3-S:6/TB7';
const SETS = [
  { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
  { setNumber: 2, side1Score: 7, side2Score: 6, side1TiebreakScore: 7, side2TiebreakScore: 4, winningSide: 1 },
];
const SCORE = { sets: SETS };
const clone = <T>(value: T): T => structuredClone(value);

// a participant carrying a rating, as a client hands it in
const rated = () => ({
  ...clone(participant),
  timeItems: [{ itemType: 'SCALE.RATING.SINGLES.WTN', itemValue: { wtnRating: 12.5 }, createdAt: '2026-01-01' }],
});

// ranking awards, as courthive-rankings stores them
const award = (personId: string, points: number, endDate = '2026-06-01') => ({
  personId,
  eventType: SINGLES,
  endDate,
  points,
  positionPoints: points,
  perWinPoints: 0,
});
const POINT_AWARDS = [award('alice', 300), award('alice', 120, '2026-03-01'), award('bob', 250), award('carol', 90)];
const RANKING_LIST = () => [
  { personId: 'alice', rank: 1, totalPoints: 420 },
  { personId: 'bob', rank: 2, totalPoints: 250 },
  { personId: 'carol', rank: 3, totalPoints: 90 },
];

// a small box league: two tiers of three, two periods, and an advancement out of the second
const seasonGenerated: any = mocksEngine.generateSeason({
  seasonProfile: {
    tiers: [
      { tierId: 'A1', tierValue: 'A-1', teamsCount: 3 },
      { tierId: 'B1', tierValue: 'B-1', teamsCount: 3 },
    ],
    tieFormat: resolveTieFormat('DOMINANT_DUO'),
    periods: [{}, {}],
    seasonName: 'Spring',
  },
});
const seasonMatchUps = Object.values(seasonGenerated.tournamentRecords).flatMap((record: any) => {
  tournamentEngine.setState(record);
  return tournamentEngine.allTournamentMatchUps().matchUps;
});
tournamentEngine.reset();
const SEASON = () => {
  const season = clone(seasonGenerated.season);
  season.movementRules = [{ promote: 1, relegate: 1 }];
  return season;
};
const firstPeriodId = seasonGenerated.season.periods[0].periodId;
const seasonMovement = governors.seasonGovernor.getSeasonMovement({
  season: SEASON(),
  periodId: firstPeriodId,
  matchUps: seasonMatchUps,
}) as any;
const settled = (seasonMovement.tiedAtCut ?? []).flatMap((tie: any) =>
  tie.subjects.map((subject: any) => ({ subject, toTierId: tie.tierId, reason: 'held' })),
);
const championship = () => {
  const season = clone(seasonGenerated.season);
  season.tiers.push({ tierId: 'CH', tier: { system: 'MOCK', value: 'Championship' } });
  season.periods.push({
    periodId: 'championship',
    periodNumber: 3,
    phase: 'CHAMPIONSHIP',
    includeInStandings: false,
    competitions: [],
  });
  season.advancements = ['A1', 'B1'].map((tierId) => ({
    advancementId: `${tierId}-winner`,
    fromPeriodId: season.periods[1].periodId,
    fromTierId: tierId,
    rule: { type: ADVANCE_TOP_N, n: 1 },
    to: { periodId: 'championship', tierId: 'CH' },
  }));
  return season;
};

const availability = () => {
  const engine = new AvailabilityEngine();
  engine.init(
    {
      tournamentId: 'availability',
      startDate: '2026-06-15',
      endDate: '2026-06-16',
      venues: [{ venueId: 'v1', courts: [{ courtId: 'c1', courtName: 'Court 1' }] }],
    },
    { tournamentId: 'availability' },
  );
  // one item on a venue the record lacks, so the pipeline has an issue to report
  engine.addPlanItem({ day: '2026-06-15', venueId: 'missing-venue', eventId: 'e1', roundNumber: 1 });
  return engine;
};

// MCP charting data: one point, enough for the replay to run
const MCP_HEADERS = 'match_id,Pt,Set1,Set2,Gm1,Gm2,Pts,Svr,Ret,1st,2nd,PtWinner,isAce,isDouble,isUnforced,isForced';
const MCP_CSV = [
  `${MCP_HEADERS},isRallyWinner,rallyCount`,
  '20200101-M-Test-F-One-Two,1,,,0,0,0-0,1,2,4f1*,,1,FALSE,FALSE,FALSE,FALSE,TRUE,2',
].join('\n');

const WALL_CLOCK = ['createdAt', 'timestamp'];
const one = (params: () => Params, label = 'representative input'): Case[] => [{ label, params }];

// ---------------------------------------------------------------------------------------------------------------------
// confirmed: answered from the input alone
// ---------------------------------------------------------------------------------------------------------------------

const CONFIRMED: Record<string, Case[]> = {
  analyzeMatchUp: one(() => ({ matchUp: clone(final) }), 'a completed final from the loaded record'),
  analyzeScore: one(() => ({ score: clone(SCORE), matchUpFormat: FORMAT, matchUpStatus: COMPLETED, winningSide: 1 })),
  analyzeSet: one(() => ({ setObject: clone(SETS[1]), matchUpScoringFormat: parse(FORMAT) })),
  applyDerivedRankings: one(() => ({
    entries: RANKING_LIST(),
    filter: { ageRange: { max: 16 } },
    asOfDate: '2026-12-31',
    participantContext: { ageAtDate: (personId: string) => (personId === 'bob' ? 18 : 15) },
  })),
  calculateMatchUpMargin: one(() => ({ matchUp: clone(final) })),
  calculateWinCriteria: one(() => clone(tieFormat)),
  categoryCanContain: one(() => ({
    category: { ageCategoryCode: 'U18' },
    childCategory: { ageCategoryCode: 'U16' },
    withDetails: true,
  })),
  checkScoreHasValue: one(() => ({ score: clone(SCORE) })),
  checkSetIsComplete: one(() => ({ set: clone(SETS[0]), matchUpFormat: FORMAT })),
  compareTieFormats: one(() => {
    const descendant = clone(tieFormat);
    descendant.collectionDefinitions[0].matchUpFormat = 'SET1-S:6/TB7';
    return { ancestor: clone(tieFormat), descendant };
  }),
  courtGridRows: one(() => ({
    courtsData: [
      { courtId: 'c1', venueId: 'v1', matchUps: [{ matchUpId: 'm1', schedule: { courtOrder: 2 } }] },
      { courtId: 'c2', venueId: 'v1', matchUps: [] },
    ],
    minRowsCount: 3,
  })),
  filterMatchUps: one(() => ({ matchUps: clone(singles), roundNumbers: [1], matchUpStatuses: [COMPLETED] })),
  generateRankingList: one(() => ({ pointAwards: clone(POINT_AWARDS), asOfDate: '2026-12-31' })),
  getAwardPoints: one(() => ({ valueObj: [{ drawSize: 32, value: 100 }, { value: 10 }], drawSize: 32 })),
  getAwardProfile: one(() => ({
    awardProfiles: clone(TEMPLATE_RANKING_POINTS_WTA[POLICY_TYPE_RANKING_POINTS].awardProfiles),
    participation: { participationOrder: 1, rankingStage: MAIN },
    eventType: SINGLES,
    level: 1,
  })),
  getCheckedInParticipantIds: one(() => ({ matchUp: clone(final) })),
  getDrawTypeCoercion: one(() => ({
    policyDefinitions: { draws: { drawTypeCoercion: { [ROUND_ROBIN]: false } } },
    drawType: ROUND_ROBIN,
  })),
  getDualIssues: one(() => ({ matchUp: clone(dual) }), 'a hydrated dual from the loaded record'),
  getEntryStatusOrdinals: one(() => ({ entries: clone(eliminationEvent.entries) })),
  getFeedInQualifyingPositions: one(() => ({ drawSize: 32 })),
  getHomeParticipantId: one(() => {
    const matchUp = clone(final);
    matchUp.schedule = { ...matchUp.schedule, homeParticipantId: matchUp.sides[0].participantId };
    return { matchUp };
  }),
  getMatchUpCheckInState: one(() => ({ matchUp: clone(final) })),
  getMatchUpType: one(() => ({ matchUp: clone(final) })),
  getMatchUpUpset: one(() => ({ matchUp: clone(final) })),
  getMaxEntryPosition: one(() => ({
    entries: clone(eliminationEvent.entries).map((entry: any, i: number) => ({ ...entry, entryPosition: i + 1 })),
  })),
  getMaxSetScore: one(() => ({ setTo: 6, tiebreakAt: 6, opponentScore: 5 })),
  getParticipantPoints: one(() => ({ pointAwards: clone(POINT_AWARDS), personId: 'alice' })),
  getRoundMatchUps: one(() => ({ matchUps: clone(singles) })),
  getScaleValues: one(() => ({ participant: rated() })),
  getSeasonAdvancement: one(() => ({ season: championship(), matchUps: seasonMatchUps })),
  getSeasonMovement: one(() => ({ season: SEASON(), periodId: firstPeriodId, matchUps: seasonMatchUps })),
  getSeasonStandings: one(() => ({ season: SEASON(), matchUps: seasonMatchUps })),
  getSeedingThresholds: one(() => ({ participantsCount: 32 })),
  getSetComplement: one(() => ({ lowValue: 4, setTo: 6, tiebreakAt: 6, isSide1: true })),
  getTally: one(() => ({ positionAssignment: clone(roundRobinAssignment) })),
  getTiebreakComplement: one(() => ({ lowValue: 5, tiebreakTo: 7, isSide1: true })),
  getTierMovement: one(() => ({
    fromTier: { system: 'ALTA', value: 'A1' },
    toTier: { system: 'ALTA', value: 'AA' },
    policyDefinitions: { [POLICY_TYPE_RANKING_POINTS]: { tierToLevel: { ALTA: { AA: 2, A1: 3 } } } },
  })),
  getValidGroupSizes: one(() => ({ drawSize: 20 })),
  isValid: one(() => ({ matchUpFormat: FORMAT })),
  isValidMatchUpFormat: one(() => ({ matchUpFormat: FORMAT })),
  keyValueScore: one(() => ({ scoreString: '', sets: [], matchUpFormat: FORMAT, value: '6' })),
  matchUpScheduleLocked: one(() => ({
    matchUp: { matchUpId: 'locked', schedule: { scheduledDate: '2026-06-15', lock: { lockedBy: 'referee' } } },
  })),
  // the replay stamps each point and the matchUp with the wall clock
  mcpValidator: [{ label: 'one charted point', params: () => ({ csvData: MCP_CSV }), normalise: WALL_CLOCK }],
  parseScoreString: one(() => ({ scoreString: '6-3 7-6(4)' })),
  participantScaleItem: one(() => ({
    participant: rated(),
    scaleAttributes: { scaleType: 'RATING', eventType: SINGLES, scaleName: 'WTN' },
  })),
  participantScheduledMatchUps: one(() => ({
    matchUps: clone(firstRound).map((matchUp: any, i: number) => ({
      ...matchUp,
      schedule: { scheduledDate: '2026-06-15', scheduledTime: `${10 + i}:00` },
    })),
  })),
  pbpValidator: one(() => ({ points: '0'.repeat(24) })),
  planNextPeriod: one(() => ({
    season: SEASON(),
    periodId: firstPeriodId,
    movements: clone(seasonMovement.proposals),
    tiedAtCut: clone(seasonMovement.tiedAtCut),
    overrides: clone(settled),
  })),
  queryOfficialRecord: one(() => ({ officialRecord: { officialRecordId: 'o1', certifications: [] } })),
  querySanctioningRecord: one(() => ({ sanctioningRecord: { sanctioningId: 's1', status: 'DRAFT' } })),
  repairScore: one(() => ({ score: clone(SCORE), matchUpFormat: FORMAT })),
  retainScoreForFormat: one(() => ({
    sets: clone(SETS),
    previousMatchUpFormat: FORMAT,
    matchUpFormat: 'SET3-S:6/TB7-F:TB10',
  })),
  runValidationPipeline: one(() => ({ engine: availability() })),
  tieFormatGenderValidityCheck: one(() => ({ referenceGender: 'MIXED', gender: 'MALE', matchUpType: SINGLES })),
  validateMatchUpFormat: one(() => ({ matchUpFormat: FORMAT })),
  validateOfficiatingStatusTransition: one(() => ({
    entityType: 'certification',
    fromStatus: 'ACTIVE',
    toStatus: 'SUSPENDED',
  })),
  validatePlayoffGroups: one(() => ({
    playoffGroups: [{ finishingPositions: [1] }, { finishingPositions: [2] }],
    groupCount: 2,
    groupSize: 4,
  })),
  validateScore: one(() => ({ score: clone(SCORE), matchUpFormat: FORMAT, matchUpStatus: COMPLETED, winningSide: 1 })),
  validateSeason: one(() => ({ season: SEASON() })),
  validateStatusTransition: one(() => ({ fromStatus: 'DRAFT', toStatus: 'SUBMITTED' })),
  validateTieFormat: one(() => ({ tieFormat: clone(tieFormat) })),
};

// ---------------------------------------------------------------------------------------------------------------------
// needs-state: an input naming the loaded record is answered with it and refused, or answered differently, without it
// ---------------------------------------------------------------------------------------------------------------------

const NEEDS_STATE: Record<string, () => Params> = {
  allCompetitionMatchUps: () => ({}),
  allDrawMatchUps: () => ({ drawId: eliminationDrawId }),
  allEventMatchUps: () => ({ eventId: eliminationEventId }),
  allTournamentMatchUps: () => ({}),
  competitionScheduleMatchUps: () => ({}),
  drawMatchUps: () => ({ drawId: eliminationDrawId }),
  eventMatchUps: () => ({ eventId: eliminationEventId }),
  getAllDrawMatchUps: () => ({ drawId: eliminationDrawId }),
  // in context, a structure's matchUps are hydrated from the record the engine supplies
  getAllStructureMatchUps: () => ({ structure: clone(eliminationDraw.structures[0]), inContext: true }),
  // without a policy, the attached ladder policy decides when a challenge expires
  getChallengeState: () => ({
    matchUp: { matchUpId: 'challenge', timeItems: [{ itemType: CHALLENGE_ISSUED, itemDate: '2026-05-01T00:00:00Z' }] },
    asOf: '2026-05-10T00:00:00Z',
  }),
  getCompetitionMatchUps: () => ({}),
  getDrawData: () => ({ drawId: eliminationDrawId }),
  getEventData: () => ({ eventId: eliminationEventId }),
  getLadderMovement: () => ({}),
  getLadderOrdering: () => ({}),
  getLadderPolicy: () => ({}),
  getPresenceExpectation: () => ({ participant: clone(participant), fact: 'signIn' }),
  getPresenceRules: () => ({}),
  getScenarioScheduleProjection: () => ({ scenarioId: 'draft' }),
  getScheduleScenario: () => ({ scenarioId: 'draft' }),
  getScheduleScenarios: () => ({}),
  // without an element, the record's own timeItems are read
  getTimeItem: () => ({ itemType: 'NOTE' }),
  // without a policy, the attached ladder policy sets the range
  isChallengeInRange: () => ({ defenderPosition: 3, challengerPosition: 5 }),
  positionActions: () => ({
    drawId: eliminationDrawId,
    structureId: eliminationDraw.structures[0].structureId,
    drawPosition: 1,
  }),
  publicFindCourt: () => ({ courtId: defined(venue.courts, 'courts')[0].courtId }),
  tournamentMatchUps: () => ({}),
};

// ---------------------------------------------------------------------------------------------------------------------
// throws: a representative input throws. None does today; the five that throw on an EMPTY input are confirmed, and
// listed under `throwsOnEmptyInput` (below)
// ---------------------------------------------------------------------------------------------------------------------

const THROWS: Record<string, () => Params> = {};

// ---------------------------------------------------------------------------------------------------------------------

type Outcome = { value?: unknown; threw?: string };
const settle = (call: () => unknown): Outcome => {
  try {
    return { value: call() };
  } catch (err) {
    return { threw: (err as Error)?.message ?? String(err) };
  }
};
const isRefusal = (outcome: Outcome) =>
  !!outcome.threw || (!!outcome.value && typeof outcome.value === 'object' && 'error' in (outcome.value as object));

const engine = tournamentEngine as any;
const governorFunction = (name: string) =>
  Object.values(governors as Record<string, any>).find((governor) => typeof governor?.[name] === 'function')[name];

function threeWays(name: string, params: () => Params, normalise: string[] = []) {
  engine.reset();
  const unloaded = settle(() => engine[name](params()));
  engine.setState(tournamentRecord);
  const loaded = settle(() => engine[name](params()));
  engine.reset();
  const direct = settle(() => governorFunction(name)(params()));
  const normalised = (outcome: Outcome) => (normalise.length ? replaceFields(outcome, normalise) : outcome);
  return { unloaded: normalised(unloaded), loaded: normalised(loaded), direct: normalised(direct) };
}

function replaceFields(value: any, fields: string[]): any {
  if (Array.isArray(value)) return value.map((item) => replaceFields(item, fields));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      fields.includes(key) ? '<normalised>' : replaceFields(item, fields),
    ]),
  );
}

const confirmed: string[] = ratchet.confirmed;
const excluded = ratchet.excluded as Record<string, { reason: string; detail: string }>;
const excludedFor = (reason: string) =>
  Object.keys(excluded)
    .filter((name) => excluded[name].reason === reason)
    .sort();

describe('the ratchet list', () => {
  it('accounts for every candidate once, by name', () => {
    const names = [...confirmed, ...Object.keys(excluded)];
    expect(new Set(names).size).toEqual(names.length);
    expect(names.length).toEqual(ratchet.candidates);
    expect(confirmed).toEqual([...confirmed].sort());
  });

  it('names governor functions the engine mounts', () => {
    const names = [...confirmed, ...Object.keys(excluded)];
    expect(names.filter((name) => typeof engine[name] !== 'function' || !governorFunction(name))).toEqual([]);
  });

  it('gives each exclusion a known reason and a detail', () => {
    const reasons = ['needs-state', 'own-engine', 'throws', 'cannot-construct-input'];
    expect(Object.keys(excluded).filter((name) => !reasons.includes(excluded[name].reason))).toEqual([]);
    expect(Object.keys(excluded).filter((name) => !excluded[name].detail)).toEqual([]);
  });

  it('matches the cases this file runs', () => {
    expect(Object.keys(CONFIRMED).sort()).toEqual(confirmed);
    expect(Object.keys(NEEDS_STATE).sort()).toEqual(excludedFor('needs-state'));
    expect(Object.keys(THROWS).sort()).toEqual(excludedFor('throws'));
  });
});

describe('a confirmed tool answers from its input alone', () => {
  it.each(confirmed)('%s', (name) => {
    let answered = 0;
    for (const { label, params, normalise } of CONFIRMED[name]) {
      const { unloaded, loaded, direct } = threeWays(name, params, normalise);
      expect(unloaded, `${label}: engine without a record vs direct`).toEqual(direct);
      expect(loaded, `${label}: engine with a record vs direct`).toEqual(direct);
      if (!isRefusal(direct)) answered += 1;
    }
    // a tool confirmed only on a refusal is not confirmed
    expect(answered).toBeGreaterThan(0);
  });
});

describe('an excluded tool is excluded for its stated reason', () => {
  it.each(excludedFor('needs-state'))('%s needs state: answered differently without the record', (name) => {
    const { unloaded, loaded } = threeWays(name, NEEDS_STATE[name]);
    expect(unloaded).not.toEqual(loaded);
  });

  it.each(excludedFor('throws'))('%s throws on a direct call', (name) => {
    expect(threeWays(name, THROWS[name]).direct.threw).toBeDefined();
  });

  it.each(excludedFor('own-engine'))('%s is mounted on the sanctioning or officiating engine', (name) => {
    const own = [sanctioningEngine, officiatingEngine].filter(
      (candidate: any) => typeof candidate[name] === 'function',
    );
    expect(own.length).toEqual(1);
  });
});

/**
 * No confirmed tool throws on an empty input. Five did at slice A (applyDerivedRankings, generateRankingList,
 * getAwardProfile, getParticipantPoints, runValidationPipeline); slice C made them refuse. `throwsOnEmptyInput` stays
 * in the list, empty, so a new thrower is recorded there or fixed, not missed.
 */
describe('an empty input', () => {
  const throwsOnEmptyInput = ratchet.throwsOnEmptyInput as Record<string, string>;

  it('throws, called directly, from exactly the recorded tools, with the recorded message', () => {
    const thrown: Record<string, string> = {};
    for (const name of [...confirmed, ...Object.keys(excluded)]) {
      const threw = settle(() => governorFunction(name)({})).threw;
      if (threw) thrown[name] = threw;
    }
    expect(thrown).toEqual(throwsOnEmptyInput);
  });

  it('records only confirmed tools, each answered on its valid input above', () => {
    expect(Object.keys(throwsOnEmptyInput).filter((name) => !confirmed.includes(name))).toEqual([]);
  });
});

// the five former throwers: the standard refusal for the required input, alike through the engine and called directly
const REFUSALS: Record<string, { param: string; invalid: Params }> = {
  applyDerivedRankings: { param: 'entries', invalid: { entries: 'not a list', filter: {} } },
  generateRankingList: { param: 'pointAwards', invalid: { pointAwards: {} } },
  getAwardProfile: { param: 'awardProfiles', invalid: { awardProfiles: 'not a list' } },
  getParticipantPoints: { param: 'pointAwards', invalid: { pointAwards: 7, personId: 'alice' } },
  runValidationPipeline: { param: 'engine', invalid: { engine: {} } },
};

describe('a former thrower refuses a missing or invalid required input', () => {
  it.each(Object.entries(REFUSALS))('%s', (name, { param, invalid }) => {
    for (const [params, error] of [
      [{}, MISSING_VALUE],
      [invalid, INVALID_VALUES],
    ] as const) {
      const { unloaded, loaded, direct } = threeWays(name, () => clone(params));
      expect(direct.threw).toBeUndefined();
      expect(direct.value).toMatchObject({ error, info: { param } });
      expect(unloaded).toEqual(direct);
      expect(loaded).toEqual(direct);
    }
    // no params object at all
    expect(governorFunction(name)()).toMatchObject({ error: MISSING_VALUE, info: { param } });
  });

  it('refuses a missing filter, not only missing entries', () => {
    expect(governors.rankingGovernor.applyDerivedRankings({ entries: RANKING_LIST() } as any)).toMatchObject({
      error: MISSING_VALUE,
      info: { param: 'filter' },
    });
  });
});

const exposed = ratchet.exposed as Record<string, string>;
const unexposed = ratchet.unexposed as Record<string, string>;
const HOMES: Record<string, any> = { tools, availability: availabilityExport };
const resolveHome = (path: string) => path.split('.').reduce((node: any, key) => node?.[key], HOMES);

describe('a confirmed tool has a standalone home', () => {
  it('each confirmed tool is exposed or says why not, and nothing else is listed', () => {
    expect([...Object.keys(exposed), ...Object.keys(unexposed)].sort()).toEqual(confirmed);
    expect(Object.keys(exposed).filter((name) => name in unexposed)).toEqual([]);
    expect(Object.keys(unexposed).filter((name) => !unexposed[name])).toEqual([]);
  });

  it.each(Object.keys(exposed))('%s is the governor function at its home', (name) => {
    expect(typeof resolveHome(exposed[name])).toEqual('function');
    expect(resolveHome(exposed[name])).toBe(governorFunction(name));
  });
});
