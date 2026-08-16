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

  it('prefers the DRAW grain, which can carry an origin the event grain cannot', () => {
    // #4636's case: a UTR flight yields tournament + draw ids with NO event grain at all. A notice
    // resolving only eventOrigin would carry nothing for exactly the records fan-out most needs.
    const { drawId, eventId } = seed();

    // Use the dedicated mutation added by #4636 rather than writing drawOtherIds by hand.
    let result: any = tournamentEngine.addDrawOtherId({
      drawId,
      organisationId: 'UTR',
      otherTournamentId: 'UTR-EVENT-77',
      otherDrawId: 'UTR-FLIGHT-GUID',
      isOrigin: true,
    });
    expect(result.success).toEqual(true);

    const notices: any[] = [];
    setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (n: any[]) => notices.push(...n) } });
    result = scoreOne(drawId);
    expect(result.success).toEqual(true);
    setSubscriptions({ subscriptions: {} });

    expect(notices.length).toBeGreaterThan(0);
    const payload = notices[0];
    expect(payload.originOrganisationId).toEqual('UTR');
    expect(payload.originTournamentId).toEqual('UTR-EVENT-77');
    expect(payload.originDrawId).toEqual('UTR-FLIGHT-GUID');
    // UTR has no event-grain object, so this is legitimately absent
    expect(payload.originEventId).toBeUndefined();
    // local identity unaffected
    expect(payload.eventId).toEqual(eventId);
  });

  it('when BOTH grains declare an origin, the DRAW wins — a matchUp lives in a draw', () => {
    // The ordering test. Without both present and DIFFERENT, `draw ?? event` and `event ?? draw`
    // are indistinguishable, and an earlier version of this suite could not tell them apart.
    const { drawId } = seed();

    let result: any = tournamentEngine.modifyEvent({
      eventId: tournamentEngine.getTournament().tournamentRecord.events[0].eventId,
      eventUpdates: {
        eventOtherIds: [{ organisationId: 'EVENT-ORG', tournamentId: 'E-TID', eventId: 'E-EID', isOrigin: true }],
      },
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.addDrawOtherId({
      drawId,
      organisationId: 'DRAW-ORG',
      otherTournamentId: 'D-TID',
      otherDrawId: 'D-DID',
      isOrigin: true,
    });
    expect(result.success).toEqual(true);

    const notices: any[] = [];
    setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (n: any[]) => notices.push(...n) } });
    result = scoreOne(drawId);
    expect(result.success).toEqual(true);
    setSubscriptions({ subscriptions: {} });

    const payload = notices[0];
    expect(payload.originOrganisationId).toEqual('DRAW-ORG');
    expect(payload.originTournamentId).toEqual('D-TID');
    expect(payload.originDrawId).toEqual('D-DID');
  });
});
