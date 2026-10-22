// constants and types
import type { SubstitutionError, SubstitutionRules, SubstitutionViolation } from '../ScoringEngine';
import type { ScoreEntry, SubstitutionEvent, TeamCompetitor } from '@Types/scoring/types';

/**
 * ScoringEngine v2 (SE2c): lineUps and substitution (§ 2.7). A side's lineUp is setup, outside the timeline; a
 * substitution is a timeline action that swaps one participant from the next point on. Each point records the
 * players on court when it was played (`activePlayers`, § 11.1), and a rebuild replays the substitutions from the
 * initial snapshot so every point keeps its players.
 */

export type LineUps = Record<number, TeamCompetitor[]>;

export function copyLineUps(lineUps: LineUps | undefined): LineUps | undefined {
  if (!lineUps) return undefined;
  return Object.fromEntries(Object.entries(lineUps).map(([side, lineUp]) => [side, lineUp.map((tc) => ({ ...tc }))]));
}

const ids = (lineUp: TeamCompetitor[] | undefined): string[] =>
  (lineUp ?? []).map((tc) => tc.participantId).filter((id): id is string => typeof id === 'string');

/** a substitution applied to the lineUps: the out participant's place taken by the in participant */
export function substituted(lineUps: LineUps, event: SubstitutionEvent): LineUps {
  const lineUp = lineUps[event.sideNumber];
  if (!lineUp) return lineUps;
  const swapped = lineUp.map((tc) =>
    tc.participantId === event.outParticipantId ? { ...tc, participantId: event.inParticipantId } : tc,
  );
  return { ...lineUps, [event.sideNumber]: swapped };
}

/** the players on court, one per side in singles and every player per side in doubles (§ 11.1) */
export function activePlayersOf(lineUps: LineUps, doubles: boolean): [string, string] | [string[], string[]] {
  if (doubles) return [ids(lineUps[1]), ids(lineUps[2])];
  return [ids(lineUps[1])[0] ?? '', ids(lineUps[2])[0] ?? ''];
}

export const hasLineUps = (lineUps: LineUps | undefined): lineUps is LineUps =>
  !!lineUps && Object.values(lineUps).some((lineUp) => lineUp.length > 0);

/**
 * The lineUps a matchUp started from: its current lineUps with every substitution on its timeline undone, last
 * first (§ 12.5). Undefined when no side has a lineUp.
 */
export function initialLineUpsOf(
  current: LineUps | undefined,
  entries: ScoreEntry[] | undefined,
  recorded: SubstitutionEvent[] | undefined,
): LineUps | undefined {
  if (!hasLineUps(current)) return undefined;
  const events: SubstitutionEvent[] = entries
    ? entries.filter((entry) => entry.type === 'substitution').map((entry) => entry.data as SubstitutionEvent)
    : (recorded ?? []);
  let lineUps = copyLineUps(current) as LineUps;
  for (const event of [...events].reverse()) {
    const undone = { ...event, outParticipantId: event.inParticipantId, inParticipantId: event.outParticipantId };
    lineUps = substituted(lineUps, undone);
  }
  return lineUps;
}

/** why a substitution would leave the lineUp naming the wrong players (§ 2.7), if it would */
export function substitutionError(
  lineUps: LineUps | undefined,
  event: SubstitutionEvent,
): SubstitutionError | undefined {
  if (event.outParticipantId === event.inParticipantId) return 'SAME_PARTICIPANT';
  const lineUp = lineUps?.[event.sideNumber];
  if (!lineUp?.length) return 'NO_LINEUP';
  if (!ids(lineUp).includes(event.outParticipantId)) return 'OUT_NOT_ON_SIDE';
  const onCourt = [...ids(lineUps?.[1]), ...ids(lineUps?.[2])];
  if (onCourt.includes(event.inParticipantId)) return 'IN_ALREADY_ON_COURT';
  return undefined;
}

type Situation = {
  substitutions: SubstitutionEvent[];
  /** the set each substitution was made in, 1-based, an event recorded without one placed by its point */
  setOf: (event: SubstitutionEvent) => number;
  setInPlay: number;
  gameHasPoints: boolean;
  matchUpType?: string;
};

/** what a substitution made now would break of the competition's advisory rules (§ 2.7); never a refusal */
export function substitutionViolations(
  rules: SubstitutionRules | undefined,
  situation: Situation,
): SubstitutionViolation[] {
  if (!rules) return [];
  const violations: SubstitutionViolation[] = [];
  const { substitutions } = situation;
  if (!rules.allowed) violations.push('NOT_ALLOWED');
  if (rules.maxPerMatchUp !== undefined && substitutions.length >= rules.maxPerMatchUp)
    violations.push('MAX_PER_MATCHUP');
  const inSegment = substitutions.filter((event) => situation.setOf(event) === situation.setInPlay).length;
  if (rules.maxPerSegment !== undefined && inSegment >= rules.maxPerSegment) violations.push('MAX_PER_SEGMENT');
  if (rules.timing === 'BETWEEN_GAMES' && situation.gameHasPoints) violations.push('TIMING');
  const types = rules.allowedMatchUpTypes;
  if (types && situation.matchUpType && !types.includes(situation.matchUpType)) violations.push('MATCHUP_TYPE');
  return violations;
}
