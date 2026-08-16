import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and types
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';

/**
 * The sanctioning origin must reach the notice, so a subscriber can attribute a change without
 * resolving the event. One tournamentRecord can hold events sanctioned by several organisations —
 * `Event.eventOtherIds[]`, the entry flagged `isOrigin`. Vocabulary mirrors the read-model's
 * origin_organisation_id / origin_tournament_id / origin_event_id.
 */
describe('MODIFY_MATCHUP carries the sanctioning origin', () => {
  function seed() {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
      participantsProfile: { nonRandom: 1 },
      setState: true,
    });
    return { drawId, eventId };
  }

  function scoreOne(drawId: string) {
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-4 6-2',
      matchUpStatus: 'COMPLETED',
      winningSide: 1,
    });
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const target = matchUps.find(
      (m: any) => !m.winningSide && (m.sides ?? []).filter((s: any) => s?.participantId).length === 2,
    );
    return tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, drawId, outcome });
  }

  it('flattens the isOrigin entry onto the payload', () => {
    const { drawId, eventId } = seed();

    const origin = { organisationId: 'ORG-EXTERNAL', tournamentId: 'THEIR-TID', eventId: 'THEIR-EID', isOrigin: true };
    let result: any = tournamentEngine.modifyEvent({ eventId, eventUpdates: { eventOtherIds: [origin] } });
    expect(result.success).toEqual(true);

    const notices: any[] = [];
    setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (n: any[]) => notices.push(...n) } });
    result = scoreOne(drawId);
    expect(result.success).toEqual(true);
    setSubscriptions({ subscriptions: {} });

    expect(notices.length).toBeGreaterThan(0);
    const payload = notices[0];
    expect(payload.originOrganisationId).toEqual('ORG-EXTERNAL');
    // deliberately NOT the carrying record's tournamentId — that is the whole point
    expect(payload.originTournamentId).toEqual('THEIR-TID');
    expect(payload.originTournamentId).not.toEqual(payload.tournamentId);
    expect(payload.originEventId).toEqual('THEIR-EID');
    // local identity still present
    expect(payload.eventId).toEqual(eventId);
  });

  it('omits origin fields when the event declares none (the ordinary case)', () => {
    const { drawId } = seed();

    const notices: any[] = [];
    setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (n: any[]) => notices.push(...n) } });
    const result: any = scoreOne(drawId);
    expect(result.success).toEqual(true);
    setSubscriptions({ subscriptions: {} });

    expect(notices.length).toBeGreaterThan(0);
    expect(notices[0].originOrganisationId).toBeUndefined();
    expect(notices[0].originTournamentId).toBeUndefined();
  });
});
