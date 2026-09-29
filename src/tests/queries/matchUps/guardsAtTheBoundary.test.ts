import { getCheckedInParticipantIds } from '@Query/matchUp/getCheckedInParticipantIds';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { validateSchedulingProfile } from '@Validators/validateSchedulingProfile';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_MATCHUP, MISSING_CONTEXT, MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { INVALID_VALUES, VENUE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DOUBLES } from '@Constants/eventConstants';

/**
 * WHAT IS REFUSED AT THE BOUNDARY, and what it is refused with.
 *
 * A caller that passes the wrong thing should be told which thing. Each of these returns a named
 * error or a plain `false` rather than throwing, and nothing pinned that they do.
 */

describe('getCheckedInParticipantIds', () => {
  it('names what is missing', () => {
    expect((getCheckedInParticipantIds({ matchUp: undefined as any }) as any).error).toEqual(MISSING_MATCHUP);
    expect((getCheckedInParticipantIds({ matchUp: { matchUpId: 'm' } as any }) as any).error).toEqual(MISSING_CONTEXT);
    expect(
      (getCheckedInParticipantIds({ matchUp: { matchUpId: 'm', hasContext: true, sides: [{}] } as any }) as any).error,
    ).toEqual(INVALID_MATCHUP);
  });

  it('counts a pair as checked in once both of its individuals are', () => {
    const drawId = 'doubles';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, eventType: DOUBLES }],
      setState: true,
    });
    const hydrated = () =>
      (tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? []).find(
        (matchUp: any) => matchUp.roundNumber === 1 && matchUp.roundPosition === 1,
      ) as any;

    const matchUp = hydrated();
    const pair = matchUp.sides[0].participant;
    const individualIds: string[] = pair.individualParticipantIds;
    expect(individualIds.length).toEqual(2);

    // CONTROL: one of two is not the pair
    let result: any = tournamentEngine.checkInParticipant({
      participantId: individualIds[0],
      matchUpId: matchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(getCheckedInParticipantIds({ matchUp: hydrated() }).checkedInParticipantIds).not.toContain(
      pair.participantId,
    );

    result = tournamentEngine.checkInParticipant({
      participantId: individualIds[1],
      matchUpId: matchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    const checkedIn = getCheckedInParticipantIds({ matchUp: hydrated() });
    expect(checkedIn.checkedInParticipantIds).toContain(pair.participantId);
    // and the other side has not arrived
    expect(checkedIn.allParticipantsCheckedIn).toEqual(false);
  });
});

describe('validateSchedulingProfile', () => {
  const scheduleDate = '2026-10-01';
  const tournamentRecords = () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueId: 'venue', courtsCount: 2 }],
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });
    const { tournamentRecord }: any = tournamentEngine.getTournament();
    return { [tournamentRecord.tournamentId]: tournamentRecord };
  };

  it('accepts no profile at all, and refuses one that is not an array', () => {
    expect(
      validateSchedulingProfile({ tournamentRecords: tournamentRecords(), schedulingProfile: undefined }).valid,
    ).toEqual(true);
    const result = validateSchedulingProfile({ tournamentRecords: tournamentRecords(), schedulingProfile: {} });
    expect(result.valid).toEqual(false);
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('refuses rounds that are not an array', () => {
    const result = validateSchedulingProfile({
      schedulingProfile: [{ scheduleDate, venues: [{ venueId: 'venue', rounds: 'first' }] }],
      tournamentRecords: tournamentRecords(),
    });
    expect(result.valid).toEqual(false);
    expect(result.info).toEqual('rounds should be an array');
  });

  it('refuses a venue the tournament does not have', () => {
    const result = validateSchedulingProfile({
      schedulingProfile: [{ scheduleDate, venues: [{ venueId: 'elsewhere', rounds: [] }] }],
      tournamentRecords: tournamentRecords(),
    });
    expect(result.valid).toEqual(false);
    expect(result.error).toEqual(VENUE_NOT_FOUND);
  });

  it('refuses an empty round', () => {
    const result = validateSchedulingProfile({
      schedulingProfile: [{ scheduleDate, venues: [{ venueId: 'venue', rounds: [undefined] }] }],
      tournamentRecords: tournamentRecords(),
    });
    expect(result.valid).toEqual(false);
    expect(result.info).toEqual('empty round');
  });
});

describe('checkRequiredParameters', () => {
  it('refuses a requirement list that is not a list', () => {
    expect(checkRequiredParameters({ drawId: 'd' }, 'drawId' as any).error).toEqual(INVALID_VALUES);
  });

  it('refuses params that are not an object', () => {
    expect(checkRequiredParameters(undefined as any, [{ drawId: true }]).error).toEqual(INVALID_VALUES);
  });
});
