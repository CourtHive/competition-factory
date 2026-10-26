import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { AD_HOC, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM } from '@Constants/matchUpTypes';

/**
 * What hydration derives, as CA ruled it on 2026-10-26 (Mentat planning/HYDRATION_DERIVATIONS_SCHEDULING_FIELDS.md
 * § 9). Each case states one ruling, written from the ruling, not recorded from the engine.
 */
const inContext = (drawId: string) =>
  tournamentEngine.allDrawMatchUps({ drawId, inContext: true, nextMatchUps: true }).matchUps;
const storedMatchUps = (record: any, drawId: string) =>
  record.events
    .flatMap((event: any) => event.drawDefinitions ?? [])
    .filter((drawDefinition: any) => drawDefinition.drawId === drawId)
    .flatMap((drawDefinition: any) => drawDefinition.structures.flatMap((structure: any) => structure.matchUps ?? []));
const ids = (potentials: any[] = []) =>
  potentials.flat().map((entry: any) => entry.participantId ?? (entry.bye ? 'BYE' : '?'));

describe('a BYE dual: its lines hydrate as BYE (OPEN-1)', () => {
  it('every line of a BYE dual is BYE in context, while stored TO_BE_PLAYED', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, participantsCount: 6, eventType: TEAM_EVENT }],
      setState: true,
    });
    const matchUps = inContext(drawId);
    const byeDuals = matchUps.filter((m: any) => m.matchUpType === TEAM && m.matchUpStatus === BYE);
    expect(byeDuals.length).toEqual(2);
    for (const dual of byeDuals) {
      const lines = matchUps.filter((m: any) => m.matchUpTieId === dual.matchUpId);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.map((line: any) => line.matchUpStatus)).toEqual(lines.map(() => BYE));
      // CONTROL: the stored line still says TO_BE_PLAYED; only hydration reads the dual
      const storedDual = storedMatchUps(tournamentEngine.getTournament().tournamentRecord, drawId).find(
        (m: any) => m.matchUpId === dual.matchUpId,
      );
      const storedLine = storedDual.tieMatchUps.find((m: any) => m.matchUpId === lines[0].matchUpId);
      expect(storedLine.matchUpStatus).toEqual(TO_BE_PLAYED);
    }
    // a line of a dual that is played keeps its own status
    const playedDual = matchUps.find((m: any) => m.matchUpType === TEAM && m.matchUpStatus !== BYE);
    const playedLine = matchUps.find((m: any) => m.matchUpTieId === playedDual.matchUpId);
    expect(playedLine.matchUpStatus).toEqual(TO_BE_PLAYED);
  });
});

describe('potentials in a first-match-loser consolation (OPEN-2, OPEN-3)', () => {
  function fmlc() {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, participantsCount: 6, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
      setState: true,
    });
    return inContext(drawId);
  }

  it('the { bye, tbd } marker is a consolation target’s, never a winner target’s', () => {
    const matchUps = fmlc();
    const loserTargetIds = new Set(matchUps.map((m: any) => m.loserTo?.matchUpId).filter(Boolean));
    const markedWinnerTargets = matchUps.filter(
      (m: any) => !loserTargetIds.has(m.matchUpId) && ids(m.potentialParticipants).includes('BYE'),
    );
    expect(markedWinnerTargets.map((m: any) => `${m.structureName} R${m.roundNumber}#${m.roundPosition}`)).toEqual([]);
    // CONTROL: the marker exists, on consolation targets
    expect(matchUps.some((m: any) => ids(m.potentialParticipants).includes('BYE'))).toEqual(true);
  });

  it('no BYE matchUp carries potentials; the matchUp a loser reaches does', () => {
    const matchUps = fmlc();
    const byId = new Map(matchUps.map((m: any) => [m.matchUpId, m]));
    const byesWithPotentials = matchUps.filter((m: any) => m.matchUpStatus === BYE && m.potentialParticipants?.length);
    expect(byesWithPotentials.map((m: any) => `${m.structureName} R${m.roundNumber}#${m.roundPosition}`)).toEqual([]);

    // every undecided source whose loser skips a BYE: its players are potentials of the matchUp loserTo names
    const skipping = matchUps.filter(
      (m: any) =>
        m.loserTo &&
        m.loserMatchUpId !== m.loserTo.matchUpId &&
        !m.winningSide &&
        m.matchUpStatus !== BYE &&
        m.sides?.some((side: any) => side.participantId),
    );
    expect(skipping.length).toBeGreaterThan(0);
    for (const source of skipping) {
      const reached: any = byId.get(source.loserTo.matchUpId);
      const sideIds = source.sides.map((side: any) => side.participantId).filter(Boolean);
      expect(sideIds.every((id: string) => ids(reached.potentialParticipants).includes(id))).toEqual(true);
    }
  });
});

