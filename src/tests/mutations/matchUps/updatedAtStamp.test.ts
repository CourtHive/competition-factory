import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, it, expect } from 'vitest';

import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * End-to-end coverage for `matchUp.updatedAt` — the field is declared
 * on the MatchUp type but was never written prior to this change.
 * These tests prove the stamp lands on the canonical matchUp via the
 * real mutation path (`setMatchUpStatus` → `modifyMatchUpScore` →
 * `modifyMatchUpNotice`) and survives hydration
 * (`allTournamentMatchUps`).
 */

function generateOutcome(scoreString: string, winningSide: 1 | 2) {
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString,
    winningSide,
  });
  return outcome;
}

describe('matchUp.updatedAt — stamped on every mutation', () => {
  it('setMatchUpStatus writes a valid ISO updatedAt on the canonical matchUp', () => {
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
    });
    tournamentEngine.setState(tournamentRecord);
    const drawId = drawIds[0];

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const target = matchUps.find((m: any) => m.roundNumber === 1 && m.roundPosition === 1);
    expect(target).toBeDefined();

    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: target!.matchUpId,
      outcome: generateOutcome('6-0 6-0', 1),
      drawId,
    });
    expect(result.success).toBe(true);

    const { matchUps: after } = tournamentEngine.allTournamentMatchUps();
    const updated = after.find((m: any) => m.matchUpId === target!.matchUpId);
    expect(updated).toBeDefined();
    expect(typeof updated.updatedAt).toBe('string');
    expect(Number.isNaN(new Date(updated.updatedAt).getTime())).toBe(false);
  });

  it('each of two distinct matchUp mutations stamps an ordered pair of timestamps', () => {
    // Two sibling matchUps mutated in sequence. We expect both to pick
    // up `updatedAt`, and the second write's timestamp to be >= the
    // first (equal when both land in the same millisecond — monotonic
    // behaviour within a single matchUp is covered by the isolated
    // notice tests).
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
    });
    tournamentEngine.setState(tournamentRecord);
    const drawId = drawIds[0];

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const first = matchUps.find((m: any) => m.roundNumber === 1 && m.roundPosition === 1);
    const second = matchUps.find((m: any) => m.roundNumber === 1 && m.roundPosition === 2);
    expect(first && second).toBeTruthy();

    tournamentEngine.setMatchUpStatus({
      matchUpId: first!.matchUpId,
      outcome: generateOutcome('6-0 6-0', 1),
      drawId,
    });
    tournamentEngine.setMatchUpStatus({
      matchUpId: second!.matchUpId,
      outcome: generateOutcome('6-1 6-1', 1),
      drawId,
    });

    const after = tournamentEngine.allTournamentMatchUps().matchUps;
    const firstAfter = after.find((m: any) => m.matchUpId === first!.matchUpId);
    const secondAfter = after.find((m: any) => m.matchUpId === second!.matchUpId);

    expect(typeof firstAfter.updatedAt).toBe('string');
    expect(typeof secondAfter.updatedAt).toBe('string');
    expect(new Date(secondAfter.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(firstAfter.updatedAt).getTime(),
    );
  });

  it('updatedAt flows through hydration (tournamentMatchUps view)', () => {
    // Mutations write to canonical matchUp state; addMatchUpContext
    // deep-copies the matchUp into the hydrated row, so updatedAt must
    // be present on the hydrated view.
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
    });
    tournamentEngine.setState(tournamentRecord);
    const drawId = drawIds[0];
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const target = matchUps[0];

    tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      outcome: generateOutcome('6-1 6-1', 1),
      drawId,
    });

    const hydrated = tournamentEngine
      .allTournamentMatchUps()
      .matchUps.find((m: any) => m.matchUpId === target.matchUpId);
    expect(typeof hydrated.updatedAt).toBe('string');
    expect(Number.isNaN(new Date(hydrated.updatedAt).getTime())).toBe(false);
  });
});
