import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getRoundMatchUps } from '../matchUps/getRoundMatchUps';

// constants and types
import { DrawDefinition, MatchUp, Structure } from '@Types/tournamentTypes';

type IsLuckyArgs = {
  drawDefinition?: DrawDefinition;
  // Only inspects base MatchUp fields (`drawPositions`) so the looser type
  // is honest. The fallback `structure?.matchUps` is also `MatchUp[]`.
  matchUps?: MatchUp[];
  roundsNotPowerOf2?: boolean;
  structure?: Structure;
};

/**
 * Detect whether a structure contains "lucky rounds" — rounds where the matchUp count
 * transitions from odd to even, meaning one participant advances without playing.
 * This is the definitive test for a lucky-style structure, regardless of stage.
 */
export function hasLuckyRounds({ structure, matchUps }: { structure?: Structure; matchUps?: MatchUp[] }) {
  matchUps = matchUps ?? structure?.matchUps ?? [];
  const result = getRoundMatchUps({ matchUps });

  // If getRoundMatchUps fails validation, fall back to manual round grouping
  const roundProfile = result.roundProfile;
  const roundNumbers = result.roundNumbers;
  if (!roundProfile || !roundNumbers?.length || roundNumbers.length < 2) return false;

  const sorted = [...roundNumbers].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 1; i++) {
    const currentCount = roundProfile[sorted[i]]?.matchUpsCount ?? 0;
    const nextCount = roundProfile[sorted[i + 1]]?.matchUpsCount ?? 0;
    // A lucky round: odd matchUps followed by even (someone advances without playing)
    if (currentCount % 2 === 1 && nextCount % 2 === 0) return true;
  }
  return false;
}

export function isLucky({ roundsNotPowerOf2, drawDefinition, structure, matchUps }: IsLuckyArgs) {
  if (!structure) return false;

  matchUps = matchUps ?? structure.matchUps ?? [];
  roundsNotPowerOf2 = roundsNotPowerOf2 ?? getRoundMatchUps({ matchUps }).roundsNotPowerOf2;

  const hasDrawPositions =
    !!structure.positionAssignments?.find(({ drawPosition }) => drawPosition) ||
    !!matchUps?.find(({ drawPositions }) => drawPositions?.length);

  if (!hasDrawPositions || structure?.structures) return false;
  if (drawDefinition?.drawType && isLuckyBasedDraw(drawDefinition.drawType)) return false;
  if (!roundsNotPowerOf2) return false;

  // The definitive check: does the structure actually have lucky rounds?
  return hasLuckyRounds({ structure, matchUps });
}
