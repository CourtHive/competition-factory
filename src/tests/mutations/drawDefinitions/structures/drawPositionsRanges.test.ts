import { feedInChampionship } from '@Tests/mutations/drawDefinitions/primitives/feedIn';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { intersection } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { FEED_IN_CHAMPIONSHIP_TO_SF } from '@Constants/drawDefinitionConstants';
import { SINGLES } from '@Constants/eventConstants';

it('can add drawPositionsRange to inContext matchUps in a SINGLE_ELIMINATION structure', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  const { participants } = tournamentRecord;

  tournamentEngine.setState(tournamentRecord);

  const eventName = 'Test Event';
  const event = {
    eventName,
    eventType: SINGLES,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: eventResult, success } = result;
  const { eventId } = eventResult;
  expect(success).toEqual(true);

  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.addedEntriesCount).toEqual(0);
  expect(result.success).toEqual(true);

  const matchUpFormat = 'SET5-S:4/TB7';
  const values = {
    event: eventResult,
    automated: true,
    matchUpFormat,
    drawSize: 32,
    eventId,
  };
  const { drawDefinition } = tournamentEngine.generateDrawDefinition(values);
  const structure = drawDefinition.structures[0];

  const { matchUps } = getAllStructureMatchUps({
    structure,
    inContext: true,
    drawDefinition,
  });

  const expectations = {
    1: { 1: '1-2' },
    2: { 1: '1-4' },
    3: { 1: '1-8' },
    4: { 1: '1-16' },
    5: { 1: '1-32' },
  };

  matchUps.forEach((matchUp) => {
    const { drawPositions, drawPositionsRange, roundNumber, roundPosition } = matchUp;

    const expectation = expectations?.[roundNumber][roundPosition];
    if (expectation) {
      expect(expectation).toEqual(drawPositionsRange.firstRoundDrawPositionsRange);
    }

    if (drawPositions) {
      const filteredDrawPositions = drawPositions.filter(Boolean);
      const overlap = intersection(filteredDrawPositions, drawPositionsRange.possibleDrawPositions);
      if (filteredDrawPositions.length) {
        expect(overlap.length).toBeGreaterThan(0);
      }
    }
  });
});

it('can add drawPositionsRange to inContext matchUps in a FEED_IN_CHAMPIONSHIP_TO_SF', () => {
  const { links, drawDefinition, mainDrawMatchUps, consolationMatchUps, consolationStructure } = feedInChampionship({
    drawSize: 32,
    drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
    feedPolicy: { roundGroupedOrder: [] },
  });

  expect(mainDrawMatchUps.length).toEqual(31);
  expect(consolationMatchUps.length).toEqual(29);
  expect(links.length).toEqual(4);

  const { matchUps } = getAllStructureMatchUps({
    structure: consolationStructure,
    inContext: true,
    drawDefinition,
  });

  const expectations = {
    1: { 1: '15-16' },
    2: { 1: '15-16' },
    3: { 1: '15-18' },
    4: { 1: '15-18' },
    5: { 1: '15-22' },
    6: { 1: '15-22' },
    7: { 1: '15-30' },
  };

  matchUps.forEach((matchUp) => {
    const { drawPositions, drawPositionsRange, roundNumber, roundPosition } = matchUp;

    const expectation = expectations?.[roundNumber][roundPosition];
    if (expectation) {
      expect(expectation).toEqual(drawPositionsRange.firstRoundDrawPositionsRange);
    }

    if (drawPositions) {
      const filteredDrawPositions = drawPositions.filter(Boolean);
      const overlap = intersection(filteredDrawPositions, drawPositionsRange.possibleDrawPositions);
      if (filteredDrawPositions.length) {
        expect(overlap.length).toBeGreaterThan(0);
      }
    }
  });
});
