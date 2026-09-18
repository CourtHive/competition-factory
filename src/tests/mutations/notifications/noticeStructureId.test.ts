import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS, MODIFY_DRAW_DEFINITION } from '@Constants/topicConstants';
import {
  COMPASS,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
} from '@Constants/drawDefinitionConstants';

/**
 * MODIFY_MATCHUP must carry the structure a change happened in, so a subscriber can route it without
 * resolving the matchUp. CFS uses this for structure-grain cache eviction; before it was populated,
 * a score could not name the structure it changed and the whole tier had to be swept.
 * See Mentat/planning/FACTORY_NOTICE_IDENTITY_AUDIT.md.
 */
describe('MODIFY_MATCHUP structureId', () => {
  function capture(topics: string[]) {
    const notices: any[] = [];
    const subscriptions: any = {};
    for (const topic of topics)
      subscriptions[topic] = (n: any[]) => (n ?? []).forEach((p) => notices.push({ topic, p }));
    setSubscriptions({ subscriptions });
    return notices;
  }

  it.each([
    ['single elimination', { drawSize: 8, drawType: SINGLE_ELIMINATION }],
    ['compass (loser crosses into another structure)', { drawSize: 8, drawType: COMPASS }],
    ['first match loser consolation', { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
    ['round robin (matchUps live in NESTED structures)', { drawSize: 8, drawType: ROUND_ROBIN }],
  ])('%s — matches the structureId allTournamentMatchUps reports', (_label, drawProfile) => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [drawProfile],
      participantsProfile: { nonRandom: 1 },
      setState: true,
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const target: any = matchUps.find(
      (m: any) => !m.winningSide && (m.sides ?? []).filter((s: any) => s?.participantId).length === 2,
    );
    expect(target.structureId).toBeDefined(); // inContext is the reference vocabulary

    const notices = capture([MODIFY_MATCHUP]);
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-4 6-2',
      matchUpStatus: 'COMPLETED',
      winningSide: 1,
    });
    const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, drawId, outcome });
    expect(result.success).toEqual(true);

    const emitted = notices.filter((n) => n.topic === MODIFY_MATCHUP).map((n) => n.p);
    expect(emitted.length).toBeGreaterThan(0);
    // EVERY notice must be attributable — one unattributed notice forces a consumer back to a
    // wholesale sweep, which is exactly the state this change exists to leave behind.
    expect(emitted.filter((p: any) => !p.structureId)).toEqual([]);

    // The notice for the scored matchUp must name the structure it actually lives in.
    const scored = emitted.find((p: any) => p.matchUp?.matchUpId === target.matchUpId);
    expect(scored?.structureId).toEqual(target.structureId);

    // Every emitted structureId must agree with the inContext view — no second vocabulary.
    const byId = Object.fromEntries(matchUps.map((m: any) => [m.matchUpId, m]));
    for (const p of emitted) {
      const inContext = byId[p.matchUp?.matchUpId];
      if (inContext) expect(p.structureId).toEqual(inContext.structureId);
    }

    setSubscriptions({ subscriptions: {} });
  });

  it.each([
    ['single elimination', 'SINGLE_ELIMINATION'],
    ['compass', 'COMPASS'],
    ['round robin', 'ROUND_ROBIN'],
    ['first match loser consolation', 'FIRST_MATCH_LOSER_CONSOLATION'],
    ['round robin with playoff', 'ROUND_ROBIN_WITH_PLAYOFF'],
    ['feed in championship', 'FEED_IN_CHAMPIONSHIP'],
  ])('%s — EVERY notice from a fully played draw carries an eventId', (_label, drawType) => {
    // Advancement paths used to drop `event` on the way down (directWinner -> assignMatchUpDrawPosition,
    // handleContainerAssignment -> modifyRoundRobinMatchUpsStatus, advanceDrawPosition), so notices for
    // PROPAGATED matchUps arrived with no eventId. A consumer cannot route those, and one unattributable
    // notice forces a wholesale cache sweep — it only takes one to lose the granularity for the batch.
    // Playing the draw OUT is the point: the gap was in advancement, not in the first score.
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType }],
      participantsProfile: { nonRandom: 1 },
      setState: true,
    });

    const notices = capture([MODIFY_MATCHUP]);
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
    expect(scored).toBeGreaterThan(0); // guard: the timing/coverage claim rests on real mutations

    const emitted = notices.map((n) => n.p);
    expect(emitted.length).toBeGreaterThan(0);
    expect(emitted.filter((p: any) => !p.eventId)).toEqual([]);
    expect(emitted.filter((p: any) => !p.structureId)).toEqual([]);
    expect(emitted.filter((p: any) => !p.drawId)).toEqual([]);

    setSubscriptions({ subscriptions: {} });
  });

  it('MODIFY_DRAW_DEFINITION emitted alongside a score carries the same eventId', () => {
    // The two notices come from ONE call. The fallback used to be applied to the MODIFY_MATCHUP
    // payload but not to the drawNotice, so a caller supplying `event` (and not `eventId`) produced
    // one notice that could be attributed and one that could not — and a consumer needs only one
    // unattributable notice to lose the whole batch's granularity.
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
      participantsProfile: { nonRandom: 1 },
      setState: true,
    });

    const notices = capture([MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION]);
    const matchUps: any[] = tournamentEngine.allTournamentMatchUps().matchUps ?? [];
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-4 6-2',
      matchUpStatus: 'COMPLETED',
      winningSide: 1,
    });
    let scored = 0;
    for (let pass = 0; pass < 12; pass++) {
      const all: any[] = tournamentEngine.allTournamentMatchUps().matchUps ?? [];
      const next = all.filter(
        (m: any) => !m.winningSide && (m.sides ?? []).filter((s: any) => s?.participantId).length === 2,
      );
      if (!next.length) break;
      for (const m of next) {
        if (tournamentEngine.setMatchUpStatus({ matchUpId: m.matchUpId, drawId, outcome }).success) scored += 1;
      }
    }
    expect(scored).toBeGreaterThan(0);
    expect(matchUps.length).toBeGreaterThan(0);

    const drawNotices = notices.filter((n) => n.topic === MODIFY_DRAW_DEFINITION).map((n) => n.p);
    expect(drawNotices.length).toBeGreaterThan(0);
    expect(drawNotices.filter((p: any) => !p.eventId)).toEqual([]);

    setSubscriptions({ subscriptions: {} });
  });

  it('a caller-supplied structureId is not overwritten by the fallback', () => {
    // The fallback must stay a fallback: call sites that know the structure remain authoritative.
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: COMPASS }],
      participantsProfile: { nonRandom: 1 },
      setState: true,
    });
    const notices = capture([MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS]);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const target: any = matchUps.find(
      (m: any) => !m.winningSide && (m.sides ?? []).filter((s: any) => s?.participantId).length === 2,
    );
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-4 6-2',
      matchUpStatus: 'COMPLETED',
      winningSide: 1,
    });
    tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, drawId, outcome });

    // A compass loser lands in a DIFFERENT structure; that topic carries the destination explicitly.
    const positional = notices.filter((n) => n.topic === MODIFY_POSITION_ASSIGNMENTS).map((n) => n.p);
    expect(positional.length).toBeGreaterThan(0);
    for (const p of positional) expect(p.structureId).toBeDefined();

    setSubscriptions({ subscriptions: {} });
  });

  /**
   * The cases above each exercise one operation. This one asks the whole-surface question instead:
   * across a spread of mutations, is there ANY MODIFY_MATCHUP that names no structure?
   *
   * There was. `removeStructure` emits one notice per surviving matchUp whose winner/loser
   * progression it rewired, and withheld `drawDefinition` from those calls — so none of them could
   * resolve a structureId. 0 of 24 at drawSize 32. `attachStructures` and `aggregateTieFormats`
   * withheld it too.
   *
   * This is deliberately a BEHAVIOURAL guard rather than a required `drawDefinition` parameter.
   * Requiring it cascades into five more files, two of which legitimately hold a `drawId` and let
   * the callee resolve the draw — and the guards that cascade forces are the shape that drops a
   * notice silently rather than failing. A type assertion can be satisfied by a `!`; this cannot.
   */
  it('no MODIFY_MATCHUP anywhere in these operations names a structure it cannot', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
      setState: true,
    });

    const notices = capture([MODIFY_MATCHUP]);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const target: any = matchUps.find(
      (m: any) => !m.winningSide && (m.sides ?? []).filter((s: any) => s?.participantId).length === 2,
    );
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-4 6-2',
      matchUpStatus: 'COMPLETED',
      winningSide: 1,
    });
    tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, drawId, outcome });

    const { drawDefinition }: any = tournamentEngine.getEvent({ drawId });
    const consolation = drawDefinition?.structures?.find((structure: any) => structure.stage === 'CONSOLATION');
    tournamentEngine.removeStructure({ structureId: consolation.structureId, drawId });

    // The control: without notices to inspect, "none unnamed" is vacuously true.
    expect(notices.length).toBeGreaterThan(20);

    const unnamed = notices.filter((n) => !n.p.structureId);
    expect(unnamed).toEqual([]);

    setSubscriptions({ subscriptions: {} });
  });
});
