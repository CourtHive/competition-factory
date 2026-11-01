import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants and types
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import type { PolicyDefinitions } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * One result in a corpus case. Participants are single letters ('A', 'B', ...): the letter is the participantId and
 * its alphabet index + 1 is the drawPosition. `score` is a score string read in `format` from SIDE 1's view (the
 * corpus reads as a results sheet; the mocks generator reads from the winner's view, so it is flipped); `sets` gives the sets
 * directly (a drawn combined-point result has no score string). Omit both, with no winner, for an unplayed matchUp.
 */
export type CorpusResult = {
  sides: [string, string];
  score?: string;
  sets?: [number, number][];
  winningSide?: 1 | 2;
  matchUpStatus?: MatchUpStatusUnion;
};

export type CorpusRow = { order: number; ties?: number; rankOrder?: number };

/**
 * A v1 characterisation case: the spec clauses it pins, its inputs, and the rows v1 produces. The same data is the
 * conformance input for v2 (spec § 5.8): `fromV1(policy)` over the same results must give the same rows unless the
 * case is listed as a ruled difference.
 */
export type CorpusCase = {
  id: string;
  clauses: string[];
  description: string;
  format?: string;
  policyDefinitions?: PolicyDefinitions;
  subOrderMap?: Record<string, number>;
  perPlayer?: number;
  results: CorpusResult[];
  /** which order field v1 writes: `groupOrder` when complete, `provisionalOrder` otherwise */
  orderField: 'groupOrder' | 'provisionalOrder';
  /** participants absent from `rows` must carry neither order field */
  rows: Record<string, CorpusRow>;
  /** the attributes that split a set, in the order the report records them (head-to-head reads `head2Head`) */
  separators?: string[];
  /** v1 refuses the calculation with this error code instead of ordering */
  error?: string;
  /** ledger values to pin, per participant */
  totals?: Record<string, Record<string, number>>;
};

const DEFAULT_FORMAT = 'SET3-S:6/TB7';

let template: HydratedMatchUp | undefined;
function getTemplate(): HydratedMatchUp {
  if (!template) {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN }],
      setState: false,
    });
    tournamentEngine.setState(tournamentRecord);
    template = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps[0];
  }
  return template as HydratedMatchUp;
}

const position = (letter: string) => letter.charCodeAt(0) - 64;

export function buildMatchUps({ results, format = DEFAULT_FORMAT }: Pick<CorpusCase, 'results' | 'format'>) {
  const base = getTemplate();
  return results.map((result, index): HydratedMatchUp => {
    const { sides, winningSide, score: scoreString, sets } = result;
    const played = !!(winningSide || sets || scoreString);
    const matchUpStatus = result.matchUpStatus ?? (played ? COMPLETED : TO_BE_PLAYED);
    let score: HydratedMatchUp['score'] = {};
    if (sets) {
      score = {
        sets: sets.map(([side1Score, side2Score], i) => ({ setNumber: i + 1, side1Score, side2Score, winningSide })),
      };
    } else if (scoreString) {
      const winnerView = winningSide === 2 ? scoreString.replaceAll(/(\d+)-(\d+)/g, '$2-$1') : scoreString;
      score = mocksEngine.generateOutcomeFromScoreString({
        scoreString: winnerView,
        matchUpFormat: format,
        winningSide,
      }).outcome.score;
    }
    return {
      ...structuredClone(base),
      matchUpId: `m${index + 1}-${sides.join('')}`,
      matchUpFormat: format,
      drawPositions: [position(sides[0]), position(sides[1])],
      sides: [
        { ...base.sides?.[0], sideNumber: 1, participantId: sides[0] },
        { ...base.sides?.[1], sideNumber: 2, participantId: sides[1] },
      ],
      matchUpStatus,
      winningSide,
      score,
    };
  });
}

export function runCase(corpusCase: CorpusCase) {
  const matchUps = buildMatchUps(corpusCase);
  return tallyParticipantResults({
    policyDefinitions: corpusCase.policyDefinitions,
    subOrderMap: corpusCase.subOrderMap,
    perPlayer: corpusCase.perPlayer,
    matchUpFormat: corpusCase.format ?? DEFAULT_FORMAT,
    matchUps,
  });
}

/** the attributes, in report order, whose step split the set it was given */
export function separatorsOf(report: any[] = []) {
  return report
    .filter((entry) => entry?.attribute === 'head2Head' || (entry?.groups && Object.keys(entry.groups).length > 1))
    .map((entry) => entry.attribute);
}
