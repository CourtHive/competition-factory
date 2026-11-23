import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { EXPLICIT, HOST_ORGANISATION, NONE, VENUE } from '@Constants/homeParticipantConstants';
import { MATCHUP_NOT_FOUND, MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM } from '@Constants/matchUpTypes';

const HOST_ORG_ID = 'host-org';
const OTHER_ORG_ID = 'governing-body';
const HOME_VENUE_ID = 'venue-home';
const AWAY_VENUE_ID = 'venue-away';
const DRAW_ID = 'dual';

type TeamProfile = { homeVenueIds?: string[]; issuedBy?: string[]; roleHome?: boolean };
type Setup = {
  teams?: [TeamProfile, TeamProfile];
  ownerId?: string;
  venueId?: string;
  courtVenue?: boolean;
  explicitSide?: number;
};

/**
 * A single TEAM dual, completed so StatCrew has a game to write. `teams[i]` decorates the TEAM on side i + 1.
 */
function setup({ teams, ownerId, venueId, courtVenue, explicitSide }: Setup = {}) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: DRAW_ID, drawSize: 2, eventType: TEAM_EVENT }],
    venueProfiles: [
      { venueId: HOME_VENUE_ID, courtsCount: 2 },
      { venueId: AWAY_VENUE_ID, courtsCount: 2 },
    ],
    completeAllMatchUps: true,
  });
  if (ownerId) {
    tournamentRecord.parentOrganisation = {
      organisationId: ownerId,
      organisationName: 'Host',
      organisationAbbreviation: 'HST',
    };
  }
  tournamentEngine.setState(tournamentRecord);

  const dual = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM] } }).matchUps[0];
  const sideIds = dual.sides.map((side) => side.participantId);

  // decorate the record's TEAMs directly: these are producer-supplied facts, not something a mutation infers
  const record = tournamentEngine.getTournament().tournamentRecord;
  (teams ?? []).forEach((profile, index) => {
    const team = record.participants.find((participant) => participant.participantId === sideIds[index]);
    if (profile.homeVenueIds) team.homeVenueIds = profile.homeVenueIds;
    if (profile.issuedBy)
      team.participantOtherIds = profile.issuedBy.map((organisationId) => ({
        participantId: `${organisationId}-${index}`,
        organisationId,
      }));
    if (profile.roleHome) team.participantRoleResponsibilities = ['Home'];
  });
  tournamentEngine.setState(record);

  if (courtVenue) {
    const courtId = record.venues.find((venue) => venue.venueId === HOME_VENUE_ID).courts[0].courtId;
    const result = tournamentEngine.assignMatchUpCourt({
      courtDayDate: record.startDate,
      matchUpId: dual.matchUpId,
      drawId: DRAW_ID,
      courtId,
    });
    expect(result.success).toEqual(true);
  } else if (venueId) {
    const result = tournamentEngine.assignMatchUpVenue({ matchUpId: dual.matchUpId, drawId: DRAW_ID, venueId });
    expect(result.success).toEqual(true);
  }

  if (explicitSide) {
    const result = tournamentEngine.setMatchUpHomeParticipantId({
      homeParticipantId: sideIds[explicitSide - 1],
      matchUpId: dual.matchUpId,
      drawId: DRAW_ID,
    });
    expect(result.success).toEqual(true);
  }

  return { matchUpId: dual.matchUpId, sideIds };
}

function resolveHome(matchUpId: string) {
  let result: any = tournamentEngine.resolveHomeParticipantId({ drawId: DRAW_ID, matchUpId });
  expect(result.success).toEqual(true);
  return result;
}

function statCrewVenue() {
  let result: any = tournamentEngine.generateStatCrew();
  expect(result.success).toEqual(true);
  expect(result.json).toHaveLength(1);
  return result.json[0];
}

function teamVh(game) {
  return Object.fromEntries(game.childArray.filter((child) => child.team).map(({ team }) => [team.id, team.vh]));
}

