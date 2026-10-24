import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';
import { UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';

/**
 * THE IN-CONTEXT MATCHUP IS BUILT AFTER THE CALL SUCCEEDS, FOR A SUBSCRIBER ONLY (CA, 2026-10-24): *"even when
 * hydration is required for the subscriptions/notifications, it should happen AFTER the mutation succeeds so that it
 * NEVER happens when an ERROR is being returned."*
 *
 * `UPDATE_INCONTEXT_MATCHUP` carries a hydrated matchUp. `modifyMatchUpScore` built it mid-cascade, at each write, so a
 * call a later step refused had hydrated for a notice the engine then deleted. It is now built when the notices are
 * read (`globalState.getPayloads`), which the engine does only once a call has succeeded, and only for the matchUps
 * the call wrote. A build is counted here as a projection made from `getInContextMatchUp`.
 */
const counted = vi.hoisted(() => ({ builds: 0, refuse: false }));

vi.mock('@Query/matchUps/drawMatchUps', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getAllDrawMatchUps: (params: any) => {
      // the in-context notice's build only: another read of the same shape (the target's own lookup) is not it
      if (new Error().stack?.includes('getInContextMatchUp')) counted.builds += 1;
      return actual.getAllDrawMatchUps(params);
    },
  };
});

// a refusal after the write: the settle step after `setMatchUpState` (as `aLateRefusalIsCompared` plants it)
vi.mock('@Mutate/matchUps/matchUpStatus/reconcileDecider', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    reconcileDeciders: (args: any) =>
      counted.refuse ? { error: { code: 'ERR_PLANTED', message: 'planted' } } : actual.reconcileDeciders(args),
  };
});

// `setSubscriptions({})` leaves a subscription standing; a topic is unsubscribed by setting it to false
const unsubscribe = () => setSubscriptions({ subscriptions: { [UPDATE_INCONTEXT_MATCHUP]: false } });

afterEach(() => {
  Object.assign(counted, { builds: 0, refuse: false });
  unsubscribe();
  setOutcomePipeline();
});

function scoreFirstRound({ subscribe }: { subscribe: boolean }) {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, drawId: 'd' }], nonRandom: 1, setState: true });
  const delivered: any[] = [];
  // v1: the build this pins is v1's; a planted refusal under `differential` is a divergence, thrown, not returned
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  unsubscribe();
  if (subscribe)
    setSubscriptions({
      subscriptions: { [UPDATE_INCONTEXT_MATCHUP]: (payloads: any[]) => delivered.push(...payloads) },
    });
  const first = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true })
    .matchUps.find((matchUp: any) => matchUp.roundNumber === 1);
  counted.builds = 0;
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: first.matchUpId,
    outcome: { winningSide: 1 },
    drawId: 'd',
  });
  return { result, delivered, matchUpId: first.matchUpId };
}

describe(UPDATE_INCONTEXT_MATCHUP, () => {
  it('is built after success for a subscriber, once per matchUp written, as the call left it', () => {
    const { result, delivered, matchUpId } = scoreFirstRound({ subscribe: true });
    expect(result.success).toEqual(true);
    expect(delivered.length).toBeGreaterThan(0);
    // one build per matchUp the call wrote, not one per write
    expect(counted.builds).toEqual(delivered.length);
    const own = delivered.find((payload) => payload.inContextMatchUp?.matchUpId === matchUpId);
    expect(own.tournamentId).toBeDefined();
    expect(own.inContextMatchUp.winningSide).toEqual(1);
    // the deferred builder is not what a subscriber receives
    expect(Object.keys(own).sort()).toEqual(['inContextMatchUp', 'tournamentId']);
  });

  it('is never built when no one subscribes', () => {
    const { result } = scoreFirstRound({ subscribe: false });
    expect(result.success).toEqual(true);
    expect(counted.builds).toEqual(0);
  });

  it('is never built, nor sent, for a call refused after its write', () => {
    counted.refuse = true;
    const { result, delivered } = scoreFirstRound({ subscribe: true });
    expect(result.error?.code).toEqual('ERR_PLANTED');
    expect(delivered).toEqual([]);
    expect(counted.builds).toEqual(0);
  });
});
