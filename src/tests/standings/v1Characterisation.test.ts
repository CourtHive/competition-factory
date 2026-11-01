import { tallyParticipantResults as tallyParticipantResultsV1 } from './v1Reference/tallyParticipantResults';
import { runCase, separatorsOf } from './standingsFixtures';
import { describe, expect, it } from 'vitest';
import { V1_CORPUS } from './v1Corpus';

/**
 * Pins round-robin tally v1 exactly as built (Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 1) before the standings
 * engine is restructured. A failure here after a refactor is a behaviour change: either a bug in the refactor or a
 * ruled difference that must be recorded on the case, never an expectation edited to match.
 */
describe('standings v1 characterisation: the v1 record of every ruled change, against the frozen v1', () => {
  const ruled = V1_CORPUS.filter((corpusCase) => corpusCase.v1Rows);
  it.each(ruled.map((corpusCase) => [`${corpusCase.id} (${corpusCase.ruling})`, corpusCase] as const))(
    '%s',
    (_id, corpusCase) => {
      let result: any = runCase(corpusCase, tallyParticipantResultsV1 as any);
      const field = corpusCase.v1OrderField ?? corpusCase.orderField;
      for (const [participantId, row] of Object.entries(corpusCase.v1Rows ?? {})) {
        expect(result.participantResults[participantId][field], `${participantId} v1 ${field}`).toBe(row.order);
      }
    },
  );
});

describe('standings v1 characterisation', () => {
  it.each(V1_CORPUS.map((corpusCase) => [corpusCase.id, corpusCase] as const))('%s', (_id, corpusCase) => {
    let result: any = runCase(corpusCase);
    if (corpusCase.error) {
      expect(result.error?.code).toBe(corpusCase.error);
      return;
    }
    expect(result.error).toBeUndefined();
    const { participantResults, report } = result;
    const otherField = corpusCase.orderField === 'groupOrder' ? 'provisionalOrder' : 'groupOrder';

    for (const [participantId, results] of Object.entries<any>(participantResults)) {
      const row = corpusCase.rows[participantId];
      expect(results[otherField], `${participantId} ${otherField}`).toBeUndefined();
      if (!row) {
        expect(results[corpusCase.orderField], `${participantId} is unordered`).toBeUndefined();
        continue;
      }
      expect(results[corpusCase.orderField], `${participantId} ${corpusCase.orderField}`).toBe(row.order);
      expect(results.ties, `${participantId} ties`).toBe(row.ties);
      if (row.rankOrder !== undefined) expect(results.rankOrder, `${participantId} rankOrder`).toBe(row.rankOrder);
    }
    expect(Object.keys(participantResults).sort()).toEqual(expect.arrayContaining(Object.keys(corpusCase.rows)));

    for (const [participantId, totals] of Object.entries(corpusCase.totals ?? {})) {
      expect(participantResults[participantId], `${participantId} totals`).toMatchObject(totals);
    }
    if (corpusCase.separators) expect(separatorsOf(report)).toEqual(corpusCase.separators);
  });
});
