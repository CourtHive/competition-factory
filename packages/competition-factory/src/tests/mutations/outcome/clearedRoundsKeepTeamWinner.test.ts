import { getOutcomePipeline, getTournamentRecords, setOutcomePipeline } from '@Global/state/globalState';
import { resolveTieFormat } from '@courthive/competition-catalogue';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import type { MatchUp, Tournament } from '@Types/tournamentTypes';
import { afterAll, beforeAll, expect, it } from 'vitest';
import mocks from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';

const drawId = 'team-path';
const record = () => Object.values(getTournamentRecords())[0] as Tournament;
const matches = (tournament: Tournament) => matchUpsOf(tournament.events![0].drawDefinitions![0].structures![0])!;
const saved = () => JSON.stringify(record());
const entryPipeline = getOutcomePipeline();
let initial: string;
let clearIds: string[];
let parentId: string;
let lineId: string;
let initialRecipientSeats: number[];

beforeAll(() => {
  mocks.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 128, eventType: 'TEAM', tieFormat: resolveTieFormat('DOMINANT_DUO') }],
    nonRandom: 21,
    setState: true,
  });
  expect(engine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success).toBe(true);
  const duals = matches(record());
  const at = (round: number, position: number) =>
    duals.find((match) => match.roundNumber === round && match.roundPosition === position)!;
  // Model a completed imported draw. Each onward seat comes from its actual feeder's stored winner.
  const path = [at(1, 33), at(2, 17), at(3, 9), at(4, 5), at(5, 3), at(6, 2), at(7, 1)];
  const winners = new Map(path.map((match, index) => [match, [2, 2, 2, 1, 1, 2, 1][index]]));
  const winnerPosition = (match: MatchUp) => match.drawPositions![match.winningSide! - 1]!;
  for (let round = 1; round <= 7; round++) {
    for (const match of duals.filter((dual) => dual.roundNumber === round)) {
      if (round > 1) {
        const even = 2 * match.roundPosition!;
        match.drawPositions = [winnerPosition(at(round - 1, even - 1)), winnerPosition(at(round - 1, even))];
      }
      match.matchUpStatus = 'COMPLETED';
      match.winningSide = winners.get(match) ?? 1;
    }
  }
  const [parent, receiver] = path;
  const lines = parent.tieMatchUps!;
  const line = lines.find((item) => item.matchUpType === 'DOUBLES')!;
  for (const item of lines) {
    item.matchUpStatus = 'COMPLETED';
    item.winningSide = item === line ? 1 : 2;
  }
  Object.assign(line, {
    roundNumber: parent.roundNumber,
    roundPosition: parent.roundPosition,
    drawPositions: [...parent.drawPositions!],
  });
  clearIds = path
    .slice(1)
    .reverse()
    .map((dual) => dual.matchUpId);
  parentId = parent.matchUpId;
  lineId = line.matchUpId;
  initialRecipientSeats = [...receiver.drawPositions!] as number[];
  initial = saved();
});
afterAll(() => setOutcomePipeline(entryPipeline));

it.each(['v1', 'v2', 'differential'] as const)(
  '%s preserves the seated team after six clears and a doubles correction on a reloaded draw',
  (mode) => {
    setOutcomePipeline(mode);
    expect(engine.setState(JSON.parse(initial)).success).toBe(true);
    const submit = (matchUpId: string, outcome: Pick<MatchUp, 'matchUpStatus' | 'winningSide' | 'score'>) => {
      const result = engine.setMatchUpStatus({ drawId, matchUpId, outcome, allowChangePropagation: true });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      expect(engine.setState(JSON.parse(saved())).success).toBe(true);
    };
    for (const matchUpId of clearIds) submit(matchUpId, { matchUpStatus: 'TO_BE_PLAYED' });
    const receiverSeats = () => matches(record()).find((m) => m.matchUpId === clearIds.at(-1))!.drawPositions;
    expect(receiverSeats()).toEqual(initialRecipientSeats);
    submit(lineId, {
      matchUpStatus: 'COMPLETED',
      winningSide: 2,
      score: { sets: [{ setNumber: 1, side1Score: 2, side2Score: 8, winningSide: 2 }] },
    });
    const parent = matches(record()).find((match) => match.matchUpId === parentId)!;
    expect(parent.tieMatchUps!.find((line) => line.matchUpId === lineId)!.winningSide).toBe(2);
    expect(parent.winningSide).toBe(2);
    expect(receiverSeats()).toEqual(initialRecipientSeats);
    submit(parentId, { matchUpStatus: 'WALKOVER', winningSide: 2 });
    expect(receiverSeats()).toEqual(initialRecipientSeats);
  },
);
