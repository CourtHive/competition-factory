import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { resolveTieFormat, tieFormatConstants } from '@courthive/competition-catalogue';
import { getTournamentRecords, setOutcomePipeline } from '@Global/state/globalState';
import mocks from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';
import { expect } from 'vitest';

// constants and types
import { MAIN, PLAY_OFF, ROUND_ROBIN_WITH_PLAYOFF, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import type { MatchUp, Tournament } from '@Types/tournamentTypes';

const { INTENNSE_2026 } = tieFormatConstants;

export const drawTypes = [SINGLE_ELIMINATION, ROUND_ROBIN_WITH_PLAYOFF] as const;

export function timedScore(matchUp: MatchUp) {
  const periods = matchUp.matchUpType === 'SINGLES' ? 2 : 1;
  return {
    winningSide: 2 as const,
    score: {
      sets: Array.from({ length: periods }, (_, i) => ({
        setNumber: i + 1,
        side1Score: 11,
        side2Score: 15,
        winningSide: 2 as const,
      })),
      scoreStringSide1: Array(periods).fill('11-15').join(' '),
      scoreStringSide2: Array(periods).fill('15-11').join(' '),
    },
  };
}

export function setupTimedPlayoff(drawType: (typeof drawTypes)[number]) {
  const linked = drawType === ROUND_ROBIN_WITH_PLAYOFF;
  const drawId = 'timed-playoff';
  setOutcomePipeline('v1');
  mocks.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
    drawProfiles: [
      {
        drawId,
        drawType,
        drawSize: linked ? 6 : 4,
        eventType: 'TEAM',
        teamGenders: { MALE: 3, FEMALE: 3 },
        tieFormat: resolveTieFormat(INTENNSE_2026),
        ...(linked && {
          structureOptions: { groupSize: 3, playoffGroups: [{ finishingPositions: [1, 2], structureName: 'Playoff' }] },
        }),
      },
    ],
    nonRandom: 2027,
    setState: true,
  });
  const structures = () =>
    (Object.values(getTournamentRecords())[0] as Tournament).events![0].drawDefinitions![0].structures!;
  const playoff = () => structures().find((s) => s.stage === (linked ? PLAY_OFF : MAIN))!;
  const matches = () => {
    const rounds = matchUpsOf(playoff())!;
    const final = rounds.find((m) => m.roundNumber === 2)!;
    const feeders = rounds.filter((m) => m.winnerMatchUpId === final.matchUpId);
    expect(feeders).toHaveLength(2);
    return [feeders[0], feeders[1], final] as const;
  };
  if (linked) {
    // Complete the source groups and use the factory's actual positioning link to fill the playoff.
    expect(positionAssignmentsOf(playoff())?.some((seat) => seat.participantId)).toBe(false);
    const groupMatches = engine.allDrawMatchUps({
      drawId,
      inContext: true,
      matchUpFilters: { matchUpTypes: ['TEAM'] },
      contextFilters: { stages: [MAIN] },
    }).matchUps;
    expect(groupMatches.length).toBeGreaterThan(0);
    for (const group of groupMatches) {
      const winningSide = group.drawPositions![0] < group.drawPositions![1] ? 1 : 2;
      expect(engine.setMatchUpStatus({ drawId, matchUpId: group.matchUpId, outcome: { winningSide } }).success).toBe(
        true,
      );
    }
    const structureId = structures().find((s) => s.stage === MAIN)!.structureId;
    expect(engine.automatedPlayoffPositioning({ drawId, structureId }).success).toBe(true);
  }
  const occupied = positionAssignmentsOf(playoff())!
    .map((seat) => seat.participantId)
    .filter(Boolean);
  expect(new Set(occupied).size).toBe(4);
  expect(engine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success).toBe(true);
  return { drawId, matches };
}
