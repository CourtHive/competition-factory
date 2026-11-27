import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, describe, expect, it } from 'vitest';

// constants
import { FIRST_ROUND_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * A declined consolation lapses with its result. Replacing a loser a result sent to the consolation with a BYE
 * records the decline on the BYE (`declinedParticipantId`, `declinedMatchUpId`). A reset clears that result, so it
 * also removes the BYE and re-enables the seat's links: when the result is replayed, its loser arrives. A BYE placed
 * where no participant was removed (closed before play) carries no decline and keeps its disabled links. A record
 * written by 7.x carries no decline marker; the decline is read off the draw where it is unambiguous.
 */

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];

afterEach(() => {
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline();
});

const played = (winningSide: 1 | 2) => ({
  score: {
    sets: [1, 2].map((setNumber) => ({
      side1Score: winningSide === 1 ? 6 : 2,
      side2Score: winningSide === 1 ? 2 : 6,
      winningSide,
      setNumber,
    })),
  },
  winningSide,
});

const drawId = 'd';
const consolation = () => tournamentEngine.getEvent({ drawId }).drawDefinition.structures[1];
const firstRound = (roundPosition: number) =>
  tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.find((m: any) => m.structureName === 'Main' && m.roundNumber === 1 && m.roundPosition === roundPosition);
const set = (roundPosition: number, outcome: any) =>
  tournamentEngine.setMatchUpStatus({ drawId, matchUpId: firstRound(roundPosition).matchUpId, outcome });
const seatOf = (drawPosition: number) =>
  consolation().positionAssignments.find((assignment: any) => assignment.drawPosition === drawPosition);
const inconsistencies = () =>
  (tournamentEngine.getDrawInconsistencies({ drawId }).inconsistencies ?? []).filter(
    (i: any) => i.severity === 'error',
  );

function declined(mode: OutcomePipelineMode) {
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: FIRST_ROUND_LOSER_CONSOLATION, drawSize: 8 }],
    setState: true,
  });
  setOutcomePipeline(mode);
  expect(set(1, played(1)).success).toEqual(true);
  expect(set(2, played(1)).success).toEqual(true);
  const loser = firstRound(1).sides.find((side: any) => side.sideNumber === 2).participantId;
  const drawPosition = consolation().positionAssignments.find((a: any) => a.participantId === loser).drawPosition;
  const removed = tournamentEngine.removeDrawPositionAssignment({
    structureId: consolation().structureId,
    replaceWithBye: true,
    drawPosition,
    drawId,
  });
  expect(removed.success).toEqual(true);
  return { loser, drawPosition, matchUpId: firstRound(1).matchUpId };
}

describe.each(MODES)('a decline lapses with its result (%s)', (mode) => {
  it('the decline is recorded on the BYE; a reset removes it and the replayed loser arrives', () => {
    const { loser, drawPosition, matchUpId } = declined(mode);
    expect(seatOf(drawPosition)).toMatchObject({
      declinedParticipantId: loser,
      declinedMatchUpId: matchUpId,
      disableLinks: true,
      bye: true,
    });

    expect(tournamentEngine.resetDrawDefinition({ drawId }).success).toEqual(true);
    const reopened = seatOf(drawPosition);
    expect([reopened.bye, reopened.disableLinks, reopened.declinedParticipantId]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);

    expect(set(1, played(1)).success).toEqual(true);
    expect(set(2, played(1)).success).toEqual(true);
    expect(consolation().positionAssignments.filter((a: any) => a.participantId).length).toEqual(2);
    expect(seatOf(drawPosition).participantId).toEqual(loser);
    expect(inconsistencies()).toEqual([]);
  });

  it('a BYE closed before play (no participant removed) stays closed through a reset', () => {
    setSubscriptions({ subscriptions: {} });
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawType: FIRST_ROUND_LOSER_CONSOLATION, drawSize: 8 }],
      setState: true,
    });
    setOutcomePipeline(mode);
    // a double walkover sends no loser on: the seat it fed is owed nothing, and the director closes it by hand
    expect(set(1, { matchUpStatus: 'DOUBLE_WALKOVER' }).success).toEqual(true);
    const open = consolation().positionAssignments.find(
      (a: any) => !a.participantId && (!a.bye || a.byeFromPropagation) && [1, 2].includes(a.drawPosition),
    );
    expect(open).toBeDefined();
    expect(
      tournamentEngine.removeDrawPositionAssignment({
        structureId: consolation().structureId,
        drawPosition: open.drawPosition,
        replaceWithBye: true,
        drawId,
      }).success,
    ).toEqual(true);
    const closed = seatOf(open.drawPosition);
    expect(closed).toMatchObject({ bye: true, disableLinks: true });
    expect(closed.declinedParticipantId).toBeUndefined();

    expect(tournamentEngine.resetDrawDefinition({ drawId }).success).toEqual(true);
    expect(seatOf(open.drawPosition)).toMatchObject({ bye: true, disableLinks: true });
  });

  it('a record written by 7.x carries no decline marker: the decline is read off the draw and lapses', () => {
    const { loser, drawPosition } = declined(mode);
    const record = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const seat = record.events[0].drawDefinitions[0].structures[1].positionAssignments.find(
      (a: any) => a.drawPosition === drawPosition,
    );
    delete seat.declinedParticipantId;
    delete seat.declinedMatchUpId;
    tournamentEngine.setState(record);

    expect(tournamentEngine.resetDrawDefinition({ drawId }).success).toEqual(true);
    expect(seatOf(drawPosition).bye).toBeUndefined();
    expect(set(1, played(1)).success).toEqual(true);
    expect(seatOf(drawPosition).participantId).toEqual(loser);
  });
});
