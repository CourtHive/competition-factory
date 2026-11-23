import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_PARTICIPANT_TYPE, INVALID_VALUES, VENUE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { INDIVIDUAL, TEAM as TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { NONE, VENUE } from '@Constants/homeParticipantConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM } from '@Constants/matchUpTypes';

const HOME_VENUE_ID = 'homeVenue';
const AWAY_VENUE_ID = 'awayVenue';
const DRAW_ID = 'dualDraw';

/**
 * `modifyParticipant` returned success and dropped `homeVenueIds`, `participantStatus`, `representing` and
 * `useOtherName`: no engine method could write them. They are written now, and an invalid value is refused.
 */
function setup() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: DRAW_ID, drawSize: 2, eventType: TEAM_EVENT }],
    venueProfiles: [
      { venueId: HOME_VENUE_ID, courtsCount: 2 },
      { venueId: AWAY_VENUE_ID, courtsCount: 2 },
    ],
    setState: true,
  });
  const dual = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM] } }).matchUps[0];
  const sideIds = dual.sides.map((side) => side.participantId);
  return { matchUpId: dual.matchUpId, sideIds };
}

function getParticipant(participantId: string) {
  return tournamentEngine.getParticipants({ participantFilters: { participantIds: [participantId] } }).participants[0];
}

