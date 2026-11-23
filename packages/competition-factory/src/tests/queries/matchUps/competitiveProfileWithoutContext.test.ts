import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

describe('competitiveProfile without inContext hydration', () => {
  it('attaches competitiveProfile when inContext: false and contextProfile.withCompetitiveness is set', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16 }],
      completeAllMatchUps: true,
    });

    tournamentEngine.setState(tournamentRecord);

    const tournamentResult = tournamentEngine.allTournamentMatchUps({
      contextProfile: { withCompetitiveness: true },
      inContext: false,
    });
    expect(tournamentResult.matchUps?.length).toBeGreaterThan(0);
    const tournamentWithProfile = (tournamentResult.matchUps ?? []).filter(
      (m) => m.competitiveProfile?.competitiveness,
    );
    expect(tournamentWithProfile.length).toBeGreaterThan(0);

    const eventResult = tournamentEngine.allEventMatchUps({
      contextProfile: { withCompetitiveness: true },
      inContext: false,
      eventId,
    });
    expect(eventResult.matchUps?.length).toBeGreaterThan(0);
    const eventWithProfile = (eventResult.matchUps ?? []).filter((m) => m.competitiveProfile?.competitiveness);
    expect(eventWithProfile.length).toBeGreaterThan(0);

    const drawResult = tournamentEngine.allDrawMatchUps({
      contextProfile: { withCompetitiveness: true },
      inContext: false,
      drawId,
    });
    expect(drawResult.matchUps?.length).toBeGreaterThan(0);
    const drawWithProfile = (drawResult.matchUps ?? []).filter((m) => m.competitiveProfile?.competitiveness);
    expect(drawWithProfile.length).toBeGreaterThan(0);
  });

  it('does not attach competitiveProfile when withCompetitiveness is not requested', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      completeAllMatchUps: true,
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps = [] } = tournamentEngine.allTournamentMatchUps({ inContext: false });
    expect(matchUps.length).toBeGreaterThan(0);
    expect(matchUps.every((m) => !m.competitiveProfile)).toBe(true);
  });

  it('does not mutate the underlying drawDefinition matchUps', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      completeAllMatchUps: true,
    });
    tournamentEngine.setState(tournamentRecord);

    const tournamentId = tournamentRecord.tournamentId;
    const findSourceMatchUp = () => {
      const { tournamentRecords } = tournamentEngine.getState();
      const record = tournamentRecords[tournamentId];
      return record.events[0].drawDefinitions[0].structures[0].matchUps.find((m) => m.winningSide);
    };

    const sourceBefore = findSourceMatchUp();
    expect(sourceBefore).toBeDefined();
    expect(sourceBefore.competitiveProfile).toBeUndefined();

    const { matchUps = [] } = tournamentEngine.allTournamentMatchUps({
      contextProfile: { withCompetitiveness: true },
      inContext: false,
    });
    expect(matchUps.some((m) => m.competitiveProfile?.competitiveness)).toBe(true);

    const sourceAfter = findSourceMatchUp();
    expect(sourceAfter.competitiveProfile).toBeUndefined();
  });

  it('preserves the existing inContext: true behavior (competitiveProfile still attached)', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      completeAllMatchUps: true,
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps = [] } = tournamentEngine.allTournamentMatchUps({
      contextProfile: { withCompetitiveness: true },
    });
    expect(matchUps.some((m) => m.competitiveProfile?.competitiveness)).toBe(true);
  });

  it('honors matchUpFilters drawIds while enriching without context', () => {
    const {
      drawIds: [drawIdA, drawIdB],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }, { drawSize: 16 }],
      completeAllMatchUps: true,
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps = [] } = tournamentEngine.allTournamentMatchUps({
      contextProfile: { withCompetitiveness: true },
      matchUpFilters: { drawIds: [drawIdA] },
      inContext: false,
    });

    expect(matchUps.length).toBeGreaterThan(0);
    expect(matchUps.some((m) => m.competitiveProfile?.competitiveness)).toBe(true);

    const { matchUps: bothMatchUps = [] } = tournamentEngine.allTournamentMatchUps({
      contextProfile: { withCompetitiveness: true },
      matchUpFilters: { drawIds: [drawIdA, drawIdB] },
      inContext: false,
    });
    expect(bothMatchUps.length).toBeGreaterThan(matchUps.length);
  });
});
