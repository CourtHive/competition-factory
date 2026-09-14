import { generateScoreString } from '@Assemblies/generators/matchUps/generateScoreString';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';

// Fixtures
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';

function generateSetScores(setValues) {
  return setValues.map(([side1Score, side2Score, side1TiebreakScore, side2TiebreakScore], index) => {
    return {
      side1Score,
      side2Score,
      side1TiebreakScore,
      side2TiebreakScore,
      setNumber: index + 1,
    };
  });
}

type GenerateMatchUpOutcomeArgs = {
  matchUpFormat?: string;
  setValues: any[];
};

export function generateMatchUpOutcome({
  matchUpFormat = FORMAT_STANDARD,
  setValues,
}: GenerateMatchUpOutcomeArgs): any {
  const generatedSets = generateSetScores(setValues);
  const sets = generatedSets.map((set) => {
    const { setNumber } = set;
    const { winningSide } = analyzeMatchUp({
      matchUp: {
        score: { sets: generatedSets },
        matchUpFormat,
      },
      setNumber,
    });
    return Object.assign(set, { winningSide });
  });
  const analysis = analyzeMatchUp({
    matchUp: { score: { sets }, matchUpFormat },
  });
  const { calculatedWinningSide: winningSide } = analysis;
  let scoreStringSide1;
  let scoreStringSide2;
  const outcome = {
    matchUpFormat,
    sets,
  };
  const winnerPerspective = generateScoreString(outcome);
  const loserPerspective = generateScoreString({
    ...outcome,
    reversed: true,
  });
  if (winningSide) {
    scoreStringSide1 = winningSide === 1 ? winnerPerspective : loserPerspective;
    scoreStringSide2 = winningSide === 1 ? loserPerspective : winnerPerspective;
  } else {
    scoreStringSide1 = winnerPerspective;
    scoreStringSide2 = loserPerspective;
  }
  const score = {
    sets,
    scoreStringSide1,
    scoreStringSide2,
  };
  Object.assign(outcome, { score, winningSide });
  return outcome;
}
