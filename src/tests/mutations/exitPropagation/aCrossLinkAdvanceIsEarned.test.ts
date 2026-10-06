import { ADVANCED_ACROSS_LINK_FROM_UNDECIDED } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * NOBODY STANDS ACROSS A LINK OUT OF A MATCHUP THAT HAS NO RESULT (CA, 2026-10-05: design § 7, question 2).
 *
 * A WINNER or LOSER link moves a participant who decided the source round. `ADVANCED_FROM_UNDECIDED` reads within
 * a structure, so an advancement left behind across a link was invisible: clearing the Backdraw semifinal once
 * left its winner in the grand final and the Decider, and the draw read clean (design § 3.1). The new inconsistency
 * found two such leftovers on its first run, both at a structure's FINAL, which has no next round of its own:
 *
 *  - de 9303011 (DE 8/4, propagation off): `Main|3|1`'s double default re-scored as played takes back the BYE the
 *    Backdraw finalist had passed into the grand final; the Backdraw final is undecided again and the finalist stayed
 *    in `Main|4|1`. The removal released from the round after the final and never asked the final's own link.
 *  - de 9301605 (DE 8/4, propagation on), found by factory-d3: `reconcileStaleExitOrigins` withdraws the grand
 *    final's walkover and releases its winner, but the Decider is also fed by a LOSER link out of that round, and
 *    the loser stayed seated in it.
 */

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const across = (drawId: string) =>
  ((tournamentEngine.getDrawInconsistencies({ drawId }) as any).inconsistencies ?? []).filter(
    (issue: any) => issue.issueType === ADVANCED_ACROSS_LINK_FROM_UNDECIDED,
  );
const occupants = (matchUp: any) => (matchUp?.sides ?? []).map((side: any) => side?.participantId).filter(Boolean);

function playOut(drawId: string, structureNames: string[]) {
  for (let guard = 0; guard < 32; guard++) {
    const next = getDrawMatchUps(drawId).find(
      (matchUp: any) =>
        structureNames.includes(matchUp.structureName) &&
        !matchUp.winningSide &&
        matchUp.matchUpStatus === TO_BE_PLAYED &&
        occupants(matchUp).length === 2,
    );
    if (!next) return;
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: next.matchUpId,
      outcome: { winningSide: 1 },
      drawId,
    });
    expect(result.success).toEqual(true);
  }
}

it('reports a finalist left in the grand final after the Backdraw final lost its result', () => {
  const drawId = 'cross-link-report';
  setSubscriptions({});
  prepareDraw({ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount: 8, seed: 1 } as any, drawId);
  playOut(drawId, ['Main', 'Backdraw']);

  const backdrawFinal = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === 'Backdraw|4|1');
  const champion = backdrawFinal.sides.find((side: any) => side.sideNumber === backdrawFinal.winningSide).participantId;
  // CONTROL: the Backdraw champion crossed into the grand final, and the draw is consistent
  expect(occupants(getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === 'Main|4|1'))).toContain(champion);
  expect(across(drawId)).toEqual([]);

  // v1's leftover, on the stored record: the Backdraw final's result is gone, its winner still in the grand final
  const tournamentRecord: any = tournamentEngine.getTournament().tournamentRecord;
  const stored = tournamentRecord.events
    .flatMap((event: any) => event.drawDefinitions ?? [])
    .flatMap((drawDefinition: any) => drawDefinition.structures ?? [])
    .flatMap((structure: any) => structure.matchUps ?? [])
    .find((matchUp: any) => matchUp.matchUpId === backdrawFinal.matchUpId);
  stored.matchUpStatus = TO_BE_PLAYED;
  delete stored.winningSide;
  delete stored.score;
  tournamentEngine.setState(tournamentRecord);

  const found = across(drawId);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({
    participantId: champion,
    linkType: 'WINNER',
    sourceMatchUpId: backdrawFinal.matchUpId,
  });
  expect((tournamentEngine.getDrawInconsistencies({ drawId }) as any).valid).toEqual(false);
});

it('a removal that leaves the Backdraw final undecided takes its finalist out of the grand final (de 9303011)', () => {
  const drawId = 'cross-link-9303011';
  setSubscriptions({});
  prepareDraw(
    {
      drawType: DOUBLE_ELIMINATION,
      drawSize: 8,
      participantsCount: 4,
      seed: 9303011,
      propagateExitStatus: false,
    } as any,
    drawId,
  );
  const find = (coordinate: string) => getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinate);
  for (const [coordinate, outcome] of [
    ['Main|2|2', { winningSide: 1 }],
    ['Main|2|1', { winningSide: 2 }],
    ['Main|3|1', { matchUpStatus: DOUBLE_DEFAULT }],
    ['Backdraw|3|1', { winningSide: 2 }],
    ['Backdraw|3|1', { winningSide: 1 }],
  ] as [string, any][]) {
    expect(
      tournamentEngine.setMatchUpStatus({ matchUpId: find(coordinate).matchUpId, outcome, drawId }).success,
    ).toEqual(true);
  }
  const finalist = find('Backdraw|3|1').sides.find((side: any) => side.sideNumber === 1).participantId;
  // CONTROL: the finalist passed the Backdraw final's BYE into the grand final
  expect(find('Backdraw|4|1').matchUpStatus).toEqual('BYE');
  expect(occupants(find('Main|4|1'))).toContain(finalist);

  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: find('Main|3|1').matchUpId,
    outcome: { winningSide: 2 },
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(find('Backdraw|4|1').winningSide).toBeUndefined();
  expect(occupants(find('Backdraw|4|1'))).toContain(finalist);
  expect(occupants(find('Main|4|1'))).not.toContain(finalist);
  expect(across(drawId)).toEqual([]);
});

it('a withdrawn grand-final walkover takes its loser back out of the Decider (de 9301605)', () => {
  const drawId = 'cross-link-9301605';
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount: 4, drawId }],
    nonRandom: 9301605,
    setState: true,
  });
  const find = (coordinate: string) => getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinate);
  const submit = (coordinate: string, outcome: any) =>
    tournamentEngine.setMatchUpStatus({
      matchUpId: find(coordinate).matchUpId,
      outcome,
      drawId,
      propagateExitStatus: true,
    });
  for (const [coordinate, outcome] of [
    ['Main|2|1', { winningSide: 1 }],
    ['Main|2|2', { winningSide: 2 }],
    ['Backdraw|3|1', { matchUpStatus: DOUBLE_DEFAULT }],
    ['Main|3|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ] as [string, any][]) {
    expect(submit(coordinate, outcome).success).toEqual(true);
  }
  // CONTROL: the convergence's produced walkover decides the grand final, and its winner is seated in the Decider
  expect(find('Backdraw|4|1').matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(find('Main|4|1').matchUpStatus).toEqual(WALKOVER);
  expect(occupants(find('Decider|1|1'))).toHaveLength(1);

  expect(submit('Main|3|1', { winningSide: 2 }).success).toEqual(true);
  const final = find('Main|4|1');
  expect(final.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(occupants(final)).toHaveLength(2);
  for (const finalist of occupants(final)) expect(occupants(find('Decider|1|1'))).not.toContain(finalist);
  expect(across(drawId)).toEqual([]);
});
