import { getLeanMatchUpDependencies } from '@Query/matchUps/getLeanMatchUpDependencies';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { canonicalJson } from '@Tools/canonicalJson';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { generatedDrawTypes } from '@Constants/drawDefinitionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * The lean graph is the hydrated graph: for every generated draw type, fresh and fully played, and for TEAM and
 * qualifying draws, `getLeanMatchUpDependencies` returns exactly the `matchUpDependencies` and `positionDependencies`
 * that `getMatchUpDependencies` returns when it hydrates the competition.
 */
const sizes: { [drawType: string]: number } = { LADDER: 8, PAGE_PLAYOFF: 8, ADAPTIVE: 8, SWISS: 8 };

function compare(tournamentRecord: any, drawIds?: string[]) {
  const tournamentRecords = { [tournamentRecord.tournamentId]: tournamentRecord };
  const hydrated = getMatchUpDependencies({ tournamentRecords, drawIds });
  const lean = getLeanMatchUpDependencies({ tournamentRecords, drawIds });
  expect(canonicalJson(lean.matchUpDependencies)).toEqual(canonicalJson(hydrated.matchUpDependencies));
  expect(canonicalJson(lean.positionDependencies)).toEqual(canonicalJson(hydrated.positionDependencies));
  return Object.keys(hydrated.matchUpDependencies ?? {}).length;
}

describe('the lean dependency graph is the hydrated one', () => {
  const generated: string[] = [];
  it.each(generatedDrawTypes)('%s, fresh and fully played', (drawType) => {
    for (const completeAllMatchUps of [false, true]) {
      let tournamentRecord: any;
      try {
        ({ tournamentRecord } = mocksEngine.generateTournamentRecord({
          drawProfiles: [{ drawType, drawSize: sizes[drawType] ?? 16 }],
          completeAllMatchUps,
          randomWinningSide: true,
        }));
      } catch {
        continue;
      }
      if (!tournamentRecord?.events?.[0]?.drawDefinitions?.length) continue;
      compare(tournamentRecord);
      generated.push(`${drawType}:${completeAllMatchUps}`);
    }
  });

  it('generated enough draw shapes to mean something', () => {
    expect(generated.length).toBeGreaterThanOrEqual(30);
  });

  it('TEAM draws, which the structural index does not cover, through their own hydration', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, eventType: TEAM_EVENT }, { drawSize: 16 }],
      completeAllMatchUps: true,
    });
    expect(compare(tournamentRecord)).toBeGreaterThan(0);
  });

  it('qualifying into main, and a subset of the draws named', () => {
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawSize: 16, qualifyingProfiles: [{ structureProfiles: [{ drawSize: 8, qualifyingPositions: 2 }] }] },
        { drawSize: 8, drawType: 'ROUND_ROBIN_WITH_PLAYOFF' },
      ],
    });
    compare(tournamentRecord);
    compare(tournamentRecord, [drawIds[0]]);
  });
});
