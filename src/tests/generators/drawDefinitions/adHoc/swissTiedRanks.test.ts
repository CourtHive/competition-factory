import { computeScoreGroups } from '@Query/standings/swiss/computeScoreGroups';
import { computeTiebreakers } from '@Query/standings/swiss/computeTiebreakers';
import { describe, expect, it } from 'vitest';

// constants
import { BUCHHOLZ, SONNEBORN_BERGER } from '@Constants/swissConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * STANDINGS-102: records the comparison cannot separate share a rank, flagged `tied`; they used to take ranks i + 1
 * from whatever order the records arrived in, so the same results ranked differently when read in a different order.
 */
const matchUp = (matchUpId: string, winner: string, loser: string, roundNumber = 1) => ({
  sides: [{ participantId: winner }, { participantId: loser }],
  matchUpStatus: COMPLETED,
  winningSide: 1,
  roundNumber,
  matchUpId,
});
const ROUND_ONE = [matchUp('m1', 'P1', 'P2'), matchUp('m2', 'P3', 'P4')];

function ranks(participantIds: string[], matchUps: any[]) {
  const { records } = computeScoreGroups({ participantIds, matchUps });
  const standings = computeTiebreakers({ records, tiebreakMethods: [BUCHHOLZ, SONNEBORN_BERGER] });
  return {
    byParticipant: Object.fromEntries(standings.map(({ participantId, rank }) => [participantId, rank])),
    tied: Object.fromEntries(standings.map(({ participantId, tied }) => [participantId, !!tied])),
    order: standings.map(({ participantId }) => participantId),
  };
}

describe('Swiss tied ranks (STANDINGS-102)', () => {
  it('gives records nothing separates a shared rank, whatever the input order', () => {
    const forward = ranks(['P1', 'P2', 'P3', 'P4'], ROUND_ONE);
    const reversed = ranks(['P4', 'P3', 'P2', 'P1'], [...ROUND_ONE].reverse());

    expect(forward.byParticipant).toEqual({ P1: 1, P3: 1, P2: 3, P4: 3 });
    expect(reversed.byParticipant).toEqual(forward.byParticipant);
    expect(forward.tied).toEqual({ P1: true, P2: true, P3: true, P4: true });
    // display order is separate from rank, and deterministic among ties
    expect(reversed.order).toEqual(forward.order);
    expect(forward.order).toEqual(['P1', 'P3', 'P2', 'P4']);
  });

  it('keeps distinct ranks, untied, where a tiebreak separates', () => {
    // round 2: P1 beats P4, P2 beats P3; P2 and P3 on 1 point, separated by Buchholz (3 against 1)
    const matchUps = [...ROUND_ONE, matchUp('m3', 'P1', 'P4', 2), matchUp('m4', 'P2', 'P3', 2)];
    const forward = ranks(['P1', 'P2', 'P3', 'P4'], matchUps);
    const reversed = ranks(['P4', 'P3', 'P2', 'P1'], [...matchUps].reverse());
    expect(reversed.byParticipant).toEqual(forward.byParticipant);
    expect(forward.byParticipant).toEqual({ P1: 1, P2: 2, P3: 3, P4: 4 });
    expect(Object.values(forward.tied).some(Boolean)).toEqual(false);
  });
});
