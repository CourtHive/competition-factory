import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import scaleEngine from '@Engines/scaleEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLES_EVENT } from '@Constants/eventConstants';
import { RATING } from '@Constants/scaleConstants';
import { ELO } from '@Constants/ratingConstants';

// a run carries each rating forward from matchUp to matchUp, whether or not it writes them (the final's winner kept
// only the final's delta); a pair is rated as its players' average and each player moves against it (UTR's published
// practice; RATINGS_POLICY_PLAN § 2.3), where the pair and each player were rated pairwise against every opponent

const outcomes = [
  { roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-2', winningSide: 1 },
  { roundNumber: 1, roundPosition: 2, scoreString: '6-1 6-2', winningSide: 1 },
  { roundNumber: 2, roundPosition: 1, scoreString: '6-4 3-6 6-2', winningSide: 1 },
];

function sortedRatings(baseRecord: any, updateParticipantRatings: boolean) {
  tournamentEngine.setState(makeDeepCopy(baseRecord));
  const matchUpIds = tournamentEngine.allTournamentMatchUps().matchUps.map((matchUp) => matchUp.matchUpId);
  const result: any = scaleEngine.generateDynamicRatings({ matchUpIds, updateParticipantRatings });
  expect(result.success).toEqual(true);
  return Object.values(result.modifiedScaleValues)
    .map((value: any) => value.scaleValue)
    .sort((a: number, b: number) => a - b);
}

it('carries each rating through the run, whether or not the run writes them', () => {
  const baseRecord = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, outcomes }],
  }).tournamentRecord;

  // round 1: 1500 → 1513 / 1488 (25 × 0.5); the final between 1513s, won in three sets: 25 × (2/3 − 1/2) ≈ 4.17
  expect(sortedRatings(baseRecord, false)).toEqual([1488, 1488, 1509, 1517]);
  expect(sortedRatings(baseRecord, true)).toEqual([1488, 1488, 1509, 1517]);
});

function doublesMatchUp(ratings?: Record<number, number>) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 2,
        eventType: DOUBLES_EVENT,
        outcomes: [{ roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-2', winningSide: 1 }],
      },
    ],
  });
  tournamentEngine.setState(tournamentRecord);
  const matchUp = tournamentEngine.allTournamentMatchUps().matchUps[0];
  const players = matchUp.sides.flatMap((side) => side.participant.individualParticipantIds);
  Object.entries(ratings ?? {}).forEach(([index, scaleValue]) =>
    tournamentEngine.setParticipantScaleItem({
      participantId: players[Number(index)],
      scaleItem: { scaleType: RATING, eventType: DOUBLES_EVENT, scaleName: ELO, scaleValue },
    }),
  );
  const result: any = scaleEngine.generateDynamicRatings({ matchUpIds: [matchUp.matchUpId] });
  const pairIds = matchUp.sides.map((side) => side.participantId);
  return { result, players, pairIds };
}

it('rates the players of a pair, not the pair, and both partners move by the same amount', () => {
  const { result, players, pairIds } = doublesMatchUp();
  expect(players.map((id) => result.modifiedScaleValues[id].scaleValue)).toEqual([1513, 1513, 1488, 1488]);
  pairIds.forEach((pairId) => expect(result.modifiedScaleValues[pairId]).toBeUndefined());
});

it("rates a pair as its players' average: 1600 and 1400 play as 1500", () => {
  const { result, players } = doublesMatchUp({ 0: 1600, 1: 1400 });
  expect(players.map((id) => result.modifiedScaleValues[id].scaleValue)).toEqual([1613, 1413, 1488, 1488]);
});
