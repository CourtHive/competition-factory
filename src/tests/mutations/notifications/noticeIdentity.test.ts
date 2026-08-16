import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and types
import { MODIFY_MATCHUP, PUBLISH_EVENT } from '@Constants/topicConstants';
import * as topicConstants from '@Constants/topicConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * Notices must carry enough identity on the ENVELOPE for a subscriber to route a change without
 * resolving the entity it describes — cache eviction, data fan-out. See
 * Mentat/planning/FACTORY_NOTICE_IDENTITY_AUDIT.md.
 */
describe('notice identity envelope', () => {
  it('MODIFY_MATCHUP carries eventId and drawId, not only the matchUp', () => {
    const notices: any[] = [];
    setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (n: any[]) => notices.push(...n) } });

    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
      participantsProfile: { nonRandom: 1 },
      setState: true,
    });

    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-4 6-2',
      matchUpStatus: 'COMPLETED',
      winningSide: 1,
    });
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const target = matchUps.find(
      (m: any) => !m.winningSide && (m.sides ?? []).filter((s: any) => s?.participantId).length === 2,
    );
    const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, drawId, outcome });
    expect(result.success).toEqual(true);

    expect(notices.length).toBeGreaterThan(0);
    // Previously the payload was only { matchUp, tournamentId, context } — a consumer wanting the
    // event had to resolve the matchUp, or ride a sibling topic.
    const payload = notices[0];
    expect(payload.eventId).toEqual(eventId);
    expect(payload.drawId).toEqual(drawId);
    expect(payload.tournamentId).toBeDefined();
    // additive: the entity is still there
    expect(payload.matchUp?.matchUpId).toEqual(target.matchUpId);

    setSubscriptions({ subscriptions: {} });
  });

  it('PUBLISH_EVENT carries eventId on the envelope, not only inside eventData', () => {
    const notices: any[] = [];
    setSubscriptions({ subscriptions: { [PUBLISH_EVENT]: (n: any[]) => notices.push(...n) } });

    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
      participantsProfile: { nonRandom: 1 },
      setState: true,
    });

    const result: any = tournamentEngine.publishEvent({ eventId });
    expect(result.success).toEqual(true);

    expect(notices.length).toBeGreaterThan(0);
    // The whole point: a subscriber that needs only the id must not have to reach through eventData,
    // which is what keeps the (expensive) eventData build mandatory.
    expect(notices[0].eventId).toEqual(eventId);
    expect(notices[0].tournamentId).toBeDefined();

    setSubscriptions({ subscriptions: {} });
  });

  it('every precisely-typed TopicPayloadMap key is a real topic constant', async () => {
    // Guards the drift the map is most exposed to: its keys are hand-written strings that must match
    // topicConstants exactly. A renamed or mistyped key silently types nothing and never fires.
    const topicValues = new Set(Object.values(topicConstants).filter((v) => typeof v === 'string'));

    // Read the map's declared keys from source — the type itself is erased at runtime.
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../../forge/topicTypes.ts'), 'utf8');
    const body = src.slice(src.indexOf('export interface TopicPayloadMap'));
    const keys = [...body.matchAll(/^\s{2}(\w+):\s/gm)].map((m) => m[1]);

    expect(keys.length).toBeGreaterThan(10);
    const unknown = keys.filter((k) => !topicValues.has(k));
    expect({ unknown }).toEqual({ unknown: [] });
  });
});
