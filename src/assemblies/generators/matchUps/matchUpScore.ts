import { formatForSet, withPointsInTiebreakFields } from '@Query/matchUp/tiebreakSetShape';
import { generateScoreString } from './generateScoreString';
import { parse } from '@Helpers/matchUpFormatCode/parse';

export function matchUpScore(params) {
  const { matchUpFormat, matchUpStatus, winningSide, score, setTBlast } = params;
  if (!score) return { sets: [] };

  // The write path canonicalises a tiebreak-only set: its points live in the tiebreak fields. A set that
  // arrived with them in the game fields was stored that way, printed `[10-8]` here, and then hydrated to
  // `1-0` with the points gone (G3, 2026-10-02). The format is parsed only when there are sets to read.
  const parsedFormat = score.sets?.length && matchUpFormat ? parse(matchUpFormat) : undefined;
  const sets = (score.sets ?? []).map((set) =>
    withPointsInTiebreakFields(set, formatForSet(parsedFormat, set?.setNumber)),
  );

  let scoreStringSide1 = generateScoreString({
    winnerFirst: false,
    matchUpFormat,
    matchUpStatus,
    setTBlast,
    sets,
  });

  let scoreStringSide2 = generateScoreString({
    winnerFirst: false,
    reversed: true,
    matchUpFormat,
    matchUpStatus,
    setTBlast,
    sets,
  });

  const winnerPerspective = generateScoreString({
    matchUpFormat,
    matchUpStatus,
    winningSide,
    setTBlast,
    sets,
  });

  const loserPerspective = scoreStringSide1 === winnerPerspective ? scoreStringSide2 : scoreStringSide1;

  if (winningSide) {
    scoreStringSide1 = winningSide === 1 ? winnerPerspective : loserPerspective;
    scoreStringSide2 = winningSide === 2 ? winnerPerspective : loserPerspective;
  }

  // DECISION: carry forward every non-derived attribute of the incoming score
  // WHY: only sets and the two score strings are derived here. Returning just those three made the
  // returned object look like a complete score while silently dropping anything else the caller had
  // set — e.g. score.side1PointScore on an in-progress matchUp — so a caller assigning the result
  // over its own score lost data. Spreading keeps `score` in, `score` out. See competition-factory#4564.
  return { score: { ...score, sets, scoreStringSide1, scoreStringSide2 } };
}
