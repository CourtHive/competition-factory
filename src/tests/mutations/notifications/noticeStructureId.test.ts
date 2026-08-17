import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and types
import {
  COMPASS,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
} from '@Constants/drawDefinitionConstants';
import { MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS } from '@Constants/topicConstants';

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
});
