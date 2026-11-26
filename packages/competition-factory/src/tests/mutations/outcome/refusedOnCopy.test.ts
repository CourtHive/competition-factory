import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { captureNotices } from '../notifications/noticeConformance/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  COMPASS,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
} from '@Constants/drawDefinitionConstants';

/**
 * STEP 4 (CA, 2026-11-26): A CALL V1 REFUSES ON THE RECORDER'S COPY IS REFUSED, NOT RUN AGAIN ON THE STORED RECORD.
 *
 * Under `v2` and `differential` a call the planners do not write is recorded whole: v1 runs on a copy. Where that run
 * returned an error the recording was dropped and v1 ran again on the stored record, writing before it refused: the
 * late refusals of the TEAM correction and award paths (removal, line replacement, retally and placement). The copy's
 * refusal is now the answer: the record, its stamps and the notice stream are as they were, v1 runs once, and the
 * material refusal is the one v1 returns. Under `v1` nothing is recorded, and the call is as it was (the v1 residuals
 * stay pinned in `cascadeWriteErrorsReachTheCaller.test.ts`).
 *
 * The failures are forced (`modifyMatchUpScore`, by the context each site names): nothing in ordinary play makes these
 * writes fail. The shapes are the TEAM calls v2 records rather than plans (a line corrected under an FMLC dual, and a
 * dual award corrected); the calls v2 plans natively write through ops and never reach these sites under `v2`.
 */

const forced = vi.hoisted(() => ({ context: undefined as string | undefined, hits: 0 }));
const FORCED_ERROR = { code: 'ERR_FORCED', message: 'forced by the test' };
vi.mock('@Mutate/matchUps/score/modifyMatchUpScore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    modifyMatchUpScore: (params: any) => {
      if (forced.context && params?.context === forced.context) {
        forced.hits += 1;
        return { error: FORCED_ERROR };
      }
      return actual.modifyMatchUpScore(params);
    },
  };
});

beforeEach(() => {
  forced.context = undefined;
  forced.hits = 0;
});
afterEach(() => {
  setOutcomePipeline();
  setSubscriptions({});
});

const record = () => JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
const matchUps = (drawId: string) => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;

type Shape = 'line correction' | 'award correction';

/** the call to fail, after the setup that makes it a correction */
function prepare(drawType: string, shape: Shape) {
  const drawId = 'refused-on-copy';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType, drawSize: 8, eventType: TEAM, tieFormatName: DOMINANT_DUO }],
    nonRandom: 300001,
    setState: true,
  });
  expect(tournamentEngine.generateLineUps({ drawId, useDefaultEventRanking: true, attach: true }).success).toEqual(
    true,
  );
  const dual = matchUps(drawId).find((m) => !m.collectionId && m.roundNumber === 1 && m.roundPosition === 1);
  if (shape === 'award correction') {
    const awarded = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1 },
      matchUpId: dual.matchUpId,
      drawId,
    });
    expect(awarded.success).toBe(true);
    return { drawId, matchUpId: dual.matchUpId, outcome: { matchUpStatus: 'RETIRED', winningSide: 2 } };
  }
  const lines = matchUps(drawId).filter((m) => m.matchUpTieId === dual.matchUpId);
  for (const line of lines)
    expect(
      tournamentEngine.setMatchUpStatus({ matchUpId: line.matchUpId, outcome: { winningSide: 1 }, drawId }).success,
    ).toBe(true);
  return { drawId, matchUpId: lines[0].matchUpId, outcome: { winningSide: 2 } };
}

const CASES: { drawType: string; shape: Shape; context: string }[] = [
  // the dual's retally after the line is removed and replaced
  { drawType: FIRST_MATCH_LOSER_CONSOLATION, shape: 'line correction', context: 'updateTieMatchUpScore' },
  // the replacement line's score writer after the removal
  { drawType: FIRST_MATCH_LOSER_CONSOLATION, shape: 'line correction', context: 'attemptToModifyScore' },
  { drawType: FIRST_MATCH_LOSER_CONSOLATION, shape: 'line correction', context: 'removeDirectedParticipants' },
  // the award's removal of what the dual directed, then its replacement result
  ...[FIRST_MATCH_LOSER_CONSOLATION, FEED_IN_CHAMPIONSHIP, DOUBLE_ELIMINATION, COMPASS].flatMap((drawType) =>
    ['removeDirectedParticipants', 'attemptToModifyScore'].map((context) => ({
      shape: 'award correction' as Shape,
      drawType,
      context,
    })),
  ),
];

describe('a refusal on the copy is the answer, with nothing written', () => {
  for (const { drawType, shape, context } of CASES) {
    for (const mode of ['v2', 'differential'] as const) {
      it(`${drawType} ${shape}, ${context} fails: ${mode}`, () => {
        setOutcomePipeline(mode);
        const { drawId, matchUpId, outcome } = prepare(drawType, shape);
        const before = record();
        forced.context = context;
        let result: any;
        const notices = captureNotices(() => {
          result = tournamentEngine.setMatchUpStatus({ matchUpId, outcome, drawId });
        });
        expect(result?.error?.code).toEqual(FORCED_ERROR.code);
        // once, on the copy: v1 is not run again on the stored record
        expect(forced.hits).toBeGreaterThan(0);
        const copyHits = forced.hits;
        expect(notices).toEqual([]);
        expect(record()).toBe(before);

        // the material refusal is v1's own: v1 alone, rolled back, returns the same
        forced.context = undefined;
        setOutcomePipeline('v1');
        const reference = prepare(drawType, shape);
        forced.context = context;
        forced.hits = 0;
        const { stack, ...v1 }: any = tournamentEngine.setMatchUpStatus({ ...reference, rollbackOnError: true });
        expect(Array.isArray(stack)).toBe(true);
        expect(forced.hits).toEqual(copyHits);
        const { stack: candidateStack, ...candidate } = result;
        expect(Array.isArray(candidateStack)).toBe(true);
        expect(JSON.stringify(candidate)).toBe(JSON.stringify(v1));
      });
    }
  }
});
