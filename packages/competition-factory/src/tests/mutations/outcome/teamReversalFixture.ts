import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { getTournamentRecords, setOutcomePipeline } from '@Global/state/globalState';
import { resolveTieFormat } from '@courthive/competition-catalogue';
import { createSeededRandom } from '@Tools/prng';
import mocks from '@Assemblies/engines/mock';
import { createHash } from 'node:crypto';
import engine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';
import { expect } from 'vitest';

import type { Tournament } from '@Types/tournamentTypes';

const drawId = 'd';
const raw = () => Object.values(getTournamentRecords())[0] as Tournament;
const draw = () => raw().events![0].drawDefinitions![0];
const back = () => draw().structures!.find((s) => s.stage === 'CONSOLATION')!;
const main = () => draw().structures!.find((s) => s.stage === 'MAIN')!;
const dual = (round: number, pos: number) =>
  matchUpsOf(main())!.find((m) => m.roundNumber === round && m.roundPosition === pos)!;
const side2 = (scoreString = '6-1 6-1') => generateOutcomeFromScoreString({ winningSide: 2, scoreString }).outcome;
const digest = () => createHash('sha256').update(JSON.stringify(getTournamentRecords())).digest('hex');
function summary() {
  const parent = dual(1, 3),
    semi = dual(2, 2);
  const team5 = positionAssignmentsOf(main())!.find((a) => a.drawPosition === 5)!.participantId;
  const team6 = positionAssignmentsOf(main())!.find((a) => a.drawPosition === 6)!.participantId;
  const backSeats = (participantId: string | undefined) =>
    positionAssignmentsOf(back())!
      .filter((a) => a.participantId === participantId)
      .map((a) => a.drawPosition);
  return {
    line: [parent.tieMatchUps![1].matchUpStatus, parent.tieMatchUps![1].winningSide ?? null],
    parent: [parent.matchUpStatus, parent.winningSide ?? null],
    semifinal: [semi.matchUpStatus, semi.winningSide ?? null],
    semifinalSeats: [...semi.drawPositions!],
    finalSeats: [...dual(3, 1).drawPositions!],
    backdrawTeam5: backSeats(team5),
    backdrawTeam6: backSeats(team6),
  };
}
function fixture(played: boolean) {
  const previous = Math.random;
  setOutcomePipeline('v1');
  setClock('2026-01-01T00:00:00.000Z');
  try {
    Math.random = createSeededRandom(145);
    mocks.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawType: 'DOUBLE_ELIMINATION',
          drawSize: 8,
          eventType: 'TEAM',
          tieFormat: resolveTieFormat('DOMINANT_DUO'),
        },
      ],
      nonRandom: 145,
      setState: true,
    });
    expect(engine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success).toBe(true);
    expect(
      engine.setMatchUpStatus({
        drawId,
        matchUpId: dual(1, 3).matchUpId,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      }).success,
    ).toBe(true);
    expect(
      engine.setMatchUpStatus({ drawId, matchUpId: dual(1, 4).matchUpId, outcome: { winningSide: 2 } }).success,
    ).toBe(true);
    if (played) {
      expect(
        engine.setMatchUpStatus({
          drawId,
          matchUpId: dual(2, 2).matchUpId,
          outcome: { ...side2('6-1 2-1'), matchUpStatus: 'RETIRED' },
        }).success,
      ).toBe(true);
    }
    expect(
      engine.setMatchUpStatus({ drawId, matchUpId: dual(1, 3).tieMatchUps![2].matchUpId, outcome: side2() }).success,
    ).toBe(true);
    return structuredClone(raw());
  } finally {
    Math.random = previous;
  }
}

export { digest, drawId, dual, fixture, side2, summary };
