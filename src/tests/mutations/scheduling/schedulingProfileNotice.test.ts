import { setSubscriptions, deleteNotices } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe, afterEach } from 'vitest';

import { MODIFY_SCHEDULING_PROFILE } from '@Constants/topicConstants';

// The scheduling profile is a tournament extension whose mutations were previously
// SILENT (no notice). It is now un-silenced so the read-model projection can react.
describe('setSchedulingProfile dispatches MODIFY_SCHEDULING_PROFILE', () => {
  afterEach(() => {
    setSubscriptions({ subscriptions: {} });
    deleteNotices();
  });

  it('fires the topic with the tournamentId + profile', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentId: 'sp-notice' },
      drawProfiles: [{ drawSize: 4 }],
      venueProfiles: [{ venueId: 'v1', courtsCount: 2 }],
      nonRandom: 1,
    });
    tournamentEngine.setState(tournamentRecord);
    const record = tournamentEngine.getTournament().tournamentRecord;
    const event = record.events[0];
    const draw = event.drawDefinitions[0];
    const structure = draw.structures[0];
    const round = {
      tournamentId: record.tournamentId,
      eventId: event.eventId,
      drawId: draw.drawId,
      structureId: structure.structureId,
      roundNumber: 1,
    };

    let captured: any;
    setSubscriptions({ subscriptions: { [MODIFY_SCHEDULING_PROFILE]: (payloads: any[]) => (captured = payloads) } });
    deleteNotices();

    const result = tournamentEngine.setSchedulingProfile({
      schedulingProfile: [{ scheduleDate: '2025-01-05', venues: [{ venueId: 'v1', rounds: [round] }] }],
    });
    expect(result.success).toEqual(true);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ tournamentId: 'sp-notice' });
    expect(captured[0].schedulingProfile[0].scheduleDate).toEqual('2025-01-05');
  });
});
