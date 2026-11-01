import { getParticipantResults } from '@Query/matchUps/roundRobinTally/getParticipantResults';
import { matchUpCompletion } from '@Query/matchUp/checkMatchUpIsComplete';
import { orderParticipants } from '@Query/standings/orderParticipants';
import { fromV1, V1_PRIMARY_KEYS } from '@Query/standings/fromV1';
import { decorateResult } from '@Functions/global/decorateResult';
import { validateSeason } from '@Validators/validateSeason';

// constants and types
import type {
  CompetitionRef,
  Season,
  SeasonPeriod,
  SeasonStandingRow,
  SeasonStandingsTally,
  SeasonSubject,
} from '@Types/seasonTypes';
import { INVALID_VALUES, MISSING_MATCHUPS } from '@Constants/errorConditionConstants';
import type { HydratedMatchUp, HydratedParticipant } from '@Types/hydrated';
import type { RoundRobinTallyPolicy } from '@Types/roundRobinTallyPolicy';
import type { ParticipantResults } from '@Query/standings/standingsTypes';
import type { ErrorType } from '@Constants/errorConditionConstants';
import { SUBJECT_PERSON, SUBJECT_TEAM } from '@Constants/seasonConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/participantConstants';
import { ResultType } from '@Types/factoryTypes';

export type SubjectResolver = (participant: HydratedParticipant) => string | undefined;

type TierRows = Record<string, Map<string, SeasonStandingRow>>;

/** a tier's matchUps with sides rewritten to subject keys, and what each key stands for */
type TierBucket = {
  matchUps: HydratedMatchUp[];
  subjects: Map<string, SeasonSubject>;
  participantIds: Map<string, string[]>;
};

type GetSeasonStandingsArgs = {
  season: Season;
  /** IN-CONTEXT matchUps the caller has already selected; the factory never loads records */
  matchUps: HydratedMatchUp[];
  /** one period; when omitted, every period that declares `includeInStandings` */
  periodId?: string;
  tierId?: string;
  /**
   * Resolves a participant to the durable id standings are kept for. Defaults: a TEAM to its participantId,
   * an individual to `person.personId`. A pair, or a team whose participantId is not stable across records,
   * needs a resolver; an unresolved participant is reported in `unmapped`, never dropped.
   */
  getSubjectId?: SubjectResolver;
  /** tally fields compared in order, higher first; defaults to matchUps won, then value, sets and games */
  orderBy?: (keyof SeasonStandingsTally)[];
  tallyPolicy?: RoundRobinTallyPolicy;
};

export type SeasonStandingsResult = ResultType & {
  /** keyed by tierId, ranked */
  standings?: Record<string, SeasonStandingRow[]>;
  /** participants no subject id could be resolved for */
  unmapped?: { participantId: string; tierId: string; tournamentId: string }[];
  /** references that no matchUp answered: a missing, unpublished or unselected competition */
  unanswered?: CompetitionRef[];
  /** subjects who played in a tier the period's placements do not put them in */
  unplaced?: { tierId: string; periodId: string; subject: SeasonSubject }[];
  /** keyed by tierId: true while any referenced matchUp in the tier has no result */
  provisional?: Record<string, boolean>;
};

type Reports = Required<Omit<SeasonStandingsResult, keyof ResultType | 'standings' | 'provisional'>>;

const DEFAULT_ORDER: (keyof SeasonStandingsTally)[] = ['matchUpsWon', 'valueWon', 'setsWon', 'gamesWon'];
/** a season's ledger carries the tie-score values too, so a policy may rank by them first */
const SEASON_PRIMARY_KEYS = [...V1_PRIMARY_KEYS, 'valueWon', 'valueLost'];
const TALLY_FIELDS: (keyof SeasonStandingsTally)[] = [
  'matchUpsWon',
  'matchUpsLost',
  'matchUpsDrawn',
  'valueWon',
  'valueLost',
  'setsWon',
  'setsLost',
  'gamesWon',
  'gamesLost',
];

