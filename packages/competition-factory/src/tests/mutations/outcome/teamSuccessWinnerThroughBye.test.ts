import { getTournamentRecords } from '@Global/state/globalState';
import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { resolveTieFormat } from '@courthive/competition-catalogue';
import type { Tournament } from '@Types/tournamentTypes';
import { afterEach, expect, it } from 'vitest';
import mocks from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';

afterEach(() => setOutcomePipeline('v1'));

it.each([true, false])('reassigns a winner passing through a BYE with a draw line-up present: %s', (hasLineUp) => {
  setOutcomePipeline('v1');
  mocks.generateTournamentRecord({
    drawProfiles: [
      {
        drawId: 'd',
        drawSize: 8,
        participantsCount: 6,
        eventType: 'TEAM',
        tieFormat: resolveTieFormat('DOMINANT_DUO'),
      },
    ],
    nonRandom: 1,
    setState: true,
  });
  expect(engine.generateLineUps({ drawId: 'd', useDefaultEventRanking: true, attach: true }).success).toBe(true);
  const current = () => Object.values(getTournamentRecords())[0] as Tournament;
  const stored = structuredClone(current());
  const draw = stored.events![0].drawDefinitions![0];
  const bracket = draw.structures![0];
  const source = bracket.matchUps!.find((m) => m.roundNumber === 1 && m.roundPosition === 2)!;
  const through = bracket.matchUps!.find((m) => m.matchUpId === source.winnerMatchUpId)!;
  const onward = bracket.matchUps!.find((m) => m.matchUpId === through.winnerMatchUpId)!;
  const winner = source.drawPositions![0];
  const bye = bracket.positionAssignments!.find((a) => a.bye)!.drawPosition;
  Object.assign(source.tieMatchUps![1], { matchUpStatus: 'DEFAULTED', winningSide: 1 });
  Object.assign(through, { matchUpStatus: 'BYE', drawPositions: [bye, winner] });
  onward.drawPositions = [winner];
  const teamId = bracket.positionAssignments!.find((a) => a.drawPosition === winner)!.participantId!;
  const expected = hasLineUp ? draw.lineUps![teamId] : undefined;
  if (!hasLineUp) {
    // Keep the source lines scoreable while removing the draw's fallback at the destination.
    source.sides = source.drawPositions!.map((position, index) => {
      const team = bracket.positionAssignments!.find((side) => side.drawPosition === position)!.participantId!;
      return { sideNumber: index + 1, lineUp: structuredClone(draw.lineUps![team]) };
    });
    delete draw.lineUps;
  }

  for (const mode of ['v1', 'v2', 'differential'] as const) {
    engine.setState(structuredClone(stored));
    setOutcomePipeline(mode);
    const result = engine.setMatchUpStatus({
      drawId: 'd',
      matchUpId: source.tieMatchUps![2].matchUpId,
      outcome: { winningSide: 1 },
    });
    expect(result.success).toBe(true);
    const target = current().events![0].drawDefinitions![0].structures![0].matchUps!.find(
      (m) => m.matchUpId === onward.matchUpId,
    )!;
    expect(target.drawPositions).toContain(winner);
    expect(target.sides?.map((side) => side.sideNumber)).toEqual([1, 2]);
    const assigned = target.sides!.find((side) => Object.hasOwn(side, 'lineUp'));
    expect(assigned).toBeDefined();
    expect(assigned!.lineUp).toEqual(expected);
  }
});
