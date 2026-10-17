/**
 * Coverage tests for generateEventWithDraw.ts
 * Targets 16 uncovered statements including:
 * - eventExtensions with valid extensions (line 151)
 * - drawExtensions forEach callback fstat-no (line 432)
 * - iterativeAdHoc path with dynamic ratings via scaleName/ratingType/drawMatic.scaleName
 * - ROUND_ROBIN_WITH_PLAYOFF completeAllMatchUps + completionGoal
 * - generate: false (flight definition path)
 * - outcomes processing with drawPositions/roundNumber/structureOrder/roundPosition
 * - publish: true
 * - automated: false (manual positioning)
 */
import { ROUND_ROBIN_WITH_PLAYOFF, AD_HOC } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { DOUBLES } from '@Constants/eventConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { WTN } from '@Constants/ratingConstants';

describe('generateEventWithDraw coverage', () => {
  // These two used the `{ extension }` wrapper, the only shape the generator's extension filter let
  // through; it then stored the wrapper. Extensions are `{ name, value }` (M18, 2026-10-17): a
  // well-formed one is attached, and a wrapper is not an extension.
  it('applies valid eventExtensions to the generated event', () => {
    let result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          eventExtensions: [{ name: 'testEventExt', value: 'data' }],
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    const { event } = tournamentEngine.getEvent({ eventId: result.eventIds[0] });
    expect(event.extensions).toEqual([{ name: 'testEventExt', value: 'data' }]);
  });

  it('applies valid drawExtensions via forEach callback', () => {
    let result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          drawExtensions: [{ name: 'drawMeta', value: 'someValue' }],
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: result.drawIds[0] });
    expect(drawDefinition.extensions?.find((extension: any) => extension.name === 'drawMeta')?.value).toEqual(
      'someValue',
    );
  });

  it('a wrapped extension is not an extension, and is not attached', () => {
    let result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          eventExtensions: [{ extension: { name: 'wrapped', value: 'data' } }] as any,
        },
      ],
    });
    tournamentEngine.setState(result.tournamentRecord);
    const { event } = tournamentEngine.getEvent({ eventId: result.eventIds[0] });
    expect(event.extensions ?? []).toEqual([]);
  });

  it('handles ROUND_ROBIN_WITH_PLAYOFF with completeAllMatchUps at top level', () => {
    // completeAllMatchUps must be at top-level params (not inside drawProfile)
    // to be passed through to generateEventWithDraw
    let result: any = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [
        {
          drawSize: 8,
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const completedCount = matchUps.filter((m) => m.matchUpStatus === COMPLETED).length;
    expect(completedCount).toBeGreaterThan(0);
  });

  it('handles ROUND_ROBIN_WITH_PLAYOFF with completionGoal', () => {
    // completionGoal is in drawProfile; completeAllMatchUps at top level
    let result: any = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [
        {
          drawSize: 8,
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          completionGoal: 6,
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const completedCount = matchUps.filter((m) => m.matchUpStatus === COMPLETED).length;
    expect(completedCount).toBeGreaterThan(0);
  });

  it('handles iterativeAdHoc with scaleName for dynamic ratings', () => {
    // Targets the iterativeAdHoc path (AD_HOC + completeAllMatchUps + roundsCount > 1)
    // with scaleName enabling dynamic ratings between rounds
    let result: any = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [
        {
          drawSize: 6,
          drawType: AD_HOC,
          roundsCount: 3,
          scaleName: WTN,
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    expect(matchUps.length).toBeGreaterThanOrEqual(6);

    const roundNumbers = [...new Set(matchUps.map((m) => m.roundNumber))];
    expect(roundNumbers.length).toBe(3);
  });

  it('handles iterativeAdHoc with category.ratingType for dynamic ratings', () => {
    let result: any = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [
        {
          drawSize: 6,
          drawType: AD_HOC,
          roundsCount: 2,
          category: { ratingType: WTN, ratingMin: 10, ratingMax: 14 },
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    expect(matchUps.length).toBeGreaterThan(0);
    const roundNumbers = [...new Set(matchUps.map((m) => m.roundNumber))];
    expect(roundNumbers.length).toBe(2);
  });

  it('handles iterativeAdHoc with drawMatic.scaleName', () => {
    let result: any = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [
        {
          drawSize: 6,
          drawType: AD_HOC,
          roundsCount: 2,
          drawMatic: { scaleName: WTN },
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    expect(matchUps.length).toBeGreaterThan(0);
  });

  it('generates flight definition with generate: false', () => {
    let result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          generate: false,
          drawName: 'Flight A',
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    const { event } = tournamentEngine.getEvent({ eventId: result.eventIds[0] });
    expect(event.drawDefinitions).toEqual([]);
    const { flightProfile } = tournamentEngine.getFlightProfile({ eventId: result.eventIds[0] });
    expect(flightProfile).toBeDefined();
    expect(flightProfile.flights?.length).toBeGreaterThan(0);
    expect(flightProfile.flights[0].drawName).toBe('Flight A');
  });

  it('handles outcomes with drawPositions and roundNumber', () => {
    let result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          outcomes: [
            {
              drawPositions: [1, 2],
              roundNumber: 1,
              scoreString: '6-1 6-2',
              winningSide: 1,
            },
            {
              drawPositions: [3, 4],
              roundNumber: 1,
              scoreString: '6-3 6-4',
              winningSide: 2,
            },
          ],
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const completedMatchUps = matchUps.filter((m) => m.matchUpStatus === COMPLETED);
    expect(completedMatchUps.length).toBe(2);
  });

  it('handles outcomes with structureOrder for round robin groups', () => {
    let result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          outcomes: [
            {
              structureOrder: 1,
              roundNumber: 1,
              matchUpIndex: 0,
              scoreString: '6-2 6-3',
              winningSide: 1,
            },
          ],
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const completedMatchUps = matchUps.filter((m) => m.matchUpStatus === COMPLETED);
    expect(completedMatchUps.length).toBe(1);
  });

  it('handles outcomes followed by completeAllMatchUps at top level', () => {
    // outcomes are in drawProfile, completeAllMatchUps at top level
    let result: any = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [
        {
          drawSize: 4,
          outcomes: [
            {
              drawPositions: [1, 2],
              roundNumber: 1,
              scoreString: '6-0 6-0',
              winningSide: 1,
            },
          ],
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const completedCount = matchUps.filter((m) => m.matchUpStatus === COMPLETED).length;
    expect(completedCount).toBe(matchUps.length);
  });

  it('publishes event when publish: true is specified', () => {
    let result: any = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [
        {
          drawSize: 4,
          publish: true,
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    const { event } = tournamentEngine.getEvent({ eventId: result.eventIds[0] });
    expect(event.timeItems?.length).toBeGreaterThan(0);
  });

  it('handles automated: false (manual draw positioning)', () => {
    let result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          automated: false,
          seedsCount: 2,
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const completedCount = matchUps.filter((m) => m.matchUpStatus === COMPLETED).length;
    expect(completedCount).toBe(0);
  });

  it('handles DOUBLES with drawExtensions and eventExtensions', () => {
    let result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          eventType: DOUBLES,
          drawExtensions: [{ name: 'doublesExt', value: 42 }],
          eventExtensions: [{ name: 'doublesEventExt', value: 'data' }],
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    const { event } = tournamentEngine.getEvent({ drawId: result.drawIds[0] });
    expect(event.eventType).toBe(DOUBLES);
  });

  it('handles completionGoal without completeAllMatchUps', () => {
    let result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          completionGoal: 3,
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const completedCount = matchUps.filter((m) => m.matchUpStatus === COMPLETED).length;
    expect(completedCount).toBe(3);
  });

  it('handles generate: false with DOUBLES eventType', () => {
    let result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          eventType: DOUBLES,
          generate: false,
          drawName: 'Doubles Flight',
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    const { event } = tournamentEngine.getEvent({ eventId: result.eventIds[0] });
    expect(event.drawDefinitions).toEqual([]);
    expect(event.eventType).toBe(DOUBLES);
  });

  it('handles multiple drawExtensions with invalid ones filtered', () => {
    let result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          drawExtensions: [
            { name: 'validExt', value: 'good' },
            { invalid: true } as any,
            { name: 'anotherValid', value: { nested: true } },
          ],
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: result.drawIds[0] });
    const names = (drawDefinition.extensions ?? []).map((extension: any) => extension.name);
    expect(names).toContain('validExt');
    expect(names).toContain('anotherValid');
    expect(names.filter((name: string) => !name)).toEqual([]);
  });

  it('handles AD_HOC with automated: false skipping iterative path', () => {
    // automated: false prevents iterativeAdHoc even with roundsCount > 1
    let result: any = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [
        {
          drawSize: 6,
          drawType: AD_HOC,
          roundsCount: 3,
          automated: false,
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    // automated: false means manual = true, which skips all completion
    const completedCount = matchUps.filter((m) => m.matchUpStatus === COMPLETED).length;
    expect(completedCount).toBe(0);
  });

  it('handles outcomes with roundPosition targeting', () => {
    let result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          outcomes: [
            {
              roundNumber: 1,
              roundPosition: 1,
              scoreString: '6-4 6-3',
              winningSide: 2,
            },
          ],
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();

    tournamentEngine.setState(result.tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const completedMatchUps = matchUps.filter((m) => m.matchUpStatus === COMPLETED);
    expect(completedMatchUps.length).toBe(1);
    expect(completedMatchUps[0].roundPosition).toBe(1);
  });
});
