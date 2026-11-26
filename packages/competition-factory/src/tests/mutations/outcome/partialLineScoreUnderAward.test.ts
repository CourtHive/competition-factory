import { setOutcomePipeline } from '@Global/state/globalState';
import { tieFormats } from '@courthive/competition-catalogue';
import { afterEach, expect, it } from 'vitest';
import mocks from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';

const format = tieFormats.INTENNSE_2026;

afterEach(() => setOutcomePipeline('v1'));

it.each([
  { award: true, explicitStatus: false },
  { award: true, explicitStatus: true },
  { award: false, explicitStatus: false },
])('keeps a partial BOLT score (award $award, explicit status $explicitStatus)', ({ award, explicitStatus }) => {
  const drawId = 'playoff';
  const matches = () => engine.getTournament().tournamentRecord!.events![0].drawDefinitions![0].structures[0].matchUps!;
  setOutcomePipeline('v1');
  mocks.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
    drawProfiles: [
      {
        drawId,
        drawSize: 4,
        eventType: 'TEAM',
        teamGenders: { MALE: 3, FEMALE: 3 },
        tieFormat: structuredClone(format),
      },
    ],
    nonRandom: 2027,
    setState: true,
  });
  expect(engine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success).toBe(true);
  const [semi] = matches();
  const line = semi.tieMatchUps!.find((m) => m.matchUpType === 'SINGLES')!;
  if (award) {
    expect(
      engine.setMatchUpStatus({
        drawId,
        matchUpId: semi.matchUpId,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
      }).success,
    ).toBe(true);
  }
  const entry = structuredClone(engine.getTournament().tournamentRecord!);
  const set = { setNumber: 1, side1Score: 7, side2Score: 6 };
  const outcome = { score: { sets: [set] }, ...(explicitStatus ? { matchUpStatus: 'IN_PROGRESS' as const } : {}) };
  for (const mode of ['v1', 'v2', 'differential'] as const) {
    expect(engine.setState(structuredClone(entry)).success).toBe(true);
    setOutcomePipeline(mode);
    expect(
      engine.setMatchUpStatus({ drawId, matchUpId: line.matchUpId, outcome: structuredClone(outcome) }).success,
    ).toBe(true);
    const [parent, , final] = matches();
    const stored = parent.tieMatchUps!.find((m) => m.matchUpId === line.matchUpId)!;
    expect(stored).toMatchObject({
      matchUpStatus: 'IN_PROGRESS',
      score: { scoreStringSide1: '7-6', scoreStringSide2: '6-7', sets: [set] },
    });
    expect(stored.winningSide).toBeUndefined();
    expect(stored.schedule?.scoredTime).toBeTruthy();
    expect(parent.winningSide).toBe(award ? 2 : undefined);
    if (award) expect(parent.matchUpStatus).toBe('WALKOVER');
    expect(final.drawPositions).toEqual(award ? [2] : []);
  }
});
