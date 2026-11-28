import { deleteNotices, setSubscriptions } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants
import { MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS } from '@Constants/topicConstants';
import { DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * A HELD REASON ON AN UNFILLABLE SEAT DOES NOT STOP PLANNING.
 *
 * Two first-round double walkovers in CURTIS_CONSOLATION 16 (`doubleExitPropagateBye: false`) produce an exit whose loser
 * seat, in the play-off for 3rd and 4th, nobody can fill: the play-off matchUp becomes a BYE, and the planner plans that
 * BYE and its chain (`unfillableByeChain`) over a matchUp holding no result and no provenance. A reason the matchUp holds
 * (here one written into the record before the second double walkover) changes nothing the BYE and its chain write, so
 * it does not stop the plan: the BYE drops it, as any write does on a status that takes no reason. The record and the
 * notices are pinned as the call wrote them before the planner owned this route.
 */

afterEach(() => {
  setSubscriptions({ subscriptions: {} });
  setClock();
});

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const matchUpAt = (coordinate: string) =>
  tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps.find((m: any) => key(m) === coordinate);

function play({ reason }: { reason: boolean }) {
  setClock('2026-11-27T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { propagateExitStatus: true, doubleExitPropagateBye: false } },
    drawProfiles: [{ drawType: CURTIS_CONSOLATION, drawSize: 16, participantsCount: 16, drawId: 'd', idPrefix: 'm' }],
    nonRandom: 9000230,
  });
  tournamentEngine.setState(tournamentRecord);
  const first: any = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUpAt('Main|1|1').matchUpId,
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    drawId: 'd',
  });

  // the record handed back holds a reason on the play-off matchUp the second double walkover's unfillable seat reaches
  const record = tournamentEngine.getTournament().tournamentRecord;
  const matchUps = () => record.events[0].drawDefinitions[0].structures.flatMap((s: any) => s.matchUps ?? []);
  const playOff = matchUps().find((matchUp: any) => matchUp.matchUpId === 'm-p3t4-1-1');
  const held = { matchUpStatus: playOff.matchUpStatus, sideExitProvenance: playOff.sideExitProvenance };
  if (reason) playOff.sideStatusCodes = { 1: 'W1' };
  tournamentEngine.setState(record);
  const before = new Map<string, string>(
    tournamentEngine
      .allDrawMatchUps({ drawId: 'd', inContext: false })
      .matchUps.map((m: any) => [m.matchUpId, JSON.stringify(m)]),
  );

  deleteNotices();
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: {
      [MODIFY_MATCHUP]: (payloads: any[]) => payloads.forEach((p) => notices.push(p.matchUp.matchUpId)),
      [MODIFY_POSITION_ASSIGNMENTS]: (payloads: any[]) =>
        payloads.forEach((p) => notices.push(`assignments:${p.structureId}`)),
    },
  });
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUpAt('Main|1|2').matchUpId,
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    drawId: 'd',
  });

  const inContext = tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps;
  const coordinateOf = new Map<string, string>(inContext.map((m: any) => [m.matchUpId, key(m)]));
  const { structures } = tournamentEngine.getEvent({ drawId: 'd' }).drawDefinition;
  const structureName = new Map<string, string>(structures.map((s: any) => [s.structureId, s.structureName]));
  const name = (notice: string) =>
    notice.startsWith('assignments:')
      ? `assignments:${structureName.get(notice.slice('assignments:'.length))}`
      : (coordinateOf.get(notice) ?? notice);
  const changed = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: false })
    .matchUps.filter((m: any) => before.get(m.matchUpId) !== JSON.stringify(m))
    .map((m: any) => ({
      at: coordinateOf.get(m.matchUpId),
      matchUpStatus: m.matchUpStatus,
      winningSide: m.winningSide,
      drawPositions: m.drawPositions,
      sideStatusCodes: m.sideStatusCodes,
      sideExitProvenance:
        m.sideExitProvenance &&
        Object.fromEntries(
          Object.entries(m.sideExitProvenance).map(([side, entry]: [string, any]) => [
            side,
            {
              matchUpStatus: entry.matchUpStatus,
              previousMatchUpStatus: entry.previousMatchUpStatus,
              source: coordinateOf.get(entry.sourceMatchUpId),
            },
          ]),
        ),
    }))
    .sort((a: any, b: any) => (a.at < b.at ? -1 : 1));
  return { first: first.success, held, success: result.success, changed, notices: notices.map(name).sort() };
}

const fromDoubles = (source: string) => ({
  matchUpStatus: 'WALKOVER',
  previousMatchUpStatus: DOUBLE_WALKOVER,
  source,
});

/** what the second double walkover writes, and announces, with or without the held reason */
const WRITTEN = [
  {
    at: 'Consolation 1|1|1',
    matchUpStatus: DOUBLE_WALKOVER,
    drawPositions: [5, 6],
    sideExitProvenance: { 1: fromDoubles('Main|1|1'), 2: fromDoubles('Main|1|2') },
  },
  {
    at: 'Consolation 1|2|1',
    matchUpStatus: 'WALKOVER',
    drawPositions: [1],
    sideExitProvenance: { 2: fromDoubles('Consolation 1|1|1') },
  },
  { at: 'Consolation 1|3|1', matchUpStatus: TO_BE_PLAYED, drawPositions: [1] },
  { at: 'Main|1|2', matchUpStatus: DOUBLE_WALKOVER, drawPositions: [3, 4] },
  {
    at: 'Main|2|1',
    matchUpStatus: DOUBLE_WALKOVER,
    drawPositions: [],
    sideExitProvenance: { 1: fromDoubles('Main|1|1'), 2: fromDoubles('Main|1|2') },
  },
  { at: 'Main|3|1', matchUpStatus: 'WALKOVER', drawPositions: [], sideExitProvenance: { 1: fromDoubles('Main|2|1') } },
  { at: 'Play Off|1|1', matchUpStatus: 'BYE', drawPositions: [1, 2] },
];
const ANNOUNCED = [
  'Consolation 1|1|1',
  'Consolation 1|2|1',
  'Consolation 1|3|1',
  'Main|1|2',
  'Main|2|1',
  'Main|3|1',
  'Play Off|1|1',
  'assignments:Play Off',
];

describe('a held reason on an unfillable seat does not stop planning', () => {
  it.each([
    ['the play-off matchUp holding a reason', true],
    ['the play-off matchUp holding nothing', false],
  ])('CURTIS_CONSOLATION 16, the second double walkover, %s', (_label, reason) => {
    const played = play({ reason });

    // CONTROL: the play-off matchUp is the clean unfillable target the BYE lands in
    expect(played.first).toEqual(true);
    expect(played.held).toEqual({ matchUpStatus: TO_BE_PLAYED, sideExitProvenance: undefined });

    expect(played.success).toEqual(true);
    expect(played.changed).toEqual(WRITTEN.map((write) => expect.objectContaining(write)));
    expect(played.changed.map(({ winningSide, sideStatusCodes }) => ({ winningSide, sideStatusCodes }))).toEqual(
      WRITTEN.map(() => ({ winningSide: undefined, sideStatusCodes: undefined })),
    );
    expect(played.notices).toEqual(ANNOUNCED);
  });
});
