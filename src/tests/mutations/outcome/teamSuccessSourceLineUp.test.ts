import type { Tournament } from '@Types/tournamentTypes';
import { afterEach, expect, it } from 'vitest';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { getTournamentRecords, setOutcomePipeline } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { createSeededRandom } from '@Tools/prng';
import { setClock } from '@Tools/clock';

function fixture(creditByCall: boolean, explicitLineUp: boolean) {
  setOutcomePipeline('v1');
  setClock('2026-01-01T00:00:00.000Z');
  const random = Math.random;
  Math.random = createSeededRandom(1);
  try {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: 'TEAM', tieFormatName: 'DOMINANT_DUO', drawId: 'd' }],
      setState: true,
      nonRandom: 1,
    });
    expect(tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd' }).success).toBe(
      true,
    );
    const current = () => Object.values(getTournamentRecords())[0] as Tournament;
    const stored = current().events![0].drawDefinitions![0].structures![0].matchUps!;
    const semi = stored.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
    const credit = { matchUpStatus: 'WALKOVER', winningSide: 1 } as const;
    if (creditByCall) {
      expect(
        tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: semi.tieMatchUps![0].matchUpId, outcome: credit })
          .success,
      ).toBe(true);
    } else {
      Object.assign(semi.tieMatchUps![0], credit);
      if (explicitLineUp) {
        const draw = current().events![0].drawDefinitions![0];
        const position = semi.drawPositions![0];
        const team = draw.structures![0].positionAssignments!.find((a) => a.drawPosition === position)!.participantId!;
        semi.sides ??= [{ sideNumber: 1 }, { sideNumber: 2 }];
        semi.sides.find((s) => s.sideNumber === 1)!.lineUp = structuredClone(draw.lineUps![team]);
      }
    }
    return { record: structuredClone(current()), target: semi.tieMatchUps![1].matchUpId, final: semi.winnerMatchUpId };
  } finally {
    Math.random = random;
  }
}

afterEach(() => {
  setOutcomePipeline('v1');
  setClock();
});
it.each([
  { creditByCall: false, explicitLineUp: false, expectsCarry: false },
  { creditByCall: false, explicitLineUp: true, expectsCarry: true },
  { creditByCall: true, explicitLineUp: false, expectsCarry: true },
])(
  'carries only the source line-up on a clinch ($creditByCall, $explicitLineUp)',
  ({ creditByCall, explicitLineUp, expectsCarry }) => {
    const given = fixture(creditByCall, explicitLineUp);
    const { outcome } = generateOutcomeFromScoreString({ scoreString: '6-2 6-2', winningSide: 1 });
    for (const mode of ['v1', 'v2', 'differential'] as const) {
      tournamentEngine.setState(structuredClone(given.record));
      setOutcomePipeline(mode);
      const result = tournamentEngine.executionQueue(
        [{ method: 'setMatchUpStatus', params: { drawId: 'd', matchUpId: given.target, outcome } }],
        false,
      );
      expect(result.success).toBe(true);
      const stored = tournamentEngine
        .getEvent({ drawId: 'd' })
        .drawDefinition.structures![0].matchUps!.find((m) => m.matchUpId === given.final)!;
      expect(Object.hasOwn(stored, 'sides')).toBe(expectsCarry);
      if (expectsCarry) expect(stored.sides?.find((side) => side.sideNumber === 1)?.lineUp?.length).toBeGreaterThan(0);
    }
  },
);
