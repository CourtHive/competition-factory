import { describe, expect, it } from 'vitest';

import { setSchemaWriteMode } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants and types
import { NATIVE } from '@Constants/schemaWriteModeConstants';

const ISO_A = '2026-05-27T13:58:42.000Z';
const ISO_B = '2026-05-27T14:05:00.000Z';

function seedTournament() {
  const result = mocksEngine.generateTournamentRecord({
    inContext: true,
    setState: true,
    drawProfiles: [{ participantsCount: 8, drawSize: 8 }],
  });
  const drawId = result.drawIds[0];
  const eventId = result.eventIds[0];
  const matchUpId = result.tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0].matchUpId;
  return { drawId, eventId, matchUpId };
}

describe('setMatchUpCalledAt — matchUp.schedule.calledAt mutation', () => {
  it('sets calledAt to an ISO string when none was present', () => {
    const { drawId, matchUpId } = seedTournament();

    const result: any = tournamentEngine.setMatchUpCalledAt({ drawId, matchUpId, calledAt: ISO_A });
    expect(result.success).toEqual(true);

    const { matchUp } = tournamentEngine.findMatchUp({ matchUpId });
    expect(matchUp?.schedule?.calledAt).toEqual(ISO_A);
  });

  it('overwrites a prior calledAt on a second call', () => {
    const { drawId, matchUpId } = seedTournament();

    tournamentEngine.setMatchUpCalledAt({ drawId, matchUpId, calledAt: ISO_A });
    tournamentEngine.setMatchUpCalledAt({ drawId, matchUpId, calledAt: ISO_B });

    const { matchUp } = tournamentEngine.findMatchUp({ matchUpId });
    expect(matchUp?.schedule?.calledAt).toEqual(ISO_B);
  });

  it('clears calledAt when called with null', () => {
    const { drawId, matchUpId } = seedTournament();

    tournamentEngine.setMatchUpCalledAt({ drawId, matchUpId, calledAt: ISO_A });
    const clearResult: any = tournamentEngine.setMatchUpCalledAt({ drawId, matchUpId, calledAt: null });
    expect(clearResult.success).toEqual(true);

    const { matchUp } = tournamentEngine.findMatchUp({ matchUpId });
    expect(matchUp?.schedule?.calledAt).toBeUndefined();
  });

  it('clears calledAt when called with undefined', () => {
    const { drawId, matchUpId } = seedTournament();

    tournamentEngine.setMatchUpCalledAt({ drawId, matchUpId, calledAt: ISO_A });
    tournamentEngine.setMatchUpCalledAt({ drawId, matchUpId, calledAt: undefined });

    const { matchUp } = tournamentEngine.findMatchUp({ matchUpId });
    expect(matchUp?.schedule?.calledAt).toBeUndefined();
  });

  it('preserves coexisting schedule attributes (scheduledTime) when set', () => {
    // Pin NATIVE so addMatchUpScheduledTime writes the first-class attribute
    // (the vitest setupFile defaults to LEGACY, which would route it to a
    // timeItem instead). The point of this test is to verify schedule-object
    // isolation, which only makes sense when both writes are first-class.
    setSchemaWriteMode(NATIVE);
    const { drawId, matchUpId } = seedTournament();

    tournamentEngine.addMatchUpScheduledTime({ drawId, matchUpId, scheduledTime: '14:00' });
    tournamentEngine.setMatchUpCalledAt({ drawId, matchUpId, calledAt: ISO_A });

    const { matchUp } = tournamentEngine.findMatchUp({ matchUpId });
    expect(matchUp?.schedule?.calledAt).toEqual(ISO_A);
    expect(matchUp?.schedule?.scheduledTime).toEqual('14:00');
  });

  it('returns MATCHUP_NOT_FOUND when the matchUpId does not exist', () => {
    const { drawId } = seedTournament();
    const result: any = tournamentEngine.setMatchUpCalledAt({
      drawId,
      matchUpId: 'no-such-matchUp',
      calledAt: ISO_A,
    });
    expect(result.error).toBeDefined();
  });

  it('rejects non-string calledAt values', () => {
    const { drawId, matchUpId } = seedTournament();
    const result: any = tournamentEngine.setMatchUpCalledAt({ drawId, matchUpId, calledAt: 12345 as any });
    expect(result.error).toBeDefined();
  });
});
