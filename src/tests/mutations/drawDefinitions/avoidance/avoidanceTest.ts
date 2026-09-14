import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect } from 'vitest';

// constants and fixtures
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { POLICY_TYPE_AVOIDANCE } from '@Constants/policyConstants';
import SEEDING_ITF from '@Fixtures/policies/POLICY_SEEDING_ITF';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { RANKING } from '@Constants/scaleConstants';

/**
 *
 * @param {object} avoidance - an avoidance policy
 * @param {string} eventType - DOUBLES or SINGLES; controls what type of event is generated
 * @param {string} participantType = INDIVIDUAL or PAIR; used to filter participants for draw generation
 *
 * @param {number} valuesCount - how many variations to generate for each value type
 * @param {number} participantsCount - how many participants to place in the draw
 * @param {string} drawType - type of draw to generate
 *
 */

export function avoidanceTest(params) {
  const { avoidance, eventType, participantType, sex } = params;
  const { valuesCount = 10, valuesInstanceLimit, participantsCount = 32, drawType = SINGLE_ELIMINATION } = params;

  let { seedsCount } = params;
  if (!seedsCount) seedsCount = participantsCount / 4;

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    startDate: '2020-01-01',
    endDate: '2020-01-06',

    participantsProfile: {
      nationalityCodesCount: valuesCount,
      valuesInstanceLimit,
      participantsCount,
      participantType,
      inContext: true,
      sex,

      addressProps: {
        citiesCount: valuesCount,
        statesCount: valuesCount,
        postalCodesCount: valuesCount,
      },
    },
  });

  const { participants } = tournamentRecord;

  tournamentEngine.setState(tournamentRecord);

  const drawSize = 32;
  const category = { categoryName: 'U18' };

  const eventParticipantType = (eventType === SINGLES && INDIVIDUAL) || (DOUBLES && PAIR);

  const relevantParticipants = participants
    .filter((participant) => participant.participantType === eventParticipantType)
    .slice(0, seedsCount);

  relevantParticipants.forEach((participant, index) => {
    const scaleItem = {
      scaleValue: index + 1,
      scaleName: category.categoryName,
      scaleType: RANKING,
      eventType: eventType,
    };

    const { participantId } = participant;
    tournamentEngine.setParticipantScaleItem({ participantId, scaleItem });
  });

  const event = {
    eventName: 'Test Event',
    category,
    eventType,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: eventResult, success } = result;
  const { eventId } = eventResult;
  expect(success).toEqual(true);

  const eventParticipants = participants.filter((participant) => participant.participantType === eventParticipantType);
  const participantIds = eventParticipants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const values = {
    policyDefinitions: { [POLICY_TYPE_AVOIDANCE]: avoidance, ...SEEDING_ITF },
    event: eventResult,
    automated: true,
    seedsCount,
    drawSize,
    drawType,
    eventId,
  };
  const { error, conflicts, drawDefinition } = tournamentEngine.generateDrawDefinition(values);

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const upcomingMatchUps = tournamentEngine.drawMatchUps({
    drawId: drawDefinition.drawId,
    inContext: true,
  }).upcomingMatchUps;
  const report = upcomingMatchUps.map((m) => ({
    drawPositions: m.drawPositions,
    seeds: m.sides.map((s) => s.seedValue || ''),
    names: m.sides.map((s) => s.participant.name || s.participant.participantName),
    ioc: m.sides.map((s) => {
      if (eventType === DOUBLES) {
        return s.participant.individualParticipants.map((i) => i.person.nationalityCode);
      } else {
        return s.participant.person.nationalityCode;
      }
    }),
  }));

  return { conflicts, drawDefinition, error, participants, report };
}