describe('resolveHomeParticipantId', () => {
  it('names no home team when nothing singles out a side, and never assumes side 1', () => {
    const { matchUpId } = setup();
    const result = resolveHome(matchUpId);
    expect(result.basis).toEqual(NONE);
    expect(result.homeParticipantId).toBeUndefined();
  });

  it('EXPLICIT: the stored homeParticipantId', () => {
    const { matchUpId, sideIds } = setup({ explicitSide: 2 });
    expect(resolveHome(matchUpId)).toMatchObject({ homeParticipantId: sideIds[1], basis: EXPLICIT });
  });

  it('VENUE: the matchUp venue is in exactly one side homeVenueIds', () => {
    const { matchUpId, sideIds } = setup({
      teams: [{ homeVenueIds: [AWAY_VENUE_ID] }, { homeVenueIds: [HOME_VENUE_ID] }],
      venueId: HOME_VENUE_ID,
    });
    expect(resolveHome(matchUpId)).toMatchObject({ homeParticipantId: sideIds[1], basis: VENUE });
  });

  it('VENUE: a court assignment supplies the venue', () => {
    const { matchUpId, sideIds } = setup({ teams: [{ homeVenueIds: [HOME_VENUE_ID] }, {}], courtVenue: true });
    expect(resolveHome(matchUpId)).toMatchObject({ homeParticipantId: sideIds[0], basis: VENUE });
  });

  it('VENUE does not count without a venue on the matchUp', () => {
    const { matchUpId } = setup({ teams: [{ homeVenueIds: [HOME_VENUE_ID] }, {}] });
    expect(resolveHome(matchUpId).basis).toEqual(NONE);
  });

  it('HOST_ORGANISATION: the owner issued an id to exactly one side', () => {
    const { matchUpId, sideIds } = setup({
      teams: [{ issuedBy: [OTHER_ORG_ID] }, { issuedBy: [OTHER_ORG_ID, HOST_ORG_ID] }],
      ownerId: HOST_ORG_ID,
    });
    expect(resolveHome(matchUpId)).toMatchObject({ homeParticipantId: sideIds[1], basis: HOST_ORGANISATION });
  });

  it('HOST_ORGANISATION matches the issued organisationId, never the tournament-local participantId', () => {
    const { matchUpId, sideIds } = setup({ teams: [{ issuedBy: [OTHER_ORG_ID] }, {}] });
    // an owner whose id happens to be a TEAM's tournament-local participantId is not that team's host
    const record = tournamentEngine.getTournament().tournamentRecord;
    record.parentOrganisation = {
      organisationId: sideIds[0],
      organisationName: 'Host',
      organisationAbbreviation: 'HST',
    };
    tournamentEngine.setState(record);
    expect(resolveHome(matchUpId).basis).toEqual(NONE);
  });

  it('both sides matching gives NONE: venue', () => {
    const { matchUpId } = setup({
      teams: [{ homeVenueIds: [HOME_VENUE_ID] }, { homeVenueIds: [HOME_VENUE_ID] }],
      venueId: HOME_VENUE_ID,
    });
    const result = resolveHome(matchUpId);
    expect(result.basis).toEqual(NONE);
    expect(result.homeParticipantId).toBeUndefined();
  });

  it('both sides matching gives NONE: host organisation', () => {
    const { matchUpId } = setup({
      teams: [{ issuedBy: [HOST_ORG_ID] }, { issuedBy: [HOST_ORG_ID] }],
      ownerId: HOST_ORG_ID,
    });
    expect(resolveHome(matchUpId).basis).toEqual(NONE);
  });

  it('an ambiguous venue falls through to the host organisation', () => {
    const { matchUpId, sideIds } = setup({
      teams: [{ homeVenueIds: [HOME_VENUE_ID], issuedBy: [HOST_ORG_ID] }, { homeVenueIds: [HOME_VENUE_ID] }],
      venueId: HOME_VENUE_ID,
      ownerId: HOST_ORG_ID,
    });
    expect(resolveHome(matchUpId)).toMatchObject({ homeParticipantId: sideIds[0], basis: HOST_ORGANISATION });
  });

  it('precedence: EXPLICIT beats VENUE beats HOST_ORGANISATION', () => {
    const teams: [TeamProfile, TeamProfile] = [{ homeVenueIds: [HOME_VENUE_ID] }, { issuedBy: [HOST_ORG_ID] }];
    let { matchUpId, sideIds } = setup({ teams, venueId: HOME_VENUE_ID, ownerId: HOST_ORG_ID });
    expect(resolveHome(matchUpId)).toMatchObject({ homeParticipantId: sideIds[0], basis: VENUE });

    ({ matchUpId, sideIds } = setup({ teams, venueId: HOME_VENUE_ID, ownerId: HOST_ORG_ID, explicitSide: 2 }));
    expect(resolveHome(matchUpId)).toMatchObject({ homeParticipantId: sideIds[1], basis: EXPLICIT });
  });

  it('accepts an in-context matchUp and never writes', () => {
    const { matchUpId, sideIds } = setup({ teams: [{}, { homeVenueIds: [HOME_VENUE_ID] }], venueId: HOME_VENUE_ID });
    const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    const { matchUp } = tournamentEngine.findMatchUp({ matchUpId, inContext: true });

    let result: any = tournamentEngine.resolveHomeParticipantId({ matchUp });
    expect(result).toMatchObject({ homeParticipantId: sideIds[1], basis: VENUE });
    expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toEqual(before);
    expect(tournamentEngine.getHomeParticipantId({ matchUp }).homeParticipantId).toBeUndefined();
  });

  it('reports a missing or unknown matchUp', () => {
    setup();
    let result: any = tournamentEngine.resolveHomeParticipantId({ drawId: DRAW_ID });
    expect(result.error).toEqual(MISSING_MATCHUP);
    result = tournamentEngine.resolveHomeParticipantId({ matchUpId: 'bogus' });
    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
  });
});

