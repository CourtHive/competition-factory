import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { BALL_ABUSE, EQUIPMENT_VIOLATION, NO_SHOW, PUNCTUALITY } from '@Constants/penaltyConstants';

/**
 * THE PENALTY QUERIES RETURN CODES (CA, 2026-10-18: "getTournamentPenalties is @query so it shouldn't change the
 * source - but I don't see a problem normalizing the output"). Migration is opt-in, so an unmigrated record can still
 * store a pre-7.x display label; the query normalises it in its result and leaves the record as it is.
 *
 * And a penalty issued to two participants is returned once with both `participantIds`: the query pushed the second
 * participant onto `participants`, a field the result does not have, so it threw.
 */

function unmigratedRecord() {
  const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 2 },
  });
  const [first, second] = tournamentRecord.participants;
  first.penalties = [
    { penaltyId: 'p1', penaltyType: 'Ball Abuse' },
    { penaltyId: 'p2', penaltyType: 'Puncuality' },
    { penaltyId: 'p3', penaltyType: NO_SHOW },
  ];
  second.penalties = [
    { penaltyId: 'p4', penaltyType: 'EQUIMENT_VIOLATION' },
    { penaltyId: 'p5', penaltyType: 'SHOT_CLOCK_VIOLATION' },
  ];
  tournamentEngine.setState(tournamentRecord);
  return tournamentRecord;
}

const typesById = (penalties: any[]) =>
  Object.fromEntries(penalties.map((penalty) => [penalty.penaltyId, penalty.penaltyType]));

describe('legacy penalty labels are returned as codes, and the record is not changed', () => {
  useEngineCatch();

  const expected = {
    p1: BALL_ABUSE,
    p2: PUNCTUALITY,
    p3: NO_SHOW,
    p4: EQUIPMENT_VIOLATION,
    p5: 'SHOT_CLOCK_VIOLATION', // outside the legacy map: as stored
  };

  it('getTournamentPenalties', () => {
    unmigratedRecord();
    const result: any = tournamentEngine.getTournamentPenalties();
    expect(typesById(result.penalties)).toEqual(expected);

    const stored = tournamentEngine.getTournament().tournamentRecord.participants.flatMap((p: any) => p.penalties);
    expect(typesById(stored)).toEqual({ ...expected, p1: 'Ball Abuse', p2: 'Puncuality', p4: 'EQUIMENT_VIOLATION' });
  });

  it('getCompetitionPenalties', () => {
    unmigratedRecord();
    const result: any = tournamentEngine.getCompetitionPenalties();
    expect(typesById(result.penalties)).toEqual(expected);
  });
});

it('a penalty issued to two participants is returned once, with both participantIds', () => {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 2 }, setState: true });
  const participantIds = tournamentEngine.getParticipants().participants.map((p: any) => p.participantId);
  const added: any = tournamentEngine.addPenalty({ penaltyType: BALL_ABUSE, participantIds });
  expect(added.success).toEqual(true);

  const result: any = tournamentEngine.getTournamentPenalties();
  expect(result.error).toBeUndefined();
  expect(result.penalties).toHaveLength(1);
  expect(result.penalties[0].participantIds.toSorted()).toEqual(participantIds.toSorted());
});
