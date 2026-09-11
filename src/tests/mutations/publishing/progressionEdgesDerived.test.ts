import { applyProgressionEdges } from '@Query/readModel/progressionEdges';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { cast } from '@Query/readModel/cast';
import { describe, expect, it } from 'vitest';

/**
 * The edges are STORED on drawDefinition matchUps, but only for draws generated after
 * they were materialised. Older records — and TODS files not produced by the factory —
 * carry none, so a projection built from a plain flatten reported NULL and could not
 * distinguish "no loser feed" from "never recorded". Verified against a real prod
 * tournament (22 matchUps, 20 winner edges, 0 loser edges stored) before this landed.
 */
function seed(drawType: string) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: `edges-${drawType}` },
    drawProfiles: [{ drawSize: 16, drawType, eventName: 'Singles' }],
    startDate: '2025-01-01',
    endDate: '2025-01-14',
    nonRandom: 1,
  });
  return tournamentRecord;
}

/** Strip materialised edges to imitate an older record. */
function stripEdges(tournamentRecord: any) {
  for (const event of tournamentRecord.events ?? []) {
    for (const drawDefinition of event.drawDefinitions ?? []) {
      for (const structure of drawDefinition.structures ?? []) {
        for (const matchUp of structure.matchUps ?? []) {
          delete matchUp.loserMatchUpId;
          delete matchUp.winnerMatchUpId;
        }
      }
    }
  }
}

const counts = (rows: any[]) => ({
  winner: rows.filter((r) => r.winner_match_up_id).length,
  loser: rows.filter((r) => r.loser_match_up_id).length,
  total: rows.length,
});

describe('cast() derives progression edges rather than only reading stored ones', () => {
  it('recovers BOTH edges for a stripped consolation draw', () => {
    const record = seed('FIRST_ROUND_LOSER_CONSOLATION');
    const intact: any = cast({ tournamentRecord: record })?.rows;
    const before = counts(intact.match_ups);
    expect(before.loser).toBeGreaterThan(0); // the fixture must genuinely have feeds

    stripEdges(record);
    const recovered: any = cast({ tournamentRecord: record })?.rows;
    expect(counts(recovered.match_ups)).toEqual(before);
  });

  it('recovers edges for a COMPASS draw (many loser feeds)', () => {
    const record = seed('COMPASS');
    const before = counts((cast({ tournamentRecord: record })?.rows as any).match_ups);
    expect(before.loser).toBeGreaterThan(10);

    stripEdges(record);
    expect(counts((cast({ tournamentRecord: record })?.rows as any).match_ups)).toEqual(before);
  });

  it('invents no loser edges for a draw type that has no feed', () => {
    const record = seed('SINGLE_ELIMINATION');
    stripEdges(record);
    const rows: any = cast({ tournamentRecord: record })?.rows;
    const c = counts(rows.match_ups);
    expect(c.loser).toEqual(0);
    expect(c.winner).toBeGreaterThan(0); // winner edges still derived
  });

  it('leaves the tournamentRecord unmutated — cast() stays pure', () => {
    const record = seed('FIRST_ROUND_LOSER_CONSOLATION');
    stripEdges(record);
    const snapshot = JSON.stringify(record);
    cast({ tournamentRecord: record });
    expect(JSON.stringify(record)).toEqual(snapshot);
  });

  it('applyProgressionEdges prefers DERIVED over a stale stored edge', () => {
    const record = seed('FIRST_ROUND_LOSER_CONSOLATION');
    tournamentEngine.setState(record);
    const drawDefinition = record.events[0].drawDefinitions[0];
    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId: drawDefinition.drawId, inContext: true });
    const target = matchUps.find((m: any) => m.loserMatchUpId);
    expect(target).toBeDefined();
    const trueEdge = target.loserMatchUpId;

    target.loserMatchUpId = 'stale-pointer-to-a-deleted-matchUp';
    applyProgressionEdges({ drawDefinitions: [drawDefinition], matchUps });
    expect(target.loserMatchUpId).toEqual(trueEdge);
  });
});