describe('modifyParticipant homeVenueIds', () => {
  it("writes a TEAM's homeVenueIds, and resolveHomeParticipantId then names it home at that venue", () => {
    const { matchUpId, sideIds } = setup();

    let result: any = tournamentEngine.resolveHomeParticipantId({ drawId: DRAW_ID, matchUpId });
    expect(result.basis).toEqual(NONE);

    result = tournamentEngine.modifyParticipant({
      participant: { participantId: sideIds[1], homeVenueIds: [HOME_VENUE_ID] },
    });
    expect(result.success).toEqual(true);
    expect(result.participant.homeVenueIds).toEqual([HOME_VENUE_ID]);
    expect(getParticipant(sideIds[1]).homeVenueIds).toEqual([HOME_VENUE_ID]);

    result = tournamentEngine.assignMatchUpVenue({ matchUpId, drawId: DRAW_ID, venueId: HOME_VENUE_ID });
    expect(result.success).toEqual(true);

    result = tournamentEngine.resolveHomeParticipantId({ drawId: DRAW_ID, matchUpId });
    expect(result.success).toEqual(true);
    expect(result.basis).toEqual(VENUE);
    expect(result.homeParticipantId).toEqual(sideIds[1]);

    // at the other venue neither team is at home
    result = tournamentEngine.assignMatchUpVenue({ matchUpId, drawId: DRAW_ID, venueId: AWAY_VENUE_ID });
    expect(result.success).toEqual(true);
    result = tournamentEngine.resolveHomeParticipantId({ drawId: DRAW_ID, matchUpId });
    expect(result.basis).toEqual(NONE);
  });

  it('refuses a venueId that is not a venue of the tournament, and writes nothing', () => {
    const { sideIds } = setup();
    let result: any = tournamentEngine.modifyParticipant({
      participant: { participantId: sideIds[0], homeVenueIds: [HOME_VENUE_ID, 'nowhere'], participantName: 'Renamed' },
    });
    expect(result.error).toEqual(VENUE_NOT_FOUND);
    expect(result.venueIds).toEqual(['nowhere']);
    const team = getParticipant(sideIds[0]);
    expect(team.homeVenueIds).toBeUndefined();
    expect(team.participantName).not.toEqual('Renamed');
  });

  it('refuses a value that is not an array of venueIds', () => {
    const { sideIds } = setup();
    let result: any = tournamentEngine.modifyParticipant({
      participant: { participantId: sideIds[0], homeVenueIds: HOME_VENUE_ID },
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('refuses homeVenueIds on a participant that is not a TEAM', () => {
    setup();
    const individual = tournamentEngine.getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } })
      .participants[0];
    let result: any = tournamentEngine.modifyParticipant({
      participant: { participantId: individual.participantId, homeVenueIds: [HOME_VENUE_ID] },
    });
    expect(result.error).toEqual(INVALID_PARTICIPANT_TYPE);
  });

  it('[] clears, duplicates collapse, and undefined leaves the stored list alone', () => {
    const { sideIds } = setup();
    let result: any = tournamentEngine.modifyParticipant({
      participant: { participantId: sideIds[0], homeVenueIds: [HOME_VENUE_ID, HOME_VENUE_ID, AWAY_VENUE_ID] },
    });
    expect(result.success).toEqual(true);
    expect(getParticipant(sideIds[0]).homeVenueIds).toEqual([HOME_VENUE_ID, AWAY_VENUE_ID]);

    result = tournamentEngine.modifyParticipant({ participant: { participantId: sideIds[0], participantName: 'X' } });
    expect(result.success).toEqual(true);
    expect(getParticipant(sideIds[0]).homeVenueIds).toEqual([HOME_VENUE_ID, AWAY_VENUE_ID]);

    result = tournamentEngine.modifyParticipant({ participant: { participantId: sideIds[0], homeVenueIds: [] } });
    expect(result.success).toEqual(true);
    expect(getParticipant(sideIds[0]).homeVenueIds).toBeUndefined();
  });

  it('a whole-participant save that sends back a since-deleted home venue is not refused', () => {
    const { sideIds } = setup();
    let result: any = tournamentEngine.modifyParticipant({
      participant: { participantId: sideIds[0], homeVenueIds: [AWAY_VENUE_ID] },
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.deleteVenue({ venueId: AWAY_VENUE_ID, force: true });
    expect(result.success).toEqual(true);

    const team = getParticipant(sideIds[0]);
    result = tournamentEngine.modifyParticipant({ participant: { ...team, participantOtherName: 'Hosts' } });
    expect(result.success).toEqual(true);
    expect(getParticipant(sideIds[0]).participantOtherName).toEqual('Hosts');
  });
});

describe('modifyParticipant attributes that had no write path', () => {
  it('writes useOtherName, participantStatus and representing', () => {
    const { sideIds } = setup();
    let result: any = tournamentEngine.modifyParticipant({
      participant: {
        participantId: sideIds[0],
        useOtherName: true,
        participantStatus: 'WITHDRAWN',
        representing: 'FRA',
      },
    });
    expect(result.success).toEqual(true);
    const team = getParticipant(sideIds[0]);
    expect(team.participantType).toEqual(TEAM_PARTICIPANT);
    expect(team.useOtherName).toEqual(true);
    expect(team.participantStatus).toEqual('WITHDRAWN');
    expect(team.representing).toEqual('FRA');

    result = tournamentEngine.modifyParticipant({
      participant: { participantId: sideIds[0], useOtherName: false, participantStatus: '', representing: '' },
    });
    expect(result.success).toEqual(true);
    const cleared = getParticipant(sideIds[0]);
    expect(cleared.useOtherName).toEqual(false);
    expect(cleared.participantStatus).toBeUndefined();
    expect(cleared.representing).toBeUndefined();
  });

  it('refuses an invalid value rather than dropping it', () => {
    const { sideIds } = setup();
    const participantId = sideIds[0];
    let result: any = tournamentEngine.modifyParticipant({ participant: { participantId, participantStatus: 'GONE' } });
    expect(result.error).toEqual(INVALID_VALUES);
    result = tournamentEngine.modifyParticipant({ participant: { participantId, representing: 'XYZ' } });
    expect(result.error).toEqual(INVALID_VALUES);
    result = tournamentEngine.modifyParticipant({ participant: { participantId, useOtherName: 'yes' } });
    expect(result.error).toEqual(INVALID_VALUES);

    const team = getParticipant(participantId);
    expect(team.participantStatus).toBeUndefined();
    expect(team.representing).toBeUndefined();
    expect(team.useOtherName).toBeUndefined();
  });
});
