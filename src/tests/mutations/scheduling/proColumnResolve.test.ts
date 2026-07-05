import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and types
import {
  CONFLICT_PARTICIPANTS,
  CONFLICT_POTENTIAL_PARTICIPANTS,
  SCHEDULE_CONFLICT,
} from '@Constants/scheduleConstants';
import { DOUBLES, SINGLES } from '@Constants/eventConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';

const startDate = '2024-02-05';
const endDate = '2024-02-11';

const PARTICIPANT_CONFLICT_TYPES = new Set([CONFLICT_PARTICIPANTS, CONFLICT_POTENTIAL_PARTICIPANTS]);

// count row cells flagged as a participant / potential-participant CONFLICT
function participantConflictCount(rowIssues) {
  return rowIssues
    .flat()
    .filter((entry) => entry.issue === SCHEDULE_CONFLICT && PARTICIPANT_CONFLICT_TYPES.has(entry.issueType)).length;
}

function scheduledMatchUps() {
  return tournamentEngine.allCompetitionMatchUps({
    matchUpFilters: { scheduledDate: startDate },
    nextMatchUps: true,
    inContext: true,
  }).matchUps;
}

describe('proColumnResolve - court-preserving conflict resolution', () => {
  it('clears a forced cross-column participant conflict without moving courts or times', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Main', venueAbbreviation: 'MV', idPrefix: 'court', courtsCount: 10 }],
      drawProfiles: [{ eventType: DOUBLES, idPrefix: 'doubles', drawSize: 16 }],
      startDate,
      endDate,
    });

    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    // add a singles event drawn from the SAME individuals as the doubles draw,
    // so a player appears in both a singles and a doubles matchUp
    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });
    result = tournamentEngine.addEvent({ event: { eventName: 'Singles', eventType: SINGLES } });
    const singlesEventId = result.event.eventId;
    tournamentEngine.addEventEntries({
      participantIds: participants.map((p) => p.participantId),
      eventId: singlesEventId,
    });
    const { drawDefinition: singlesDraw } = tournamentEngine.generateDrawDefinition({
      eventId: singlesEventId,
      automated: true,
    });
    tournamentEngine.addDrawDefinition({ drawDefinition: singlesDraw, eventId: singlesEventId });
    const singlesDrawId = singlesDraw.drawId;

    // place everything conflict-free first
    let matchUps = tournamentEngine.allCompetitionMatchUps({ nextMatchUps: true, inContext: true }).matchUps;
    result = tournamentEngine.proAutoSchedule({ scheduledDate: startDate, matchUps });
    expect(result.success).toEqual(true);

    matchUps = scheduledMatchUps();
    expect(participantConflictCount(tournamentEngine.proConflicts({ matchUps }).rowIssues)).toEqual(0);

    // find a doubles matchUp and a singles matchUp sharing an individual
    const doublesMatches = matchUps.filter((m) => m.matchUpType === DOUBLES && m.sides?.every((s) => s.participantId));
    const singlesMatches = matchUps.filter((m) => m.matchUpType === SINGLES && m.sides?.every((s) => s.participantId));

    let doublesMatch;
    let singlesMatch;
    for (const dm of doublesMatches) {
      const ids = new Set(dm.sides.flatMap((s) => s.participant?.individualParticipantIds || []).filter(Boolean));
      const sm = singlesMatches.find((m) => m.sides.some((s) => ids.has(s.participantId)));
      if (sm) {
        doublesMatch = dm;
        singlesMatch = sm;
        break;
      }
    }
    expect(!!doublesMatch && !!singlesMatch).toBe(true);

    // force the singles matchUp onto the doubles matchUp's row (same courtOrder,
    // a different court) → a cross-column participant conflict
    const targetOrder = doublesMatch.schedule.courtOrder;
    const occupied = new Set(
      matchUps
        .filter((m) => m.schedule?.courtOrder === targetOrder && m.matchUpId !== singlesMatch.matchUpId)
        .map((m) => m.schedule?.courtId),
    );
    const { courts } = tournamentEngine.getCourts();
    const freeCourtId = courts.find((c) => !occupied.has(c.courtId))?.courtId;
    expect(freeCourtId).toBeDefined();

    result = tournamentEngine.addMatchUpScheduleItems({
      matchUpId: singlesMatch.matchUpId,
      drawId: singlesDrawId,
      schedule: {
        courtId: freeCourtId,
        scheduledDate: startDate,
        scheduledTime: singlesMatch.schedule.scheduledTime,
        courtOrder: targetOrder,
        venueId: doublesMatch.schedule.venueId,
      },
    });
    expect(result.success).toEqual(true);

    // conflict is now present
    matchUps = scheduledMatchUps();
    expect(participantConflictCount(tournamentEngine.proConflicts({ matchUps }).rowIssues)).toBeGreaterThan(0);

    // snapshot court + scheduledTime for every scheduled matchUp
    const before = new Map(
      matchUps.map((m) => [m.matchUpId, { courtId: m.schedule?.courtId, scheduledTime: m.schedule?.scheduledTime }]),
    );

    // resolve
    result = tournamentEngine.proColumnResolve({ scheduledDate: startDate, matchUps });
    expect(result.error).toBeUndefined();

    // conflict cleared
    matchUps = scheduledMatchUps();
    expect(participantConflictCount(tournamentEngine.proConflicts({ matchUps }).rowIssues)).toEqual(0);

    // invariant: no court moved, no scheduledTime moved
    for (const m of matchUps) {
      const prior = before.get(m.matchUpId);
      if (!prior) continue;
      expect(m.schedule?.courtId).toEqual(prior.courtId);
      expect(m.schedule?.scheduledTime).toEqual(prior.scheduledTime);
    }
  });

  it('reports a director-made chronology impossibility as unresolvable', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Main', venueAbbreviation: 'MV', idPrefix: 'court', courtsCount: 4 }],
      drawProfiles: [{ idPrefix: 'm', drawSize: 8 }],
      startDate,
      endDate,
    });
    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ nextMatchUps: true, inContext: true });
    const round1 = matchUps.find((m) => m.roundNumber === 1 && m.winnerMatchUpId);
    const round2Id = round1.winnerMatchUpId;
    const drawId = round1.drawId;

    // feeder (round 1) at a LATER clock time than the match it feeds (round 2)
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: round2Id,
      drawId,
      schedule: { courtId: 'court-1', scheduledDate: startDate, scheduledTime: '09:00', courtOrder: 1 },
    });
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: round1.matchUpId,
      drawId,
      schedule: { courtId: 'court-2', scheduledDate: startDate, scheduledTime: '12:00', courtOrder: 2 },
    });

    const scheduled = tournamentEngine.allCompetitionMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      nextMatchUps: true,
      inContext: true,
    }).matchUps;

    result = tournamentEngine.proColumnResolve({ scheduledDate: startDate, matchUps: scheduled });
    expect(result.error).toBeUndefined();
    expect(result.unresolvable.some((u) => u.matchUpId === round2Id && u.reason === 'chronology')).toBe(true);
  });

  it('force-places a same-column ordering deadlock and reports it', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Main', venueAbbreviation: 'MV', idPrefix: 'court', courtsCount: 4 }],
      drawProfiles: [{ idPrefix: 'm', drawSize: 8 }],
      startDate,
      endDate,
    });
    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ nextMatchUps: true, inContext: true });
    const round1 = matchUps.find((m) => m.roundNumber === 1 && m.winnerMatchUpId);
    const round2Id = round1.winnerMatchUpId;
    const drawId = round1.drawId;

    // feeder BELOW its dependent in the SAME column (round2 earlier time, round1 later) →
    // round2's head can never satisfy its source → deadlock the sweep must break
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: round2Id,
      drawId,
      schedule: { courtId: 'court-1', scheduledDate: startDate, scheduledTime: '09:00', courtOrder: 1 },
    });
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: round1.matchUpId,
      drawId,
      schedule: { courtId: 'court-1', scheduledDate: startDate, scheduledTime: '12:00', courtOrder: 2 },
    });

    const scheduled = tournamentEngine.allCompetitionMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      nextMatchUps: true,
      inContext: true,
    }).matchUps;

    result = tournamentEngine.proColumnResolve({ scheduledDate: startDate, matchUps: scheduled });
    expect(result.error).toBeUndefined();
    expect(result.unresolvable.some((u) => u.matchUpId === round2Id)).toBe(true);
  });

  it('anchors completed matchUps to the top of their column above to-be-played', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Main', venueAbbreviation: 'MV', idPrefix: 'court', courtsCount: 4 }],
      drawProfiles: [
        {
          idPrefix: 'm',
          drawSize: 8,
          outcomes: [
            { roundNumber: 1, roundPosition: 1, winningSide: 1, scoreString: '6-1 6-2' },
            { roundNumber: 1, roundPosition: 2, winningSide: 2, scoreString: '6-2 6-3' },
          ],
        },
      ],
      startDate,
      endDate,
    });
    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ nextMatchUps: true, inContext: true });
    const drawId = matchUps[0].drawId;
    const completed = matchUps.filter((m) => m.roundNumber === 1 && m.winningSide);
    const toPlay = matchUps.filter((m) => m.roundNumber === 1 && !m.winningSide);
    expect(completed.length).toEqual(2);
    expect(toPlay.length).toBeGreaterThanOrEqual(2);

    // scramble onto ONE court: to-be-played given LOW courtOrder, completed shoved to the bottom
    const place = (m, courtOrder, scheduledTime) =>
      tournamentEngine.addMatchUpScheduleItems({
        matchUpId: m.matchUpId,
        drawId,
        schedule: { courtId: 'court-1', scheduledDate: startDate, scheduledTime, courtOrder },
      });
    place(toPlay[0], 1, '09:00');
    place(toPlay[1], 2, '10:00');
    place(completed[0], 3, ''); // completed, no time, wrongly at the bottom
    place(completed[1], 4, '08:00');

    const scheduled = tournamentEngine.allCompetitionMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      nextMatchUps: true,
      inContext: true,
    }).matchUps;

    result = tournamentEngine.proColumnResolve({
      scheduledDate: startDate,
      matchUps: scheduled,
      courtIds: ['court-1'],
    });
    expect(result.error).toBeUndefined();

    const after = tournamentEngine.allCompetitionMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      nextMatchUps: true,
      inContext: true,
    }).matchUps;
    const orderOf = (id) => after.find((m) => m.matchUpId === id)?.schedule?.courtOrder;
    const maxCompleted = Math.max(...completed.map((m) => orderOf(m.matchUpId)));
    const minToPlay = Math.min(...toPlay.map((m) => orderOf(m.matchUpId)));
    expect(maxCompleted).toBeLessThan(minToPlay);
  });

  it('guards invalid args, missing context, and an empty grid', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Main', venueAbbreviation: 'MV', idPrefix: 'court', courtsCount: 2 }],
      drawProfiles: [{ idPrefix: 'g', drawSize: 8 }],
      startDate,
      endDate,
    });
    tournamentEngine.setState(tournamentRecord);

    const contextMatchUps = tournamentEngine.allCompetitionMatchUps({ nextMatchUps: true, inContext: true }).matchUps;
    const bareMatchUps = contextMatchUps.map((m) => ({ ...m, hasContext: false }));

    // missing scheduledDate → INVALID_VALUES
    expect(tournamentEngine.proColumnResolve({ matchUps: contextMatchUps }).error).toBeDefined();
    // matchUps without context → MISSING_CONTEXT
    expect(tournamentEngine.proColumnResolve({ scheduledDate: startDate, matchUps: bareMatchUps }).error).toBeDefined();
    // nothing scheduled on the date → no-op success
    const empty: any = tournamentEngine.proColumnResolve({ scheduledDate: startDate, matchUps: contextMatchUps });
    expect(empty.success).toBe(true);
    expect(empty.resolved).toEqual([]);
  });
});
