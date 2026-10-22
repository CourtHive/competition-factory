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
  kept: number,
): Played {
  // a point entry's pointIndex is its point's position in the record (§ 12.4). The reduced state may still count
  // points a non-recalculating removal took out of the record, so a point added since is that many places further
  // on in the state; the points before it are the record's own, kept as they are
  const added = entries.filter((entry) => entry.type === POINT && (entry.pointIndex ?? -1) >= kept).length;
  const shift = kept ? state.points.length - kept - added : 0;
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
    const point = state.points[entry.pointIndex < kept ? entry.pointIndex : entry.pointIndex + shift] as
      ScoredPoint | undefined;
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
  /** the match's initial server, set before anything was recorded (SE3-E1); kept on the history, not the timeline */
  initialServer?: 0 | 1;
  /** a legacy point-only record (§ 12.6 shape 2) keeps no `entries` */
  timeline: boolean;
  /** the record's points as loaded or as a non-recalculating correction left them, kept until the next rebuild */
  stored?: Point[];
};

export function materialize({
  base,
  state,
  entries,
  completedBy,
  lineUps,
  timeline,
  initialServer,
  stored = [],
}: Materialized): MatchUp {
  const placed = played(state, entries, completedBy, lineUps, stored.length);
  const { substitutions, endTime } = placed;
  // new input is added to the stored points, as calculated servers are re-derived only on a rebuild (§ 12.4)
  const points = stored.length ? [...stored, ...placed.points.slice(stored.length)] : placed.points;
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
    ...(initialServer === undefined ? {} : { initialServer }),
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
  if (previous || entries.length || points.length || initialServer !== undefined) recorded.history = history;
  return recorded;
}
