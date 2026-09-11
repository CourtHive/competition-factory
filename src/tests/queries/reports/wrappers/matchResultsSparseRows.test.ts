/**
 * `wrapMatchResultsReport` row shaping for matchUps that are COMPLETED but sparse.
 *
 * The wrapper builds every cell with a fallback — `?? ''`, `?? 0`, `R${roundNumber}`
 * — and the populated-tournament spec in `wrappers.test.ts` never reaches any of
 * them, because mocked tournaments hydrate participants, scores and round names for
 * every matchUp. The fallbacks exist for records that arrive from conversion or from
 * a draw whose positions were never assigned, so they are the arm that runs on the
 * least trustworthy data and the arm no spec was exercising.
 *
 * Two shapes matter and are covered here:
 *   - sides carrying a bare `participantId` (no hydrated `participant`)
 *   - sides carrying a nested `participant` object
 * The report resolves an id from either, which is what lets a consumer open the
 * participant behind a name.
 */
import { wrapMatchResultsReport } from '@Query/reports/wrappers/wrapMatchResultsReport';
import { describe, expect, it } from 'vitest';

// constants
import { MATCH_RESULTS_REPORT } from '@Constants/reportConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

const sparseTournament: any = {
  tournamentId: 'sparse-match-results',
  events: [
    {
      eventId: 'e1',
      eventName: 'Sparse',
      eventType: SINGLES_EVENT,
      drawDefinitions: [
        {
          drawId: 'd1',
          drawName: 'Sparse Draw',
          structures: [
            {
              structureId: 's1',
              stageSequence: 1,
              stage: MAIN,
              matchUps: [
                {
                  // ids only — no hydrated participant, no score, no roundName
                  matchUpId: 'ids-only',
                  matchUpStatus: COMPLETED,
                  roundNumber: 1,
                  roundPosition: 1,
                  winningSide: 1,
                  sides: [
                    { sideNumber: 1, participantId: 'p1' },
                    { sideNumber: 2, participantId: 'p2' },
                  ],
                },
                {
                  // nested participants, a score and an explicit roundName
                  matchUpId: 'nested-participants',
                  matchUpStatus: COMPLETED,
                  roundName: 'Named Round',
                  roundNumber: 1,
                  roundPosition: 2,
                  winningSide: 2,
                  score: { scoreStringSide1: '6-1 6-2' },
                  sides: [
                    { sideNumber: 1, participant: { participantId: 'p3', participantName: 'Player Three' } },
                    { sideNumber: 2, participant: { participantId: 'p4', participantName: 'Player Four' } },
                  ],
                },
                {
                  // no round ordering at all — exercises the sort fallbacks
                  matchUpId: 'unordered',
                  matchUpStatus: COMPLETED,
                  sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
                },
                {
                  // not completed — must not appear in the report
                  matchUpId: 'in-progress',
                  matchUpStatus: 'IN_PROGRESS',
                  roundNumber: 2,
                  roundPosition: 1,
                  sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('wrapMatchResultsReport — sparse completed matchUps', () => {
  const result: any = wrapMatchResultsReport({ tournamentRecord: sparseTournament });
  const rowFor = (matchUpId: string) => result.rows.find((row: any) => row.matchUpId === matchUpId);

  it('reports only completed matchUps', () => {
    expect(result.error).toBeUndefined();
    expect(result.reportId).toEqual(MATCH_RESULTS_REPORT);
    expect(result.rows.map((row: any) => row.matchUpId).sort()).toEqual([
      'ids-only',
      'nested-participants',
      'unordered',
    ]);
  });

  it('orders unordered matchUps first rather than throwing on missing round numbers', () => {
    expect(result.rows[0].matchUpId).toEqual('unordered');
  });

  it('resolves side ids from a bare participantId and falls back to empty strings', () => {
    const row = rowFor('ids-only');
    expect(row.side1ParticipantId).toEqual('p1');
    expect(row.side2ParticipantId).toEqual('p2');
    expect(row.winningParticipantId).toEqual('p1');
    // no hydrated participant, so no displayable names
    expect(row.side1).toEqual('');
    expect(row.side2).toEqual('');
    expect(row.winnerName).toEqual('');
    expect(row.score).toEqual('');
  });

  it('resolves side ids and names from a nested participant', () => {
    const row = rowFor('nested-participants');
    expect(row.side1ParticipantId).toEqual('p3');
    expect(row.side2ParticipantId).toEqual('p4');
    expect(row.winningParticipantId).toEqual('p4');
    expect(row.side1).toEqual('Player Three');
    expect(row.side2).toEqual('Player Four');
    expect(row.winnerName).toEqual('Player Four');
    expect(row.score).toEqual('6-1 6-2');
    expect(row.roundName).toEqual('Named Round');
  });

  it('synthesizes a roundName from roundNumber when none is present', () => {
    expect(rowFor('unordered').roundName).toEqual('R');
    expect(rowFor('ids-only').roundName).toBeTruthy();
  });

  it('leaves winningParticipantId empty when there is no winningSide', () => {
    expect(rowFor('unordered').winningParticipantId).toEqual('');
  });
});
