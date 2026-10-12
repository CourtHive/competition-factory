import { getMatchUpCheckInState } from '@Query/matchUp/getMatchUpCheckInState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { MATCHUP_NOT_FOUND, MISSING_MATCHUP, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { DOUBLES, TEAM } from '@Constants/eventConstants';

/**
 * getMatchUpCheckInState — who is at the desk for a matchUp, in one call.
 *
 * TMX derived this itself (`services/checkIn/checkInState.ts`) because the factory returned only ids;
 * the membership rule it copied (`getMatchUpParticipantIds`) was not exported. Both are exported now.
 */

function setup(drawProfile: any = { drawSize: 4 }) {
  mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });
  const matchUps: any[] = tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps ?? [];
  const firstRound = matchUps.find((m) => m.roundNumber === 1 && m.sides?.every((side: any) => side.participant));
  return { matchUps, firstRound };
}

const checkIn = (matchUp: any, participantId: string) =>
  tournamentEngine.checkInParticipant({ drawId: matchUp.drawId, matchUpId: matchUp.matchUpId, participantId });

const state = (matchUp: any) =>
  tournamentEngine.getMatchUpCheckInState({ drawId: matchUp.drawId, matchUpId: matchUp.matchUpId });

describe('getMatchUpCheckInState', () => {
  it('singles: one row per side, and the counts follow each check-in', () => {
    const { firstRound } = setup();
    let result: any = state(firstRound);
    expect(result.success).toEqual(true);
    expect(result.participants.map((p: any) => p.sideNumber)).toEqual([1, 2]);
    expect(result.participants.map((p: any) => p.participantName)).toEqual(
      firstRound.sides.map((side: any) => side.participant.participantName),
    );
    expect(result).toMatchObject({ total: 2, checkedInCount: 0, allCheckedIn: false, partial: false });

    const [first, second] = result.participants;
    expect(checkIn(firstRound, first.participantId).success).toEqual(true);
    result = state(firstRound);
    expect(result).toMatchObject({ total: 2, checkedInCount: 1, allCheckedIn: false, partial: true });
    expect(result.participants.find((p: any) => p.participantId === first.participantId).checkedIn).toEqual(true);

    expect(checkIn(firstRound, second.participantId).success).toEqual(true);
    expect(state(firstRound)).toMatchObject({ total: 2, checkedInCount: 2, allCheckedIn: true, partial: false });
  });

  it('doubles: the individuals of each pair, never the pair, with their side', () => {
    const { firstRound } = setup({ drawSize: 4, eventType: DOUBLES });
    const result: any = state(firstRound);
    const pairIds = firstRound.sides.map((side: any) => side.participant.participantId);
    expect(result.total).toEqual(4);
    expect(result.participants.some((p: any) => pairIds.includes(p.participantId))).toEqual(false);
    expect(result.participants.map((p: any) => p.sideNumber)).toEqual([1, 1, 2, 2]);

    // both of side 1 present: the pair is derived as checked in, but only individuals are counted
    for (const p of result.participants.filter((p: any) => p.sideNumber === 1)) checkIn(firstRound, p.participantId);
    const after: any = state(firstRound);
    expect(after).toMatchObject({ total: 4, checkedInCount: 2, partial: true, allCheckedIn: false });
  });

  it('team: every member of each team, listed once', () => {
    const { firstRound } = setup({ drawSize: 4, eventType: TEAM, tieFormatName: 'DOMINANT_DUO' });
    const result: any = state(firstRound);
    const members = firstRound.sides.flatMap((side: any) => side.participant.individualParticipants);
    expect(result.total).toEqual(members.length);
    expect(new Set(result.participants.map((p: any) => p.participantId)).size).toEqual(members.length);
  });

  it('a matchUp nobody has reached yet has no one to check in, and is not "all checked in"', () => {
    const { matchUps } = setup();
    const final = matchUps.find((m) => m.roundNumber === 2);
    expect(state(final)).toMatchObject({ participants: [], total: 0, checkedInCount: 0, allCheckedIn: false });
  });

  it('a matchUp with one participant so far lists that one', () => {
    const { matchUps, firstRound } = setup();
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
    tournamentEngine.setMatchUpStatus({ drawId: firstRound.drawId, matchUpId: firstRound.matchUpId, outcome });
    const final = matchUps.find((m) => m.roundNumber === 2);
    expect(state(final).total).toEqual(1);
  });

  it('takes a hydrated matchUp as well as ids, and agrees with getCheckedInParticipantIds', () => {
    const { firstRound } = setup();
    for (const side of firstRound.sides) checkIn(firstRound, side.participant.participantId);
    const { matchUp } = tournamentEngine.findMatchUp({ drawId: firstRound.drawId, matchUpId: firstRound.matchUpId });

    const fromMatchUp: any = tournamentEngine.getMatchUpCheckInState({ matchUp });
    expect(fromMatchUp).toEqual(state(firstRound));
    expect(fromMatchUp.allCheckedIn).toEqual(
      tournamentEngine.getCheckedInParticipantIds({ matchUp }).allParticipantsCheckedIn,
    );
  });

  it('never lists a PAIR as a person, even when its members were not hydrated', () => {
    setup();
    const matchUp: any = {
      matchUpId: 'm1',
      hasContext: true,
      sides: [
        { sideNumber: 1, participantId: 'pair', participant: { participantId: 'pair', participantType: 'PAIR' } },
        {
          sideNumber: 2,
          participantId: 'p2',
          participant: { participantId: 'p2', participantType: 'INDIVIDUAL', participantName: 'Two' },
        },
      ],
    };
    const result: any = tournamentEngine.getMatchUpCheckInState({ matchUp });
    expect(result.participants.map((p: any) => p.participantId)).toEqual(['p2']);
  });

  it('called directly, needs a record to find a matchUp, and reads a sideless one as empty', () => {
    expect(getMatchUpCheckInState({ matchUpId: 'm1' })).toEqual({ error: MISSING_TOURNAMENT_RECORD });
    const sideless: any = getMatchUpCheckInState({ matchUp: { matchUpId: 'm1', hasContext: true } as any });
    expect(sideless).toMatchObject({ participants: [], total: 0, allCheckedIn: false });
  });

  it('refuses a missing or unknown matchUp', () => {
    setup();
    expect(tournamentEngine.getMatchUpCheckInState({}).error).toEqual(MISSING_MATCHUP);
    expect(tournamentEngine.getMatchUpCheckInState({ matchUpId: 'nope' }).error).toEqual(MATCHUP_NOT_FOUND);
  });
});

describe('getMatchUpParticipantIds is exported', () => {
  it('names who may check in, the same set the check-in state lists', () => {
    const { firstRound } = setup({ drawSize: 4, eventType: DOUBLES });
    const { matchUp } = tournamentEngine.findMatchUp({ drawId: firstRound.drawId, matchUpId: firstRound.matchUpId });
    const result: any = tournamentEngine.getMatchUpParticipantIds({ matchUp });
    expect(result.success).toEqual(true);
    const byId = (a: string, b: string) => a.localeCompare(b);
    const listed = state(firstRound).participants.map((p: any) => p.participantId);
    expect([...result.individualParticipantIds].sort(byId)).toEqual([...listed].sort(byId));
    expect(result.sideParticipantIds).toHaveLength(2);
  });
});
