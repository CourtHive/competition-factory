import { activePlayersOf, hasLineUps, substituted, type LineUps } from './lineUps';
import { isClosed } from './decide';

// constants and types
import type { MatchUp, Point, ScoreEntry, SetScore, SubstitutionEvent } from '@Types/scoring/types';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { ScoredPoint, ScoringState } from './types';
import { POINT, SUBSTITUTION } from './actions';

/**
 * ScoringEngine v2 (SE2c): the matchUp record a host saves (§ 1.2, § 12.1), written from the reduced state. Only
 * `score`, `history`, `winningSide`, `matchUpStatus` and `endTime` are the reduction's; the identity, the sides and
 * any metadata a host attached are kept as they were.
 */

/** the sets as the record holds them; the set in play of a consecutive-points game carries its run (§ 1.2) */
function recordedSets(state: ScoringState): SetScore[] {
  return state.sets.map((set, index) => {
    const recorded: SetScore = { ...set };
    const inPlay = index === state.sets.length - 1 && !isClosed(set);
    const run = state.game?.run;
    if (inPlay && run) recorded.currentStreak = { side: run.side, count: run.length };
    return recorded;
  });
}

type Played = { points: Point[]; entries: ScoreEntry[]; substitutions: SubstitutionEvent[]; endTime?: string };

/**
 * The points with the players on court for each (§ 11.1), the entries with each point entry's `pointIndex`, the
 * substitutions mirrored, and the timestamp of the entry that completed the match (§ 12.7).
 */
function played(
  state: ScoringState,
  entries: ScoreEntry[],
  completedBy: number | undefined,
  lineUps: { initial?: LineUps; doubles: boolean },
): Played {
  let onCourt: LineUps = { ...(lineUps.initial ?? {}) };
  const withPlayers = hasLineUps(lineUps.initial);
  const points: Point[] = [];
  const substitutions: SubstitutionEvent[] = [];
  const indexed = entries.map((entry) => {
    if (entry.type === SUBSTITUTION) {
      onCourt = substituted(onCourt, entry.data as SubstitutionEvent);
      substitutions.push(entry.data as SubstitutionEvent);
      return entry;
    }
    if (entry.type !== POINT || entry.pointIndex === undefined) return entry;
    const point = state.points[entry.pointIndex] as ScoredPoint | undefined;
    if (point)
      points[entry.pointIndex] = toPoint(point, withPlayers ? activePlayersOf(onCourt, lineUps.doubles) : undefined);
    return entry;
  });
  const endTime = completedBy === undefined ? undefined : entries[completedBy]?.timestamp;
  return { points: points.filter(Boolean), entries: indexed, substitutions, endTime };
}

/** a point keeps players it recorded (a record without a timeline); otherwise it gets those on court */
function toPoint(point: ScoredPoint, activePlayers: Point['activePlayers']): Point {
  const recorded = point.activePlayers !== undefined;
  return { ...(point as unknown as Point), ...(activePlayers && !recorded ? { activePlayers } : {}) };
}

export type Materialized = {
  base: MatchUp;
  state: ScoringState;
  entries: ScoreEntry[];
  /** the index of the entry that completed the match, when it is complete */
  completedBy?: number;
  lineUps: { initial?: LineUps; current?: LineUps; doubles: boolean };
  /** a legacy point-only record (§ 12.6 shape 2) keeps no `entries` */
  timeline: boolean;
};

export function materialize({ base, state, entries, completedBy, lineUps, timeline }: Materialized): MatchUp {
  const { points, substitutions, endTime } = played(state, entries, completedBy, lineUps);
  const {
    winningSide: _winningSide,
    endTime: _endTime,
    history: previous,
    serverFlip: _serverFlip,
    ...identity
  } = base;
  const history: MatchUp['history'] = {
    points,
    ...(timeline ? { entries } : {}),
    ...(substitutions.length || previous?.substitutions ? { substitutions } : {}),
  };
  const recorded: MatchUp = {
    ...identity,
    matchUpStatus: state.matchUpStatus,
    ...(state.winningSide ? { winningSide: state.winningSide } : {}),
    ...(state.matchUpStatus === COMPLETED && endTime ? { endTime } : {}),
    score: { sets: recordedSets(state) },
    sides: (identity.sides ?? []).map((side) =>
      lineUps.current?.[side.sideNumber] ? { ...side, lineUp: lineUps.current[side.sideNumber] } : side,
    ),
  };
  if (previous || entries.length || points.length) recorded.history = history;
  return recorded;
}
