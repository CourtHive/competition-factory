import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  CONFLICT_BYE_SCHEDULED,
  CONFLICT_EXIT_SCHEDULED,
  SCHEDULE_PRESERVED_ON_EXIT,
} from '@Constants/scheduleConstants';

/**
 * A PRESERVED PLACEMENT IS REPORTED — on the success payload, and on the read side — for a BYE and
 * for a produced exit alike. CA, 2026-10-01:
 *
 * > for recoverability we have to keep the schedules, or perhaps they should imply another
 * > notification in the success payload (warning) that clients can respond to?
 *
 * Both. The draw state is unchanged by any of this: the slot is kept, by the rule
 * `byeScheduling.ts` states. What changes is that the client which just scored the matchUp is
 * told, once, which matchUps it left holding a court or a time they can never use — so it can
 * offer "release these?" — and that a scheduler view sees a produced walkover's slot the way it
 * already saw a BYE's.
 *
 * FIRST_MATCH_LOSER_CONSOLATION 8/8: a DOUBLE_WALKOVER in `Main|1|1` sends a BYE to the consolation
 * and produces a WALKOVER in `Main|2|1`. Both land on scheduled matchUps.
 */

const DATE = '2026-10-10';
const DRAW_ID = 'preserved-warnings';
const allMatchUps = (): any[] => tournamentEngine.allTournamentMatchUps().matchUps ?? [];
const byKey = (structureName: string, roundNumber: number, roundPosition: number) =>
  allMatchUps().find(
    (m) => m.structureName === structureName && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
  );

function generateDraw() {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: DRAW_ID, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8 }],
    venueProfiles: [{ courtsCount: 6, startTime: '08:00', endTime: '22:00' }],
    startDate: DATE,
    endDate: '2026-10-12',
    nonRandom: 500001,
    setState: true,
  });
}

function scheduledDraw() {
  generateDraw();
  const courts = tournamentEngine.getVenuesAndCourts().courts ?? [];
  for (const [index, matchUp] of allMatchUps().entries()) {
    const court = courts[index % courts.length];
    const result: any = tournamentEngine.addMatchUpScheduleItems({
      // a court ORDER as well as a time: the pro grid's conflict annotator works in court-order rows
      schedule: {
        scheduledTime: `${String(8 + (index % 12)).padStart(2, '0')}:00`,
        courtOrder: Math.floor(index / courts.length) + 1,
        scheduledDate: DATE,
        courtId: court.courtId,
        venueId: court.venueId,
      },
      matchUpId: matchUp.matchUpId,
      drawId: DRAW_ID,
    });
    expect(result.success).toEqual(true);
  }
}

it('names, once, the BYE and the produced exit a double walkover left holding a slot', () => {
  scheduledDraw();
  const source = byKey('Main', 1, 1);

  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: source.matchUpId,
    drawId: DRAW_ID,
  });
  expect(result.success).toEqual(true);

  // CONTROL: the cascade produced both, and both kept their slots
  const consolationBye = byKey('Consolation', 1, 1);
  const producedExit = byKey('Main', 2, 1);
  expect(consolationBye.matchUpStatus).toEqual('BYE');
  expect(producedExit.matchUpStatus).toEqual(WALKOVER);
  expect(consolationBye.schedule?.courtId).toBeDefined();
  expect(producedExit.schedule?.courtId).toBeDefined();

  // THE PAYLOAD: one warning naming everything this call left unplayable with a slot — the produced
  // exit, the consolation BYE, and the round the BYE advanced into — and not the source, which was
  // decided by the director rather than by the cascade
  const [warning] = result.warnings ?? [];
  expect(warning?.code).toEqual(SCHEDULE_PRESERVED_ON_EXIT);
  const named = [...warning.matchUpIds].sort((a, b) => a.localeCompare(b));
  expect(named).toContain(consolationBye.matchUpId);
  expect(named).toContain(producedExit.matchUpId);
  expect(named).not.toContain(source.matchUpId);
  const unplayableWithSlot = allMatchUps()
    .filter(
      (m) =>
        (m.matchUpStatus === 'BYE' || (m.matchUpStatus === WALKOVER && m.sideExitProvenance)) && m.schedule?.courtId,
    )
    .map((m) => m.matchUpId)
    .sort((a, b) => a.localeCompare(b));
  expect(named).toEqual(unplayableWithSlot);

  // ONCE: a later score elsewhere does not repeat what was already reported
  const other = byKey('Main', 1, 3);
  result = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: 1 },
    matchUpId: other.matchUpId,
    drawId: DRAW_ID,
  });
  expect(result.success).toEqual(true);
  expect(result.warnings).toBeUndefined();
});

it('shows a produced exit holding a court beside the BYEs, with a code of its own', () => {
  generateDraw();
  const source = byKey('Main', 1, 1);
  expect(
    tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: source.matchUpId,
      drawId: DRAW_ID,
    }).success,
  ).toEqual(true);
  const consolationBye = byKey('Consolation', 1, 1);
  const producedExit = byKey('Main', 2, 1);

  // only the two of interest are placed, on separate courts in separate rows: the BYE and exit
  // warnings yield to a genuine conflict on the same matchUp — a dependent placed before its source,
  // or two matchUps in one row sharing a potential participant — so nothing else shares the grid
  const courts = tournamentEngine.getVenuesAndCourts().courts ?? [];
  for (const [index, matchUp] of [consolationBye, producedExit].entries()) {
    expect(
      tournamentEngine.addMatchUpScheduleItems({
        schedule: {
          courtId: courts[index].courtId,
          venueId: courts[index].venueId,
          courtOrder: index + 1,
          scheduledDate: DATE,
        },
        matchUpId: matchUp.matchUpId,
        drawId: DRAW_ID,
      }).success,
    ).toEqual(true);
  }

  const listed: any = tournamentEngine.competitionScheduleMatchUps({
    matchUpFilters: { scheduledDate: DATE },
    courtByeMatchUps: true,
  });
  const dateMatchUps: any[] = listed.dateMatchUps ?? [];
  const ids = new Set(dateMatchUps.map((m) => m.matchUpId));
  expect(ids.has(consolationBye.matchUpId), 'the BYE is listed, as before').toEqual(true);
  expect(ids.has(producedExit.matchUpId), 'the produced exit is listed with it').toEqual(true);

  // and without the option neither occupies a cell, as before
  const hidden: any = tournamentEngine.competitionScheduleMatchUps({ matchUpFilters: { scheduledDate: DATE } });
  const hiddenIds = new Set((hidden.dateMatchUps ?? []).map((m: any) => m.matchUpId));
  expect(hiddenIds.has(producedExit.matchUpId)).toEqual(false);

  // the conflict annotator wants the in-context matchUps with their dependencies
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true, nextMatchUps: true });
  const scheduled = (matchUps as any[]).filter((m) => m.schedule?.courtId && m.schedule?.scheduledDate === DATE);
  const { rowIssues } = tournamentEngine.proConflicts({ matchUps: scheduled });
  const issues: any[] = Object.values(rowIssues ?? {}).flat();
  const issueTypesFor = (matchUpId: string) =>
    issues.filter((issue) => issue.matchUpId === matchUpId).map((issue) => issue.issueType);
  expect(issueTypesFor(consolationBye.matchUpId), 'the BYE keeps its own code').toContain(CONFLICT_BYE_SCHEDULED);
  expect(issueTypesFor(producedExit.matchUpId), 'the produced exit gets its own').toContain(CONFLICT_EXIT_SCHEDULED);
  expect(issueTypesFor(producedExit.matchUpId)).not.toContain(CONFLICT_BYE_SCHEDULED);
});
