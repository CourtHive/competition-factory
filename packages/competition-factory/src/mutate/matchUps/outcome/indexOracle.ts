import { canonicalJson } from '@Tools/canonicalJson';

// constants and types
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * THE INDEX ORACLE (executor plan § 3.1.1; S2). Test-only, `differential` only: the structural index of the draw as the
 * call found it, against the call's full hydration of it, on every field the outcome logic reads (Mentat report
 * 2026-10-24 `outcome-v2-s2-structural-index-fields`). A difference is a field the index derives wrongly, found before
 * any reader moves onto it.
 */
const SIDE_FIELDS = ['sideNumber', 'participantId', 'bye', 'qualifier', 'drawPosition'] as const;
export const INDEX_FIELDS = [
  'matchUpStatus',
  'winningSide',
  'score',
  'sideExitProvenance',
  'winnerMatchUpId',
  'loserMatchUpId',
  'finishingPositionRange',
  'drawPositions',
  'roundNumber',
  'roundPosition',
  'collectionId',
  'collectionPosition',
  'matchUpType',
  'matchUpFormat',
  'structureId',
  'containerStructureId',
  'matchUpTieId',
  'feedRound',
  'hasFedDrawPosition',
] as const;

type Json = Record<string, unknown>;
export type IndexComparison =
  { equal: true } | { equal: false; field: string; matchUpId: string; index: string; hydrated: string };

const canonical = (value: unknown) => (value === undefined ? 'absent' : canonicalJson(value));
const shown = (value: unknown) => (value === undefined ? 'absent' : JSON.stringify(value)?.slice(0, 160));

function sidesOf(matchUp: HydratedMatchUp | undefined) {
  return (matchUp?.sides ?? []).map((side) => ({
    ...Object.fromEntries(SIDE_FIELDS.map((field) => [field, (side as unknown as Json)?.[field]])),
    participant: !!side?.participant,
  }));
}

/** every hydrated matchUp against its index entry: every difference, field by field */
export function compareIndex({
  hydrated,
  index,
}: {
  hydrated: HydratedMatchUp[];
  index: HydratedMatchUp[];
}): IndexComparison[] {
  const differences: IndexComparison[] = [];
  const indexById = new Map(index.map((matchUp) => [matchUp.matchUpId, matchUp]));
  if (index.length !== hydrated.length)
    differences.push({
      equal: false,
      field: '(count)',
      matchUpId: '',
      index: String(index.length),
      hydrated: String(hydrated.length),
    });
  for (const matchUp of hydrated) {
    const entry = indexById.get(matchUp.matchUpId);
    const pairs: [string, unknown, unknown][] = [
      ['sides', sidesOf(entry), sidesOf(matchUp)],
      ...INDEX_FIELDS.map(
        (field) =>
          [field, (entry as unknown as Json | undefined)?.[field], (matchUp as unknown as Json)[field]] as [
            string,
            unknown,
            unknown,
          ],
      ),
    ];
    for (const [field, a, b] of pairs)
      if (canonical(a) !== canonical(b))
        differences.push({ equal: false, field, matchUpId: matchUp.matchUpId, index: shown(a), hydrated: shown(b) });
    // a TEAM dual's lines as it carries them (S7): the projection and the dual's tally read them there
    if (matchUp.tieMatchUps)
      differences.push(
        ...compareIndex({
          hydrated: matchUp.tieMatchUps as HydratedMatchUp[],
          index: (entry?.tieMatchUps ?? []) as HydratedMatchUp[],
        }).map((difference) =>
          difference.equal ? difference : { ...difference, field: `tieMatchUps.${difference.field}` },
        ),
      );
  }
  return differences;
}