/**
 * A season's standings, per tier, derived from the results of the competitions its periods reference. Pure: the
 * caller supplies the matchUps (courthive-query from its rows, a test from mocks).
 *
 * Fails closed in the open: a reference no matchUp answered is reported in `unanswered` rather than shrinking the
 * table silently, and a participant with no durable identity is reported in `unmapped` rather than dropped.
 */
export function getSeasonStandings(params: GetSeasonStandingsArgs): SeasonStandingsResult {
  const stack = 'getSeasonStandings';
  const { season, matchUps, periodId, tierId, getSubjectId } = params;
  const valid = validateSeason({ season });
  if (valid.error) return valid;
  if (!Array.isArray(matchUps)) return decorateResult({ result: { error: MISSING_MATCHUPS }, stack });

  const periods = periodId
    ? season.periods.filter((period) => period.periodId === periodId)
    : season.periods.filter((period) => period.includeInStandings);
  if (periodId && !periods.length) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      context: { periodId },
      info: 'unknown periodId',
      stack,
    });
  }

  const rows: TierRows = {};
  const buckets: Record<string, TierBucket> = {};
  const reports: Reports = { unmapped: [], unanswered: [], unplaced: [] };

  for (const period of periods) {
    seedPlacements({ period, rows, tierId });
    for (const ref of period.competitions.filter((competition) => !tierId || competition.tierId === tierId)) {
      collectReference({ ref, period, matchUps, buckets, reports, getSubjectId });
    }
  }

  const standings: Record<string, SeasonStandingRow[]> = {};
  const provisional: Record<string, boolean> = {};
  const tierIds = new Set([...Object.keys(rows), ...Object.keys(buckets)]);
  for (const key of tierIds) {
    const bucket = buckets[key];
    const tallyPolicy =
      params.tallyPolicy ?? season.tiers.find((tier) => tier.tierId === key)?.tallyPolicy ?? season.tallyPolicy;
    const ledger = bucket ? tierLedger(bucket, tallyPolicy) : { participantResults: {} };
    if ('error' in ledger && ledger.error) return decorateResult({ result: ledger, context: { tierId: key }, stack });
    const participantResults = ledger.participantResults as ParticipantResults;
    for (const [subjectKey, result] of Object.entries(participantResults)) {
      const subject = bucket?.subjects.get(subjectKey);
      if (!subject) continue; // an unmapped opponent: credited to the other side, never a row
      const row = getRow(rows, key, subject);
      row.participantIds = bucket?.participantIds.get(subjectKey) ?? [];
      for (const field of TALLY_FIELDS) row[field] = Number(result[field] ?? 0);
    }
    const tierRows = [...(rows[key]?.values() ?? [])];
    // the engine orders by policy unless the caller asks for the flat order by name
    standings[key] =
      tallyPolicy && !params.orderBy?.length && bucket
        ? rankByPolicy({ tierRows, participantResults, bucket, tallyPolicy })
        : rankRows(tierRows, params.orderBy?.length ? params.orderBy : DEFAULT_ORDER);
    provisional[key] = !bucket || bucket.matchUps.some((matchUp) => !matchUpCompletion(matchUp));
  }

  return { standings, provisional, ...reports };
}

function referencedMatchUps(ref: CompetitionRef, matchUps: HydratedMatchUp[]) {
  // a TEAM line belongs to its tie and is counted through the tie's tieMatchUps, never on its own
  return matchUps.filter(
    (matchUp) =>
      matchUp?.tournamentId === ref.tournamentId &&
      (!ref.eventId || matchUp.eventId === ref.eventId) &&
      (!ref.drawId || matchUp.drawId === ref.drawId) &&
      !matchUp.collectionId,
  );
}

type CollectReferenceArgs = {
  buckets: Record<string, TierBucket>;
  getSubjectId?: SubjectResolver;
  matchUps: HydratedMatchUp[];
  period: SeasonPeriod;
  ref: CompetitionRef;
  reports: Reports;
};

