import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and types
import * as topicConstants from '@Constants/topicConstants';

/**
 * RUNTIME notice-identity conformance.
 *
 * `topicPayloadConformance.test.ts` already checks that every REQUIRED field the map declares is
 * emitted. It could not catch the three identity bugs fixed in 6.28.0/6.28.1, for two independent
 * reasons worth stating so this guard is not "improved" back into the same blindness:
 *
 *   1. every `NoticeIdentity` field is declared OPTIONAL, so a required-field check never looks at it
 *   2. it extracts payload keys STATICALLY. `structureId,` was written at the callsite while being
 *      `undefined` at runtime — no static guard can see "declared but unpopulated"
 *
 * So this one runs real mutations and inspects what subscribers actually receive.
 *
 * DESIGN: assert DOMAIN INVARIANTS, not a per-topic table of expected fields. A hand-maintained table
 * rots exactly like the map it would be guarding — which is the failure class this whole area keeps
 * reproducing. These two invariants are true of the data model, so a topic added next year is covered
 * on arrival with nothing to remember:
 *
 *   - a notice carrying a DRAW grain must carry `eventId`      (a draw belongs to exactly one event)
 *   - a notice carrying a `matchUp` must carry `structureId`   (a matchUp lives in exactly one structure)
 */

/**
 * PHASE MATTERS, and pretending otherwise would make this guard unshippable.
 *
 * On the MUTATION path (scoring, advancement, publishing) an unattributable notice has a measured
 * cost: CFS cannot narrow its cache eviction and sweeps a whole tier. That path is asserted strictly.
 *
 * During draw GENERATION the notice chain runs through helpers that never accepted an `event`
 * (`attachPolicies`, `setMatchUpMatchUpFormat`, and their callers). Threading it through all of them
 * is a real but separate piece of work, and the payoff is small: generating a draw changes the whole
 * event's payload anyway, so a consumer sweeping the event tier there is CORRECT, not degraded.
 *
 * So generation-phase gaps are recorded in a ledger rather than ignored. Exact-match, deliberately:
 * a NEW topic joining the list fails, and FIXING one also fails — which forces the ledger to stay
 * true instead of quietly over-stating what is broken.
 */
const GENERATION_KNOWN_GAPS: Record<string, string> = {
  // reached via drawDefinitionPolicyAttachment -> attachPolicies, and
  // checkFormatScopeEquivalence -> setMatchUpMatchUpFormat; neither helper takes an `event`
  [topicConstants.MODIFY_DRAW_DEFINITION]: 'policy/format helpers in the generation chain take no event',
  // emitted while the draw is still being built, before it is attached to an event
  [topicConstants.ADD_DRAW_DEFINITION]: 'draw not yet attached to an event when emitted',
};

function hasDrawGrain(p: any) {
  return !!(p?.drawId || p?.drawDefinition || p?.matchUp);
}

/** Run a battery of mutations and collect every notice emitted, tagged with its topic and phase. */
function collectNotices(drawType: string) {
  let phase: 'GENERATION' | 'MUTATION' = 'GENERATION';
  const captured: { topic: string; payload: any; phase: string }[] = [];
  const subscriptions: any = {};
  for (const topic of Object.values(topicConstants)) {
    if (typeof topic !== 'string') continue;
    subscriptions[topic] = (params: any[]) =>
      (params ?? []).forEach((payload: any) => captured.push({ topic, payload, phase }));
  }
  setSubscriptions({ subscriptions });

  const {
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType }],
    participantsProfile: { nonRandom: 1 },
    setState: true,
  });

  phase = 'MUTATION';

  // Play the draw OUT. The identity gaps were in ADVANCEMENT, not in the first score — a single-score
  // test passes straight through two of the three bugs this guard exists for.
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-4 6-2',
    matchUpStatus: 'COMPLETED',
    winningSide: 1,
  });
  let scored = 0;
  for (let pass = 0; pass < 14; pass++) {
    const all: any[] = tournamentEngine.allTournamentMatchUps().matchUps ?? [];
    const next = all.filter(
      (m: any) => !m.winningSide && (m.sides ?? []).filter((s: any) => s?.participantId).length === 2,
    );
    if (!next.length) break;
    for (const m of next) {
      if (tournamentEngine.setMatchUpStatus({ matchUpId: m.matchUpId, drawId, outcome }).success) scored += 1;
    }
  }
  tournamentEngine.publishEvent({ eventId });

  setSubscriptions({ subscriptions: {} });
  return { captured, scored };
}

const DRAW_TYPES = [
  'SINGLE_ELIMINATION',
  'COMPASS',
  'ROUND_ROBIN',
  'FIRST_MATCH_LOSER_CONSOLATION',
  'ROUND_ROBIN_WITH_PLAYOFF',
  'FEED_IN_CHAMPIONSHIP',
];

describe('notice identity — runtime conformance', () => {
  it.each(DRAW_TYPES)('%s — every MUTATION-path draw-grain notice carries an eventId', (drawType) => {
    const { captured, scored } = collectNotices(drawType);
    expect(scored).toBeGreaterThan(0); // the coverage claim rests on real mutations having run
    expect(captured.length).toBeGreaterThan(10);

    const violations = captured
      .filter(({ payload, phase }) => phase === 'MUTATION' && hasDrawGrain(payload) && !payload.eventId)
      .map(({ topic }) => topic);

    expect({ [drawType]: [...new Set(violations)] }).toEqual({ [drawType]: [] });
  });

  it.each(DRAW_TYPES)('%s — generation-phase gaps match the ledger exactly', (drawType) => {
    const { captured } = collectNotices(drawType);

    const observed = [
      ...new Set(
        captured
          .filter(({ payload, phase }) => phase === 'GENERATION' && hasDrawGrain(payload) && !payload.eventId)
          .map(({ topic }) => topic),
      ),
    ].sort();

    // Exact match: a new gap fails, and so does a fix — the ledger must not outlive what it describes.
    expect(observed).toEqual(Object.keys(GENERATION_KNOWN_GAPS).sort());
  });

  it.each(DRAW_TYPES)('%s — a notice carrying a matchUp carries a structureId, in EVERY phase', (drawType) => {
    const { captured } = collectNotices(drawType);

    const violations = captured
      .filter(({ payload }) => payload?.matchUp && !payload.structureId)
      .map(({ topic }) => topic);

    expect({ [drawType]: [...new Set(violations)] }).toEqual({ [drawType]: [] });
  });

  it('the harness observes draw-grain notices at all (guards against a vacuous pass)', () => {
    // Without this, deleting every emission would make the suite green.
    const { captured } = collectNotices('COMPASS');
    const drawGrain = captured.filter(({ payload }) => hasDrawGrain(payload));
    expect(drawGrain.length).toBeGreaterThan(10);
    expect(captured.filter(({ payload }) => payload?.matchUp).length).toBeGreaterThan(5);
  });

  it('every ledger entry names a real topic', () => {
    // A ledger keyed to a renamed topic silently excuses nothing — or worse, reads as coverage.
    const values = new Set(Object.values(topicConstants).filter((v) => typeof v === 'string'));
    expect(Object.keys(GENERATION_KNOWN_GAPS).filter((k) => !values.has(k))).toEqual([]);
  });
});
