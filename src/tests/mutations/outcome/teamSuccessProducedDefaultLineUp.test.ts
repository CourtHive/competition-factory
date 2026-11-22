import type { Tournament } from '@Types/tournamentTypes';
import { getTournamentRecords, setOutcomePipeline } from '@Global/state/globalState';
import { createSeededRandom } from '@Tools/prng';
import { setClock } from '@Tools/clock';
import engine from '@Engines/syncEngine';
import mocks from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

type Setup = 'produced default' | 'ordinary feeder' | 'no landing sides' | 'no draw line-ups';
const getRecord = () => Object.values(getTournamentRecords())[0] as Tournament;

function fixture(setup: Setup) {
  const random = Math.random;
  Math.random = createSeededRandom(1);
  try {
    engine.reset();
    setClock('2026-10-25T00:00:00.000Z');
    setOutcomePipeline('v1');
    const drawId = 'd';
    mocks.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawSize: 8,
          participantsCount: 7,
          eventType: 'TEAM',
          drawType: 'FEED_IN_CHAMPIONSHIP',
          tieFormatName: 'USTA_COLLEGE',
        },
      ],
      nonRandom: 1,
      setState: true,
    });
    if (setup !== 'no draw line-ups') {
      expect(engine.generateLineUps({ drawId, useDefaultEventRanking: true, attach: true }).success).toBe(true);
    }
    const structures = () => getRecord().events![0].drawDefinitions![0].structures!;
    const previous = structures()[0].matchUps!.find((m) => m.roundNumber === 1 && m.roundPosition === 3)!;
    expect(
      engine.setMatchUpStatus({
        drawId,
        matchUpId: previous.matchUpId,
        propagateExitStatus: true,
        outcome: { winningSide: 2, matchUpStatus: setup === 'ordinary feeder' ? 'COMPLETED' : 'DEFAULTED' },
      }).success,
    ).toBe(true);
    const stored = structuredClone(getRecord());
    const [main, consolation] = stored.events![0].drawDefinitions![0].structures!;
    const source = main.matchUps!.find((m) => m.roundNumber === 1 && m.roundPosition === 4)!;
    const recipient = consolation.matchUps!.find((m) => m.roundNumber === 2 && m.roundPosition === 2)!;
    if (setup !== 'no landing sides') {
      const storedSides = [
        { sideNumber: 1, drawPosition: 3, displaySideNumber: 1 },
        { sideNumber: 2, drawPosition: 7, displaySideNumber: 2 },
      ];
      recipient.sides = storedSides;
    }
    return { stored, drawId, matchUpId: source.matchUpId, recipientId: recipient.matchUpId };
  } finally {
    Math.random = random;
  }
}

afterEach(() => {
  setOutcomePipeline('v1');
  setClock();
});
it.each<Setup>(['produced default', 'ordinary feeder', 'no landing sides', 'no draw line-ups'])(
  'assigns the linked team line-up on %s',
  (setup) => {
    const { stored, drawId, matchUpId, recipientId } = fixture(setup);
    for (const mode of ['v1', 'v2', 'differential'] as const) {
      engine.setState(structuredClone(stored), true);
      setOutcomePipeline(mode);
      setClock('2026-10-26T00:00:00.000Z');
      const params = { drawId, matchUpId, propagateExitStatus: true, outcome: { winningSide: 2 } };
      expect(engine.setMatchUpStatus(params).success).toBe(true);
      const draw = getRecord().events![0].drawDefinitions![0];
      const next = draw.structures![1].matchUps!.find((m) => m.matchUpId === recipientId)!;
      const members = next.sides?.find((side) => side.sideNumber === 2)?.lineUp?.length ?? 0;
      expect(!!next.drawPositions?.includes(7)).toBe(setup !== 'ordinary feeder');
      expect(members).toBe(setup === 'produced default' ? 6 : 0);
    }
  },
);
