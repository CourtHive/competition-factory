import { getTournamentInconsistencies } from '@Query/tournaments/getTournamentInconsistencies';
import { buildFromSources } from '@Generators/ingestion/buildFromSources/buildFromSources';
import { firstClassOrExtension } from '@Helpers/extensions/firstClassOrExtension';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants and types
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { DISABLE_LINKS } from '@Constants/extensionConstants';
import { Tournament } from '@Types/tournamentTypes';

/**
 * A loser removed from the consolation slot they feed, and replaced with a BYE, was not dropped.
 *
 * `removeDrawPositionAssignment` with `replaceWithBye` DISABLES that position's links, and the engine then feeds nobody
 * there: it is how a loser who declined a consolation is recorded. The integrity scan did not ask, and reported the
 * engine's own state as DROPPED_PROGRESSION; and buildFromSources dropped the marker, so every rebuilt record read so
 * too. Found 2026-11-06 on two 2022 junior opens.
 */
const ONE_SET = { winningSide: 1, sets: [{ setNumber: 1, side1Score: 6, side2Score: 0, winningSide: 1 }] };
const dropped = (tournamentRecord) =>
  ((getTournamentInconsistencies({ tournamentRecord: tournamentRecord as Tournament }) as any).inconsistencies ?? [])
    .filter((i) => i.issueType === 'DROPPED_PROGRESSION')
    .map((i) => i.participantId);

function declinedConsolation() {
  const {
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8 }],
    setState: true,
    nonRandom: 1,
  });
  const firstRound = tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.filter((m) => m.stage === MAIN && m.roundNumber === 1);
  for (const matchUp of firstRound) {
    expect(
      tournamentEngine.setMatchUpStatus({ drawId, matchUpId: matchUp.matchUpId, outcome: ONE_SET }).success,
    ).toEqual(true);
  }
  const declined = firstRound[0].sides.find((side) => side.sideNumber === 2).participantId;
  const consolation = tournamentEngine
    .getEvent({ drawId })
    .drawDefinition.structures.find((s) => s.stage === CONSOLATION);
  const drawPosition = consolation.positionAssignments.find((a) => a.participantId === declined).drawPosition;
  const result = tournamentEngine.removeDrawPositionAssignment({
    structureId: consolation.structureId,
    replaceWithBye: true,
    drawPosition,
    drawId,
  });
  expect(result.success).toEqual(true);
  return { drawId, eventId, declined, drawPosition, consolationStructureId: consolation.structureId };
}

describe('a loser replaced with a BYE in the slot they feed', () => {
  it('is not reported dropped: the engine disabled that position', () => {
    declinedConsolation();
    expect(dropped(tournamentEngine.getTournament().tournamentRecord)).toEqual([]);
  });

  it('IS reported when the position was emptied without disabling it', () => {
    // the falsification: the same absence, minus the marker the engine writes
    const { declined, drawPosition, consolationStructureId } = declinedConsolation();
    const record = tournamentEngine.getTournament().tournamentRecord;
    const consolation = record.events[0].drawDefinitions[0].structures.find(
      (s) => s.structureId === consolationStructureId,
    );
    const assignment = consolation.positionAssignments.find((a) => a.drawPosition === drawPosition);
    delete assignment.disableLinks;
    assignment.extensions = (assignment.extensions ?? []).filter((e) => e.name !== DISABLE_LINKS);
    expect(dropped(record)).toEqual([declined]);
  });

  // A source that publishes its positions (a 2022 export does; current getEventData publishes none) carries the marker.
  const publishedWithPositions = (form: 'firstClass' | 'extension') => {
    const { drawId, eventId, drawPosition, consolationStructureId } = declinedConsolation();
    const stored = tournamentEngine
      .getEvent({ drawId })
      .drawDefinition.structures.find((s) => s.structureId === consolationStructureId);
    const { eventData } = tournamentEngine.getEventData({ eventId });
    const source = eventData.drawsData[0].structures.find((s) => s.structureId === consolationStructureId);
    source.positionAssignments = structuredClone(stored.positionAssignments);
    if (form === 'extension') {
      const assignment = source.positionAssignments.find((a) => a.drawPosition === drawPosition);
      delete assignment.disableLinks;
      assignment.extensions = [{ name: DISABLE_LINKS, value: true }];
    }
    const { record } = buildFromSources([eventData]);
    const rebuilt = record.events[0].drawDefinitions[0].structures.find(
      (s) => s.structureId === consolationStructureId,
    );
    return { record, assignment: rebuilt.positionAssignments.find((a) => a.drawPosition === drawPosition) };
  };

  it('keeps its disabled position through buildFromSources, so the rebuilt record reads the same', () => {
    const { record, assignment } = publishedWithPositions('firstClass');
    expect(assignment.bye).toEqual(true);
    expect(firstClassOrExtension({ element: assignment, attribute: 'disableLinks', name: DISABLE_LINKS })).toEqual(
      true,
    );
    expect(dropped(record)).toEqual([]);
  });

  it('reads the legacy extension form a 2022 export carries', () => {
    const { record, assignment } = publishedWithPositions('extension');
    expect(firstClassOrExtension({ element: assignment, attribute: 'disableLinks', name: DISABLE_LINKS })).toEqual(
      true,
    );
    expect(dropped(record)).toEqual([]);
  });
});