/**
 * Adds a reference's matchUps to its tier, each side rewritten from the record-scoped participantId to the subject it
 * resolves to: one ledger then spans every period and record, so head-to-head reaches across them. A side with no
 * subject keeps an `unmapped:` key: its opponent is still credited with the result, and it never becomes a row.
 */
function collectReference({ ref, period, matchUps, buckets, reports, getSubjectId }: CollectReferenceArgs) {
  const refMatchUps = referencedMatchUps(ref, matchUps);
  if (!refMatchUps.length) {
    reports.unanswered.push(ref);
    return;
  }
  buckets[ref.tierId] ??= { matchUps: [], subjects: new Map(), participantIds: new Map() };
  const bucket = buckets[ref.tierId];
  const placed = placedSubjectKeys(period, ref.tierId);
  const seen = new Map<string, string>();

  const keyFor = (side?: { participantId?: string; participant?: HydratedParticipant }) => {
    const participantId = side?.participantId;
    if (!participantId) return undefined;
    if (seen.has(participantId)) return seen.get(participantId);
    const participant = side?.participant ?? ({ participantId } as HydratedParticipant);
    const subject = resolveSubject(participant, getSubjectId);
    let key = `unmapped:${participantId}`;
    if (subject) {
      key = subjectKey(subject);
      bucket.subjects.set(key, subject);
      const participantIds = bucket.participantIds.get(key) ?? [];
      if (!participantIds.includes(participantId)) participantIds.push(participantId);
      bucket.participantIds.set(key, participantIds);
      if (placed && !placed.has(key)) reports.unplaced.push({ tierId: ref.tierId, periodId: period.periodId, subject });
    } else {
      reports.unmapped.push({ participantId, tierId: ref.tierId, tournamentId: ref.tournamentId });
    }
    seen.set(participantId, key);
    return key;
  };

  for (const matchUp of refMatchUps) {
    const sides = (matchUp.sides ?? []).map((side) => ({ ...side, participantId: keyFor(side) }));
    bucket.matchUps.push({ ...matchUp, sides } as HydratedMatchUp);
  }
}

/** the tier's ledger: the round-robin tally of its subject-keyed matchUps, plus the tie-score values */
function tierLedger(
  bucket: TierBucket,
  tallyPolicy?: RoundRobinTallyPolicy,
  participantIds?: string[],
  groupingTotal?: string,
): { participantResults?: ParticipantResults; error?: ErrorType; info?: string } {
  const tally = getParticipantResults({ matchUps: bucket.matchUps, tallyPolicy, participantIds, groupingTotal });
  if (tally.error) return tally;
  const participantResults = (tally.participantResults ?? {}) as ParticipantResults;
  const scoped = participantIds ? new Set(participantIds) : undefined;
  for (const matchUp of bucket.matchUps) {
    if (matchUp.matchUpType !== TEAM_MATCHUP) continue;
    const keys = (matchUp.sides ?? []).map((side) => side?.participantId as string);
    if (scoped && !keys.every((key) => scoped.has(key))) continue;
    keys.forEach((key, sideIndex) => {
      const result = participantResults[key];
      if (!result) return;
      for (const set of matchUp.score?.sets ?? []) {
        const own = sideIndex === 0 ? set.side1Score : set.side2Score;
        const other = sideIndex === 0 ? set.side2Score : set.side1Score;
        result.valueWon = Number(result.valueWon ?? 0) + Number(own ?? 0);
        result.valueLost = Number(result.valueLost ?? 0) + Number(other ?? 0);
      }
    });
  }
  return { participantResults };
}

type RankByPolicyArgs = {
  participantResults: ParticipantResults;
  tallyPolicy: RoundRobinTallyPolicy;
  tierRows: SeasonStandingRow[];
  bucket: TierBucket;
};

