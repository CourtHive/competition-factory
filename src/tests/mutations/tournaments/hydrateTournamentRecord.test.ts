import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants and fixtures
import { POLICY_ROUND_NAMING_DEFAULT } from '@Fixtures/policies/POLICY_ROUND_NAMING_DEFAULT';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { hydrateTournamentRecord } from '@Mutate/base/hydrateTournamentRecord';

describe('hydrateTournamentRecord', () => {
  it('can hydrate roundNames in tournamentRecords', () => {
    const participantsCount = 16;
    const eventId = 'eventId';

    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: participantsCount }] }],
      setState: true,
    });

    let matchUps = tournamentEngine.allTournamentMatchUps({ inContext: false }).matchUps;
    let matchUpsWithRoundNames = matchUps.filter((m) => m.roundNumber && m.roundName);
    expect(matchUpsWithRoundNames.length).toEqual(0);

    tournamentEngine.hydrateTournamentRecord({
      directives: { hydrateRoundNames: true },
      policyDefinitions: POLICY_ROUND_NAMING_DEFAULT,
    });

    matchUps = tournamentEngine.allTournamentMatchUps({ inContext: false }).matchUps;
    matchUpsWithRoundNames = matchUps.filter((m) => m.roundNumber && m.roundName);
    expect(matchUpsWithRoundNames.length).toEqual(matchUps.length);
  });

  // Edge case tests for full coverage
  it('returns error when tournamentRecord is missing (via direct import)', () => {
    const result = hydrateTournamentRecord({
      tournamentRecord: null,
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when tournamentRecord is undefined (via direct import)', () => {
    const result = hydrateTournamentRecord({
      tournamentRecord: undefined,
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('handles tournamentRecord with no events', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 0 },
    });
    tournamentRecord.events = [];

    const result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const hydrateResult = tournamentEngine.hydrateTournamentRecord({
      directives: { hydrateRoundNames: true },
    });
    expect(hydrateResult.tournamentRecord).toBeDefined();
  });

  it('handles tournamentRecord with undefined events', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 0 },
    });
    delete tournamentRecord.events;

    const result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const hydrateResult = tournamentEngine.hydrateTournamentRecord({
      directives: { hydrateRoundNames: true },
    });
    expect(hydrateResult.tournamentRecord).toBeDefined();
  });

  it('handles events without drawDefinitions', () => {
    const eventId = 'eventId';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId }],
    });

    tournamentRecord.events[0].drawDefinitions = [];

    const result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const hydrateResult = tournamentEngine.hydrateTournamentRecord({
      eventProfiles: [{ eventId, directives: { hydrateRoundNames: true } }],
      policyDefinitions: POLICY_ROUND_NAMING_DEFAULT,
    });
    expect(hydrateResult.tournamentRecord).toBeDefined();
  });

  it('handles events with undefined drawDefinitions', () => {
    const eventId = 'eventId';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId }],
    });

    delete tournamentRecord.events[0].drawDefinitions;

    const result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const hydrateResult = tournamentEngine.hydrateTournamentRecord({
      eventProfiles: [{ eventId, directives: { hydrateRoundNames: true } }],
      policyDefinitions: POLICY_ROUND_NAMING_DEFAULT,
    });
    expect(hydrateResult.tournamentRecord).toBeDefined();
  });

  it('hydrates only matching eventProfiles', () => {
    const eventId1 = 'event1';
    const eventId2 = 'event2';

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [
        { eventId: eventId1, drawProfiles: [{ drawSize: 8 }] },
        { eventId: eventId2, drawProfiles: [{ drawSize: 8 }] },
      ],
    });

    const result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    // Only hydrate event1
    tournamentEngine.hydrateTournamentRecord({
      eventProfiles: [{ eventId: eventId1, directives: { hydrateRoundNames: true } }],
      policyDefinitions: POLICY_ROUND_NAMING_DEFAULT,
    });

    const event1MatchUps = tournamentEngine.allEventMatchUps({ eventId: eventId1 }).matchUps;
    const event2MatchUps = tournamentEngine.allEventMatchUps({ eventId: eventId2 }).matchUps;

    const event1WithRoundNames = event1MatchUps.filter((m) => m.roundName);
    const event2WithRoundNames = event2MatchUps.filter((m) => m.roundName);

    expect(event1WithRoundNames.length).toEqual(event1MatchUps.length);
    expect(event2WithRoundNames.length).toEqual(0);
  });

  it('handles eventProfile without matching eventId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId: 'realEvent', drawProfiles: [{ drawSize: 8 }] }],
    });

    const result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    // Try to hydrate non-existent event
    const hydrateResult = tournamentEngine.hydrateTournamentRecord({
      eventProfiles: [{ eventId: 'nonExistentEvent', directives: { hydrateRoundNames: true } }],
      policyDefinitions: POLICY_ROUND_NAMING_DEFAULT,
    });

    expect(hydrateResult.tournamentRecord).toBeDefined();
  });

  it('uses eventProfile policyDefinitions over global policyDefinitions', () => {
    const eventId = 'eventId';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 8 }] }],
    });

    const result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    tournamentEngine.hydrateTournamentRecord({
      eventProfiles: [
        {
          eventId,
          directives: { hydrateRoundNames: true },
          policyDefinitions: POLICY_ROUND_NAMING_DEFAULT,
        },
      ],
      policyDefinitions: {}, // Empty global policy
    });

    const matchUps = tournamentEngine.allEventMatchUps({ eventId }).matchUps;
    const withRoundNames = matchUps.filter((m) => m.roundName);
    expect(withRoundNames.length).toEqual(matchUps.length);
  });

  it('handles hydration without policyDefinitions', () => {
    const eventId = 'eventId';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 8 }] }],
    });

    const result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    // Hydrate without policy - should not throw
    const hydrateResult = tournamentEngine.hydrateTournamentRecord({
      eventProfiles: [{ eventId, directives: { hydrateRoundNames: true } }],
    });

    expect(hydrateResult.tournamentRecord).toBeDefined();
  });
});
