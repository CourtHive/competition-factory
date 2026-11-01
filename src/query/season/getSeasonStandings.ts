import { getParticipantResults } from '@Query/matchUps/roundRobinTally/getParticipantResults';
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
import { SUBJECT_PERSON, SUBJECT_TEAM } from '@Constants/seasonConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/participantConstants';
import { ResultType } from '@Types/factoryTypes';

export type SubjectResolver = (participant: HydratedParticipant) => string | undefined;

type ParticipantTally = Partial<Record<keyof SeasonStandingsTally, number>>;
type TierRows = Record<string, Map<string, SeasonStandingRow>>;

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
};

type Reports = Required<Omit<SeasonStandingsResult, keyof ResultType | 'standings'>>;

const DEFAULT_ORDER: (keyof SeasonStandingsTally)[] = ['matchUpsWon', 'valueWon', 'setsWon', 'gamesWon'];
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
  const { season, matchUps, periodId, tierId, getSubjectId, tallyPolicy } = params;
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
  const reports: Reports = { unmapped: [], unanswered: [], unplaced: [] };

  for (const period of periods) {
    seedPlacements({ period, rows, tierId });
    for (const ref of period.competitions.filter((competition) => !tierId || competition.tierId === tierId)) {
      const refResult = tallyReference({ ref, period, matchUps, rows, reports, getSubjectId, tallyPolicy });
      if (refResult?.error) return decorateResult({ result: refResult, context: { ref }, stack });
    }
  }

  const orderBy = params.orderBy?.length ? params.orderBy : DEFAULT_ORDER;
  const standings = Object.fromEntries(
    Object.entries(rows).map(([key, subjectRows]) => [key, rankRows([...subjectRows.values()], orderBy)]),
  );

  return { standings, ...reports };
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

type TallyReferenceArgs = {
  tallyPolicy?: RoundRobinTallyPolicy;
  getSubjectId?: SubjectResolver;
  matchUps: HydratedMatchUp[];
  period: SeasonPeriod;
  ref: CompetitionRef;
  reports: Reports;
  rows: TierRows;
};

function tallyReference({ ref, period, matchUps, rows, reports, getSubjectId, tallyPolicy }: TallyReferenceArgs) {
  const refMatchUps = referencedMatchUps(ref, matchUps);
  if (!refMatchUps.length) {
    reports.unanswered.push(ref);
    return undefined;
  }

  const tally = getParticipantResults({ matchUps: refMatchUps, tallyPolicy });
  if (tally.error) return tally;
  const participantResults = (tally.participantResults ?? {}) as Record<string, ParticipantTally>;

  const participants = new Map<string, HydratedParticipant>();
  for (const matchUp of refMatchUps) {
    for (const side of matchUp.sides ?? []) {
      if (side?.participantId && side.participant) participants.set(side.participantId, side.participant);
    }
  }
  const placed = placedSubjectKeys(period, ref.tierId);

  for (const [participantId, participantResult] of Object.entries(participantResults)) {
    const participant = participants.get(participantId) ?? ({ participantId } as HydratedParticipant);
    const subject = resolveSubject(participant, getSubjectId);
    if (!subject) {
      reports.unmapped.push({ participantId, tierId: ref.tierId, tournamentId: ref.tournamentId });
      continue;
    }
    if (placed && !placed.has(subjectKey(subject))) {
      reports.unplaced.push({ tierId: ref.tierId, periodId: period.periodId, subject });
    }

    const row = getRow(rows, ref.tierId, subject);
    if (!row.participantIds.includes(participantId)) row.participantIds.push(participantId);
    for (const field of TALLY_FIELDS) row[field] += Number(participantResult[field] ?? 0);
    addTieValues(row, participantId, refMatchUps);
  }
  return undefined;
}

// the tie score (a set whose side scores are the lines, points or games won) summed; REPORTED and DERIVED alike
function addTieValues(row: SeasonStandingRow, participantId: string, refMatchUps: HydratedMatchUp[]) {
  for (const matchUp of refMatchUps) {
    if (matchUp.matchUpType !== TEAM_MATCHUP) continue;
    const sideIndex = (matchUp.sides ?? []).findIndex((side) => side?.participantId === participantId);
    if (sideIndex < 0) continue;
    for (const set of matchUp.score?.sets ?? []) {
      const own = sideIndex === 0 ? set.side1Score : set.side2Score;
      const other = sideIndex === 0 ? set.side2Score : set.side1Score;
      row.valueWon += Number(own ?? 0);
      row.valueLost += Number(other ?? 0);
    }
  }
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
