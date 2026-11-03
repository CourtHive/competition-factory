import { createContext, initialState, reduce } from '@Assemblies/engines/scoring/v2/reduce';
import type { ScoredSet, ScoringState } from '@Assemblies/engines/scoring/v2/types';
import { segmentClosed } from '@Helpers/matchUpFormatCode/overtimeContext';
import { scoreOf } from '@Assemblies/engines/scoring/v2/score';
import type { MatchUp } from '@Types/scoring/types';

/** Read the stored score, not a replay that could overwrite a deliberately unrecalculated correction. */
export function overtimeScore(matchUp: MatchUp) {
  const context = createContext({ matchUpFormat: matchUp.matchUpFormat }, { allowOvertime: true });
  const sets = matchUp.score.sets.map((set) => ({
    ...set,
    side1Score: set.side1Score ?? 0,
    side2Score: set.side2Score ?? 0,
  })) as ScoredSet[];
  const last = sets.at(-1);
  const open = last && !segmentClosed(last);
  let scores: [number, number] | undefined;
  if (open)
    scores = last.isTiebreakOnly
      ? [last.side1GameScores?.at(-1) ?? last.side1Score, last.side2GameScores?.at(-1) ?? last.side2Score]
      : [last.side1Score, last.side2Score];
  const initialServer = matchUp.history?.initialServer;
  const entries = (matchUp.history?.entries ?? []).map((entry) => ({ ...entry }));
  if (initialServer !== undefined) entries.unshift({ type: 'setServer', data: { side: initialServer }, timestamp: '' });
  // Replay service orientation and the actual rally count, without replacing the stored score totals.
  const replayed = reduce({ matchUpFormat: matchUp.matchUpFormat }, entries, { allowOvertime: true }).state;
  const state: ScoringState = {
    ...initialState(),
    service: replayed.service,
    sets,
    matchUpStatus: matchUp.matchUpStatus as ReturnType<typeof initialState>['matchUpStatus'],
    ...(matchUp.winningSide === 1 || matchUp.winningSide === 2 ? { winningSide: matchUp.winningSide } : {}),
    ...(scores ? { game: { score: scores, pointsPlayed: replayed.game?.pointsPlayed ?? scores[0] + scores[1] } } : {}),
  };
  return scoreOf(context, state, matchUp.score.sets);
}