describe('generateStatCrew home and visitor', () => {
  it('EXPLICIT home: home/visitor, not neutral', () => {
    const { sideIds } = setup({ explicitSide: 2 });
    const game = statCrewVenue();
    expect(game.venue).toMatchObject({ neutralgame: 'N', homeid: sideIds[1], visid: sideIds[0] });
    expect(teamVh(game)).toEqual({ [sideIds[1]]: 'H', [sideIds[0]]: 'V' });
  });

  it('VENUE home: home/visitor, not neutral', () => {
    const { sideIds } = setup({ teams: [{ homeVenueIds: [HOME_VENUE_ID] }, {}], venueId: HOME_VENUE_ID });
    const game = statCrewVenue();
    expect(game.venue).toMatchObject({ neutralgame: 'N', homeid: sideIds[0], visid: sideIds[1] });
    expect(teamVh(game)).toEqual({ [sideIds[0]]: 'H', [sideIds[1]]: 'V' });
  });

  it('HOST_ORGANISATION home: home/visitor, not neutral', () => {
    const { sideIds } = setup({ teams: [{}, { issuedBy: [HOST_ORG_ID] }], ownerId: HOST_ORG_ID });
    const game = statCrewVenue();
    expect(game.venue).toMatchObject({ neutralgame: 'N', homeid: sideIds[1], visid: sideIds[0] });
  });

  it('no home team: the game is neutral', () => {
    setup({ teams: [{ issuedBy: [HOST_ORG_ID] }, { issuedBy: [HOST_ORG_ID] }], ownerId: HOST_ORG_ID });
    const game = statCrewVenue();
    expect(game.venue.neutralgame).toEqual('Y');
    // StatCrew still fills both slots; they are positional and differ
    expect(game.venue.homeid).toBeDefined();
    expect(game.venue.homeid).not.toEqual(game.venue.visid);
  });

  it("the 'Home' responsibility still marks the home team, below EXPLICIT", () => {
    let { sideIds } = setup({ teams: [{ roleHome: true }, {}] });
    expect(statCrewVenue().venue).toMatchObject({ neutralgame: 'N', homeid: sideIds[0] });

    ({ sideIds } = setup({ teams: [{ roleHome: true }, {}], explicitSide: 2 }));
    expect(statCrewVenue().venue).toMatchObject({ neutralgame: 'N', homeid: sideIds[1] });
  });

  it("the 'Home' responsibility ranks above the inferred signals", () => {
    const { sideIds } = setup({
      teams: [{ homeVenueIds: [HOME_VENUE_ID] }, { roleHome: true }],
      venueId: HOME_VENUE_ID,
    });
    expect(statCrewVenue().venue).toMatchObject({ neutralgame: 'N', homeid: sideIds[1] });
  });

  it("two teams carrying 'Home' is no signal", () => {
    setup({ teams: [{ roleHome: true }, { roleHome: true }] });
    expect(statCrewVenue().venue.neutralgame).toEqual('Y');
  });
});
