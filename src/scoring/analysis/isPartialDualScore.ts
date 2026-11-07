/**
 * A TEAM dual's score is the aggregate its lines produce (`sets`, from which the strings are derived). A score given to
 * a dual WITHOUT `sets` does not restate that aggregate: it carries a record about the result (`overtime`, how a level
 * tie was decided) or the strings alone. Laid over the dual's score it keeps the aggregate; swapped for it, it wiped the
 * aggregate as played (140-140 on a level INTENNSE tie decided by the host, measured on the published 7.32.0 in v1 and
 * v2 alike), and a set-less score then tallied as 0-0 games in v1 but 140-140 in v2.
 *
 * An empty score and an explicit clear (both strings `''`) are not partial: they still replace the score.
 */
export function isPartialDualScore(score?: unknown): boolean {
  if (!score || typeof score !== 'object' || Array.isArray(score)) return false;
  const given = score as Record<string, unknown>;
  const keys = Object.keys(given).filter((key) => given[key] !== undefined);
  if (!keys.length || keys.includes('sets')) return false;
  return !(given.scoreStringSide1 === '' && given.scoreStringSide2 === '');
}