describe('a stored edge does not stop the other being derived (OPEN-10)', () => {
  it('with only loserMatchUpId stored, winnerTo is still derived from the links', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
      setState: true,
    });
    const before = inContext(drawId).find((m: any) => m.roundNumber === 1 && m.stage === 'MAIN');
    expect(before.winnerTo?.matchUpId).toBeDefined();
    expect(before.loserTo?.matchUpId).toBeDefined();

    // drop the stored winner edge from the record the engine holds
    const record = tournamentEngine.getTournament().tournamentRecord;
    const stored = storedMatchUps(record, drawId).find((m: any) => m.matchUpId === before.matchUpId);
    expect(stored.winnerMatchUpId).toBeDefined();
    expect(stored.loserMatchUpId).toBeDefined();
    delete stored.winnerMatchUpId;
    tournamentEngine.setState(record);
    // CONTROL: the edit reached the engine
    expect(
      tournamentEngine.findMatchUp({ drawId, matchUpId: before.matchUpId }).matchUp.winnerMatchUpId,
    ).toBeUndefined();

    const after = inContext(drawId).find((m: any) => m.matchUpId === before.matchUpId);
    expect(after.winnerTo?.matchUpId).toEqual(before.winnerTo.matchUpId);
    expect(after.loserTo?.matchUpId).toEqual(before.loserTo.matchUpId);
  });
});

describe('a dual without drawPositions finds its sides’ lineUps on the draw (OPEN-12)', () => {
  it('an ad hoc dual’s line takes its player from the draw-level lineUp', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: AD_HOC, eventType: TEAM_EVENT, automated: true, roundsCount: 1 }],
      setState: true,
    });
    const matchUps = inContext(drawId);
    const dual = matchUps.find((m: any) => m.matchUpType === TEAM && m.sides?.[0]?.participantId);
    expect(dual).toBeDefined();
    expect(dual.drawPositions ?? []).toEqual([]);
    const line = matchUps.find((m: any) => m.matchUpTieId === dual.matchUpId && m.matchUpType === 'SINGLES');
    const team = tournamentRecord.participants.find((p: any) => p.participantId === dual.sides[0].participantId);
    const [playerId] = team.individualParticipantIds;

    // the side's lineUp kept only on the draw (no lineUp on the matchUp's side), in the record the engine holds
    const record = tournamentEngine.getTournament().tournamentRecord;
    const drawDefinition = record.events[0].drawDefinitions[0];
    drawDefinition.lineUps = {
      [team.participantId]: [
        {
          participantId: playerId,
          collectionAssignments: [{ collectionId: line.collectionId, collectionPosition: line.collectionPosition }],
        },
      ],
    };
    const storedDual = storedMatchUps(record, drawId).find((m: any) => m.matchUpId === dual.matchUpId);
    for (const side of storedDual.sides ?? []) delete side.lineUp;
    tournamentEngine.setState(record);

    const hydratedLine = inContext(drawId).find((m: any) => m.matchUpId === line.matchUpId);
    const side = hydratedLine.sides.find((s: any) => s.sideNumber === dual.sides[0].sideNumber);
    expect(side?.participantId).toEqual(playerId);
  });
});
