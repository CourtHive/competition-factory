import { generateScoreString } from './generateScoreString';

export function matchUpScore(params) {
  const { matchUpFormat, matchUpStatus, winningSide, score, setTBlast } = params;
  if (!score) return { sets: [] };

  const sets = score.sets ?? [];

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

  return { score: { sets, scoreStringSide1, scoreStringSide2 } };
}
