import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { attachFlightProfile } from '@Mutate/events/attachFlightProfile';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { EXISTING_PROFILE, MISSING_EVENT, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

describe('attachFlightProfile', () => {
  // Parameter validation
  it('returns error when flightProfile is missing', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    const event = tournamentRecord.events[0];

    const result: any = attachFlightProfile({
      flightProfile: null,
      event,
    } as any);

    expect(result.error).toBe(MISSING_VALUE);
  });

  it('returns error when flightProfile is undefined', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    const event = tournamentRecord.events[0];

    const result: any = attachFlightProfile({
      flightProfile: undefined,
      event,
    } as any);

    expect(result.error).toBe(MISSING_VALUE);
  });

  it('returns error when event is missing', () => {
    const flightProfile = {
      flights: [{ drawId: 'd1', drawName: 'Flight 1' }],
    };

    const result: any = attachFlightProfile({
      event: null,
      flightProfile,
    } as any);

    expect(result.error).toBe(MISSING_EVENT);
  });

  it('returns error when event is undefined', () => {
    const flightProfile = {
      flights: [{ drawId: 'd1', drawName: 'Flight 1' }],
    };

    const result: any = attachFlightProfile({
      event: undefined,
      flightProfile,
    } as any);

    expect(result.error).toBe(MISSING_EVENT);
  });

  // Existing profile handling
  it('returns error when profile already exists', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    tournamentEngine.setState(tournamentRecord);

    const event = tournamentRecord.events[0];
    const flightProfile = {
      flights: [{ drawId: 'd1', drawName: 'Flight 1', drawEntries: [] }],
    };

    // Attach first time
    const result1 = attachFlightProfile({ event, flightProfile } as any);
    expect(result1.success).toBe(true);

    // Try to attach again without deleteExisting
    const result2: any = attachFlightProfile({ event, flightProfile } as any);
    expect(result2.error).toBe(EXISTING_PROFILE);
  });

  it('allows replacing profile with deleteExisting flag', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    tournamentEngine.setState(tournamentRecord);

    const event = tournamentRecord.events[0];
    const flightProfile1 = {
      flights: [{ drawId: 'd1', drawName: 'Flight 1', drawEntries: [] }],
    };
    const flightProfile2 = {
      flights: [
        { drawId: 'd2', drawName: 'Flight 2', drawEntries: [] },
        { drawId: 'd3', drawName: 'Flight 3', drawEntries: [] },
      ],
    };

    // Attach first profile
    attachFlightProfile({ event, flightProfile: flightProfile1 } as any);

    // Replace with deleteExisting
    const result: any = attachFlightProfile({
      event,
      flightProfile: flightProfile2,
      deleteExisting: true,
    } as any);

    expect(result.success).toBe(true);
    expect(result.flightProfile.flights).toHaveLength(2);
  });

  // Existing draw definitions
  it('returns error when event has draw definitions', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const event = tournamentRecord.events[0];
    const flightProfile = {
      flights: [{ drawId: 'd1', drawName: 'Flight 1', drawEntries: [] }],
    };

    const result: any = attachFlightProfile({ event, flightProfile } as any);

    expect(result.error).toBe(EXISTING_PROFILE);
  });

  it('allows attaching when drawDefinitions is empty array', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    const event = tournamentRecord.events[0];

    const flightProfile = {
      flights: [{ drawId: 'd1', drawName: 'Flight 1', drawEntries: [] }],
    };

    const result: any = attachFlightProfile({ event, flightProfile } as any);

    expect(result.success).toBe(true);
  });

  it('allows attaching when drawDefinitions is undefined', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    const event = tournamentRecord.events[0];
    delete event.drawDefinitions;

    const flightProfile = {
      flights: [{ drawId: 'd1', drawName: 'Flight 1', drawEntries: [] }],
    };

    const result: any = attachFlightProfile({ event, flightProfile } as any);

    expect(result.success).toBe(true);
  });

  // Successful attachment
  it('successfully attaches flight profile', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    const event = tournamentRecord.events[0];

    const flightProfile = {
      flights: [
        { drawId: 'd1', drawName: 'Flight 1', drawEntries: [] },
        { drawId: 'd2', drawName: 'Flight 2', drawEntries: [] },
      ],
    };

    const result: any = attachFlightProfile({ event, flightProfile } as any);

    expect(result.success).toBe(true);
    expect(result.flightProfile).toBeDefined();
    expect(result.flightProfile.flights).toHaveLength(2);
  });

  it('returns deep copy of flight profile', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    const event = tournamentRecord.events[0];

    const flightProfile = {
      flights: [{ drawId: 'd1', drawName: 'Flight 1', drawEntries: [] }],
    };

    const result: any = attachFlightProfile({ event, flightProfile } as any);

    // Modify returned profile
    result.flightProfile.flights[0].drawName = 'Modified';

    // Original should not be affected
    expect(flightProfile.flights[0].drawName).toBe('Flight 1');
  });

  it('attaches profile with complex flight data', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    const event = tournamentRecord.events[0];

    const flightProfile = {
      flights: [
        {
          drawId: 'd1',
          drawName: 'Flight 1',
          drawEntries: [
            { participantId: 'p1', entryStatus: 'DIRECT_ACCEPTANCE' },
            { participantId: 'p2', entryStatus: 'DIRECT_ACCEPTANCE' },
          ],
        },
        {
          drawId: 'd2',
          drawName: 'Flight 2',
          drawEntries: [
            { participantId: 'p3', entryStatus: 'DIRECT_ACCEPTANCE' },
            { participantId: 'p4', entryStatus: 'DIRECT_ACCEPTANCE' },
          ],
        },
      ],
      splitMethod: 'WATERFALL',
      eventType: 'SINGLES',
    };

    const result: any = attachFlightProfile({ event, flightProfile } as any);

    expect(result.success).toBe(true);
    expect(result.flightProfile.splitMethod).toBe('WATERFALL');
    expect(result.flightProfile.flights[0].drawEntries).toHaveLength(2);
  });

  it('handles flight profile with single flight', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    const event = tournamentRecord.events[0];

    const flightProfile = {
      flights: [
        {
          drawId: 'd1',
          drawName: 'Main Draw',
          drawEntries: [],
        },
      ],
    };

    const result: any = attachFlightProfile({ event, flightProfile } as any);

    expect(result.success).toBe(true);
    expect(result.flightProfile.flights).toHaveLength(1);
  });

  it('handles flight profile with many flights', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    const event = tournamentRecord.events[0];

    const flights = Array.from({ length: 10 }, (_, i) => ({
      drawId: `d${i + 1}`,
      drawName: `Flight ${i + 1}`,
      drawEntries: [],
    }));

    const flightProfile = { flights };

    const result: any = attachFlightProfile({ event, flightProfile } as any);

    expect(result.success).toBe(true);
    expect(result.flightProfile.flights).toHaveLength(10);
  });

  it('preserves flight profile metadata', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    const event = tournamentRecord.events[0];

    const flightProfile = {
      flights: [{ drawId: 'd1', drawName: 'Flight 1', drawEntries: [] }],
      splitMethod: 'CUSTOM',
      scaleName: 'WTN',
      scaleType: 'RATING',
      customMetadata: { key: 'value' },
    };

    const result: any = attachFlightProfile({ event, flightProfile } as any);

    expect(result.success).toBe(true);
    expect(result.flightProfile.splitMethod).toBe('CUSTOM');
    expect(result.flightProfile.scaleName).toBe('WTN');
    expect(result.flightProfile.scaleType).toBe('RATING');
  });

  // Edge cases
  it('handles empty flights array', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    const event = tournamentRecord.events[0];

    const flightProfile = { flights: [] };

    const result: any = attachFlightProfile({ event, flightProfile } as any);

    expect(result.success).toBe(true);
    expect(result.flightProfile.flights).toHaveLength(0);
  });

  it('handles flight profile with null deleteExisting', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    const event = tournamentRecord.events[0];

    const flightProfile = {
      flights: [{ drawId: 'd1', drawName: 'Flight 1', drawEntries: [] }],
    };

    const result = attachFlightProfile({
      event,
      flightProfile,
      deleteExisting: null,
    });

    expect(result.success).toBe(true);
  });

  it('handles flight profile with undefined deleteExisting', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    const event = tournamentRecord.events[0];

    const flightProfile = {
      flights: [{ drawId: 'd1', drawName: 'Flight 1', drawEntries: [] }],
    };

    const result = attachFlightProfile({
      deleteExisting: undefined,
      flightProfile,
      event,
    });

    expect(result.success).toBe(true);
  });

  it('handles flight profile with false deleteExisting', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    const event = tournamentRecord.events[0];

    const flightProfile = {
      flights: [{ drawId: 'd1', drawName: 'Flight 1', drawEntries: [] }],
    };

    // First attachment
    attachFlightProfile({ event, flightProfile } as any);

    // Try to attach again with explicit false
    const result: any = attachFlightProfile({
      deleteExisting: false,
      flightProfile,
      event,
    });

    expect(result.error).toBe(EXISTING_PROFILE);
  });

  // Integration tests
  it('integrates with tournamentEngine', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
      setState: true,
    });

    const event = tournamentRecord.events[0];
    const flightProfile = {
      flights: [
        { drawId: 'd1', drawName: 'Flight 1', drawEntries: [] },
        { drawId: 'd2', drawName: 'Flight 2', drawEntries: [] },
      ],
    };

    const result = tournamentEngine.attachFlightProfile({ eventId: event.eventId, flightProfile } as any);
    expect(result.success).toBe(true);

    // Verify it's attached via tournamentEngine
    const retrievedEvent = tournamentEngine.getEvent({ eventId: event.eventId })?.event;
    const retrievedFlightProfile = firstClassOrExtension({
      element: retrievedEvent,
      attribute: 'flightProfile',
      name: 'flightProfile',
    });
    expect(retrievedFlightProfile).toBeDefined();
  });

  it('handles consecutive attach and replace operations', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: SINGLES_EVENT }],
    });
    const event = tournamentRecord.events[0];

    const profile1 = { flights: [{ drawId: 'd1', drawName: 'Flight 1', drawEntries: [] }] };
    const profile2 = { flights: [{ drawId: 'd2', drawName: 'Flight 2', drawEntries: [] }] };
    const profile3 = { flights: [{ drawId: 'd3', drawName: 'Flight 3', drawEntries: [] }] };

    attachFlightProfile({ event, flightProfile: profile1 } as any);
    attachFlightProfile({ event, flightProfile: profile2, deleteExisting: true });
    const result: any = attachFlightProfile({ event, flightProfile: profile3, deleteExisting: true });

    expect(result.success).toBe(true);
    expect(result.flightProfile.flights[0].drawId).toBe('d3');
  });
});