/**
 * The standings engine's order (spec § 5): the tier's tally policy, read through `fromV1` with the tie-score values
 * as primary measures too. A placed subject who has not played follows everyone who has, sharing that place.
 */
function rankByPolicy({ tierRows, participantResults, bucket, tallyPolicy }: RankByPolicyArgs) {
  const played = Object.fromEntries(
    Object.entries(participantResults).filter(([key]) => bucket.subjects.has(key)),
  ) as ParticipantResults;
  const { groupOrder } = orderParticipants({
    recalculate: ({ participantIds, groupingTotal }) => tierLedger(bucket, tallyPolicy, participantIds, groupingTotal),
    policy: fromV1(tallyPolicy, SEASON_PRIMARY_KEYS),
    participantResults: played,
  });
  const byKey = new Map(tierRows.map((row) => [subjectKey(row.subject), row]));
  const ranked = groupOrder.flatMap(({ participantId, rankOrder }) => {
    const row = byKey.get(participantId);
    if (!row) return [];
    row.rank = rankOrder ?? 0;
    byKey.delete(participantId);
    return [row];
  });
  const unplayedRank = ranked.length + 1;
  const unplayed = [...byKey.values()].sort((a, b) => a.subject.subjectId.localeCompare(b.subject.subjectId));
  for (const row of unplayed) row.rank = unplayedRank;
  return [...ranked, ...unplayed];
}

function resolveSubject(participant: HydratedParticipant, getSubjectId?: SubjectResolver): SeasonSubject | undefined {
  const isTeam = participant?.participantType === TEAM;
  const subjectId = getSubjectId
    ? getSubjectId(participant)
    : (isTeam && participant.participantId) || participant?.person?.personId;
  if (!subjectId) return undefined;
  return { subjectType: isTeam ? SUBJECT_TEAM : SUBJECT_PERSON, subjectId };
}

const subjectKey = (subject: SeasonSubject) => `${subject.subjectType}:${subject.subjectId}`;

function placedSubjectKeys(period: SeasonPeriod, tierId: string): Set<string> | undefined {
  const placement = period.placements?.find((p) => p.tierId === tierId);
  return placement ? new Set(placement.subjects.map(subjectKey)) : undefined;
}

// placed subjects are in the tier whether or not they have played yet
function seedPlacements({ period, rows, tierId }: { period: SeasonPeriod; rows: TierRows; tierId?: string }) {
  for (const placement of period.placements ?? []) {
    if (tierId && placement.tierId !== tierId) continue;
    for (const subject of placement.subjects) getRow(rows, placement.tierId, subject);
  }
}

function getRow(rows: TierRows, tierId: string, subject: SeasonSubject): SeasonStandingRow {
  rows[tierId] ??= new Map();
  const key = subjectKey(subject);
  let row = rows[tierId].get(key);
  if (!row) {
    row = {
      participantIds: [],
      matchUpsDrawn: 0,
      matchUpsLost: 0,
      matchUpsWon: 0,
      valueLost: 0,
      gamesLost: 0,
      valueWon: 0,
      setsLost: 0,
      gamesWon: 0,
      setsWon: 0,
      rank: 0,
      subject,
    };
    rows[tierId].set(key, row);
  }
  return row;
}

// standard competition ranking (1, 2, 2, 4): subjects level on every orderBy field share a rank
function rankRows(rows: SeasonStandingRow[], orderBy: (keyof SeasonStandingsTally)[]) {
  const compare = (a: SeasonStandingRow, b: SeasonStandingRow) => {
    for (const field of orderBy) {
      if (a[field] !== b[field]) return b[field] - a[field];
    }
    return 0;
  };
  const sorted = [...rows].sort((a, b) => compare(a, b) || a.subject.subjectId.localeCompare(b.subject.subjectId));
  sorted.forEach((row, index) => {
    row.rank = index && compare(sorted[index - 1], row) === 0 ? sorted[index - 1].rank : index + 1;
  });
  return sorted;
}
