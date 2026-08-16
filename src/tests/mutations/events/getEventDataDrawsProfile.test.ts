import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and types
import { SINGLE_ELIMINATION, ROUND_ROBIN, COMPASS } from '@Constants/drawDefinitionConstants';
import { completedMatchUpStatuses, BYE } from '@Constants/matchUpStatusConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { DrawsProfileEnum } from '@Types/tournamentTypes';

const seed = { nonRandom: 1 };

function loadDraw(drawProfile: any) {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [drawProfile],
    participantsProfile: seed,
    setState: true,
  });
  return eventId;
}

/** Complete scoreable matchUps in passes — later rounds unlock as earlier ones finish. */
function completeAll() {
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-4 6-2',
    matchUpStatus: 'COMPLETED',
    winningSide: 1,
  });
  for (let pass = 0; pass < 12; pass++) {
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const next = matchUps.filter(
      (m: any) => !m.winningSide && (m.sides ?? []).filter((s: any) => s?.participantId).length === 2,
    );
    if (!next.length) return;
    for (const m of next) tournamentEngine.setMatchUpStatus({ matchUpId: m.matchUpId, drawId: m.drawId, outcome });
  }
}

describe('getEventData drawsProfile', () => {
  it('is ADDITIVE — omitting drawsProfile is byte-identical to passing FULL', () => {
    // The load-bearing guarantee. ClubSpark runs the existing pattern at scale for USTA and ITA;
    // default output must not move. Asserted mechanically rather than promised in review.
    const eventId = loadDraw({ drawSize: 16, drawType: COMPASS });

    const omitted = tournamentEngine.getEventData({ eventId });
    const explicit = tournamentEngine.getEventData({ eventId, drawsProfile: DrawsProfileEnum.FULL });

    expect(JSON.stringify(omitted)).toEqual(JSON.stringify(explicit));
    expect(omitted.eventData.drawsData[0].structures?.length).toBeGreaterThan(0);
  });

  it('rejects an unknown profile rather than silently returning the full payload', () => {
    const eventId = loadDraw({ drawSize: 8, drawType: SINGLE_ELIMINATION });

    // A typo must not quietly hand back the payload the caller was trying to avoid.
    const result: any = tournamentEngine.getEventData({ eventId, drawsProfile: 'stubs' as any });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.eventData).toBeUndefined();
  });

  it('STUBS omits structures and is dramatically smaller', () => {
    const eventId = loadDraw({ drawSize: 32, drawType: SINGLE_ELIMINATION });

    const full = tournamentEngine.getEventData({ eventId });
    const stubs = tournamentEngine.getEventData({ eventId, drawsProfile: DrawsProfileEnum.STUBS });

    const stub = stubs.eventData.drawsData[0];
    expect(stub.structures).toBeUndefined();
    expect(stub.drawId).toEqual(full.eventData.drawsData[0].drawId);
    expect(stub.drawName).toEqual(full.eventData.drawsData[0].drawName);
    expect(stub.drawType).toEqual(full.eventData.drawsData[0].drawType);

    // The point of the profile: a large reduction, not a rounding error.
    const fullSize = JSON.stringify(full.eventData.drawsData).length;
    const stubSize = JSON.stringify(stubs.eventData.drawsData).length;
    expect(stubSize * 10).toBeLessThan(fullSize);
  });

  it('STUBS keeps every draw — the FULL path drops draws with no structures', () => {
    // Regression guard: FULL ends with `.filter((drawData) => drawData.structures?.length)`, which
    // would delete every stub if stubs were routed through the same pipeline.
    const eventId = loadDraw({ drawSize: 16, drawType: SINGLE_ELIMINATION });
    const stubs = tournamentEngine.getEventData({ eventId, drawsProfile: DrawsProfileEnum.STUBS });
    expect(stubs.eventData.drawsData.length).toEqual(1);
  });

  describe('drawGenerated / drawCompleted match the FULL values', () => {
    const completedStatuses = [...completedMatchUpStatuses, BYE];

    it.each([
      ['single elimination', { drawSize: 16, drawType: SINGLE_ELIMINATION }],
      ['round robin (matchUps live in NESTED structures)', { drawSize: 16, drawType: ROUND_ROBIN }],
      ['compass', { drawSize: 16, drawType: COMPASS }],
    ])('%s — untouched and fully completed', (_label, profile) => {
      // untouched
      let eventId = loadDraw(profile);
      let full = tournamentEngine.getEventData({ eventId });
      let stubs = tournamentEngine.getEventData({ eventId, drawsProfile: DrawsProfileEnum.STUBS });
      expect(stubs.eventData.drawsData[0].drawGenerated).toEqual(!!full.eventData.drawsData[0].drawGenerated);
      expect(stubs.eventData.drawsData[0].drawCompleted).toEqual(!!full.eventData.drawsData[0].drawCompleted);
      expect(stubs.eventData.drawsData[0].drawCompleted).toEqual(false);

      // completed — proves the assertion can change value, not just agree on a constant
      eventId = loadDraw(profile);
      completeAll();
      full = tournamentEngine.getEventData({ eventId });
      stubs = tournamentEngine.getEventData({ eventId, drawsProfile: DrawsProfileEnum.STUBS });
      expect(stubs.eventData.drawsData[0].drawCompleted).toEqual(!!full.eventData.drawsData[0].drawCompleted);
      expect(stubs.eventData.drawsData[0].drawCompleted).toEqual(true);
      expect(completedStatuses.length).toBeGreaterThan(1);
    });
  });
});
