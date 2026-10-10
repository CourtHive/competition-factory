import { removeCompetitionProfile, setCompetitionProfile } from '@Mutate/drawDefinitions/competitionProfile';
import { addDrawEntries } from '@Mutate/drawDefinitions/addDrawEntries';
import { addAdHocMatchUps } from '@Mutate/structures/addAdHocMatchUps';
import { addEventEntries } from '@Mutate/entries/addEventEntries';
import { checkValidEntries } from '@Validators/checkValidEntries';
import { matchUpsOf } from '@Acquire/structureMembers';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { CompetitionProfile } from '@Types/competitionProfile';
import {
  INVALID_ENTRIES,
  INVALID_PARTICIPANT_IDS,
  INVALID_VALUES,
  SHARED_INDIVIDUAL_PARTICIPANT,
} from '@Constants/errorConditionConstants';

const profile: CompetitionProfile = {
  version: 1,
  format: 'AMERICANO',
  entrantScope: 'INDIVIDUAL',
  matchUpType: 'DOUBLES',
  scoring: { combinedPointTotal: 32, selectedVariant: { tieResolution: 'ALLOW' } },
  standings: { metric: 'SIDE_POINTS', attribution: 'EACH_INDIVIDUAL' },
  pairing: { seed: 42, algorithmVersion: 1 },
  completion: { kind: 'PARTNERSHIP_COVERAGE' },
};
function setup() {
  const drawDefinition: DrawDefinition = {
    drawId: 'rotating',
    drawType: 'AD_HOC',
    matchUpType: 'DOUBLES',
    competitionProfile: structuredClone(profile),
    entries: [],
    structures: [],
  };
  const event: Event = { eventId: 'doubles', eventType: 'DOUBLES', entries: [], drawDefinitions: [drawDefinition] };
  const tournamentRecord: Tournament = {
    tournamentId: 't',
    events: [event],
    participants: [
      ...Array.from({ length: 8 }, (_, index) => ({
        participantId: `p${index}`,
        participantType: 'INDIVIDUAL' as const,
        participantRole: 'COMPETITOR' as const,
        person: { personId: `person${index}`, sex: 'MALE' as const },
      })),
      { participantId: 'pair', participantType: 'PAIR', individualParticipantIds: ['p0', 'p1'] },
      { participantId: 'official', participantType: 'INDIVIDUAL', participantRole: 'OFFICIAL' },
    ],
  };
  return { drawDefinition, event, tournamentRecord, drawId: drawDefinition.drawId };
}

it('enters individuals directly into a rotating doubles draw and validates scoped/global entries', () => {
  const context = setup();
  const participantIds = ['p0', 'p1', 'p2', 'p3'];
  expect(addEventEntries({ ...context, participantIds }).success).toBe(true);
  expect(context.drawDefinition.entries?.map((entry) => entry.participantId)).toEqual(participantIds);
  expect(context.event.entries?.map((entry) => entry.participantId)).toEqual(participantIds);
  expect(checkValidEntries(context)).toMatchObject({ valid: true });
  expect(checkValidEntries({ event: context.event, tournamentRecord: context.tournamentRecord })).toMatchObject({
    valid: true,
  });
});

it.each(['pair', 'official', 'missing'])('refuses %s before any event or draw write', (badId) => {
  const context = setup();
  const before = structuredClone(context.tournamentRecord);
  expect(addEventEntries({ ...context, participantIds: ['p0', badId] }).error).toBe(INVALID_PARTICIPANT_IDS);
  expect(context.tournamentRecord).toEqual(before);
});

it('preserves gender validation and permits an explicit existing gender-policy override', () => {
  const context = setup();
  context.event.gender = 'FEMALE';
  const before = structuredClone(context.tournamentRecord);
  expect(addEventEntries({ ...context, participantIds: ['p0'] }).error).toBe(INVALID_PARTICIPANT_IDS);
  expect(context.tournamentRecord).toEqual(before);
  expect(addEventEntries({ ...context, participantIds: ['p0'], enforceGender: false }).success).toBe(true);
  expect(checkValidEntries(context).error).toBe(INVALID_ENTRIES);
  expect(checkValidEntries({ ...context, enforceGender: false })).toMatchObject({ valid: true });
});

it('leaves ordinary doubles admission unchanged and requires the drawId opt-in', () => {
  const context = setup();
  expect(
    addEventEntries({ event: context.event, tournamentRecord: context.tournamentRecord, participantIds: ['p0'] }).error,
  ).toBe(INVALID_PARTICIPANT_IDS);
  delete context.drawDefinition.competitionProfile;
  expect(addEventEntries({ ...context, participantIds: ['p0'] }).error).toBe(INVALID_PARTICIPANT_IDS);
  expect(addEventEntries({ ...context, participantIds: ['pair'] }).success).toBe(true);
});

it('refuses PAIR draw entries even if already entered in the event', () => {
  const context = setup();
  context.event.entries = [{ participantId: 'pair', entryStatus: 'DIRECT_ACCEPTANCE' }];
  const before = structuredClone(context.tournamentRecord);
  expect(
    addDrawEntries({
      ...context,
      participantIds: ['pair'],
      entryStageSequence: undefined,
      ignoreStageSpace: undefined,
      entryStatus: undefined,
      roundTarget: undefined,
      entryStage: undefined,
      extension: undefined,
    }).error,
  ).toBe(INVALID_PARTICIPANT_IDS);
  expect(context.tournamentRecord).toEqual(before);
});

it('refuses attaching a rotating profile to a PAIR roster', () => {
  const context = setup();
  delete context.drawDefinition.competitionProfile;
  context.drawDefinition.entries = [{ participantId: 'pair', entryStatus: 'DIRECT_ACCEPTANCE' }];
  const before = structuredClone(context.drawDefinition);
  expect(setCompetitionProfile({ ...context, competitionProfile: profile }).error).toBe(INVALID_PARTICIPANT_IDS);
  expect(context.drawDefinition).toEqual(before);
});

it('detects missing and non-competitor entrants on a persisted rotating roster', () => {
  const context = setup();
  context.drawDefinition.entries = [
    { participantId: 'missing', entryStatus: 'DIRECT_ACCEPTANCE' },
    { participantId: 'official', entryStatus: 'DIRECT_ACCEPTANCE' },
  ];
  expect(checkValidEntries(context).invalidParticipantIds).toEqual(['missing', 'official']);
});

it('admits through public engine IDs and does not manufacture PAIR entrants', () => {
  const context = setup();
  tournamentEngine.setState(context.tournamentRecord);
  expect(
    tournamentEngine.addEventEntries({
      drawId: context.drawId,
      eventId: context.event.eventId,
      participantIds: ['p0', 'p1', 'p2', 'p3'],
    }).success,
  ).toBe(true);
  expect(tournamentEngine.checkValidEntries({ drawId: context.drawId }).valid).toBe(true);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: context.drawId });
  expect(drawDefinition.entries.map((entry) => entry.participantId)).toEqual(['p0', 'p1', 'p2', 'p3']);
});

function sideContext() {
  const context = setup();
  addEventEntries({ ...context, participantIds: ['p0', 'p1', 'p2', 'p3'] });
  context.tournamentRecord.participants!.push({
    participantId: 'other-pair',
    participantType: 'PAIR',
    individualParticipantIds: ['p2', 'p3'],
  });
  context.drawDefinition.structures = [{ structureId: 's', matchUps: [] }];
  return context;
}
const pairedMatch = (matchUpId = 'm', roundNumber = 1) => ({
  matchUpId,
  roundNumber,
  sides: [
    { sideNumber: 1, participantId: 'pair' },
    { sideNumber: 2, participantId: 'other-pair' },
  ],
});

it('accepts PAIR match sides without entering partnerships into the individual roster', () => {
  const context = sideContext();
  expect(addAdHocMatchUps({ ...context, matchUps: [pairedMatch()] }).success).toBe(true);
  expect(context.drawDefinition.entries?.map((entry) => entry.participantId)).toEqual(['p0', 'p1', 'p2', 'p3']);
  expect(matchUpsOf(context.drawDefinition.structures?.[0])).toHaveLength(1);
  expect(addAdHocMatchUps({ ...context, matchUps: [pairedMatch('next', 2)] }).success).toBe(true);
});

it.each(['p0', 'missing'])('refuses non-PAIR side %s without inserting matches', (id) => {
  const context = sideContext();
  const matchUp = pairedMatch();
  matchUp.sides[0].participantId = id;
  expect(addAdHocMatchUps({ ...context, matchUps: [matchUp] }).error).toBe(INVALID_VALUES);
  expect(matchUpsOf(context.drawDefinition.structures?.[0])).toHaveLength(0);
});

it.each([{ members: ['p0', 'p0'] }, { members: ['p0', 'p4'] }, { members: ['p0', 'missing'] }])(
  'refuses invalid side membership %j',
  ({ members }) => {
    const context = sideContext();
    context.tournamentRecord.participants!.find(
      (participant) => participant.participantId === 'pair',
    )!.individualParticipantIds = members;
    const before = structuredClone(context.tournamentRecord);
    expect(addAdHocMatchUps({ ...context, matchUps: [pairedMatch()] }).error).toBe(INVALID_VALUES);
    expect(context.tournamentRecord).toEqual(before);
  },
);

it('refuses repeat people within a batch or an already populated logical round', () => {
  const context = sideContext();
  expect(addAdHocMatchUps({ ...context, matchUps: [pairedMatch(), pairedMatch('duplicate')] }).error).toBe(
    SHARED_INDIVIDUAL_PARTICIPANT,
  );
  expect(matchUpsOf(context.drawDefinition.structures?.[0])).toHaveLength(0);
  expect(addAdHocMatchUps({ ...context, matchUps: [pairedMatch()] }).success).toBe(true);
  expect(addAdHocMatchUps({ ...context, matchUps: [pairedMatch('duplicate')] }).error).toBe(
    SHARED_INDIVIDUAL_PARTICIPANT,
  );
  expect(matchUpsOf(context.drawDefinition.structures?.[0])).toHaveLength(1);
});

it('supports Mexicano individual admission under the same opt-in contract', () => {
  const context = setup();
  context.drawDefinition.competitionProfile = {
    ...profile,
    format: 'MEXICANO',
    pairing: { seed: 42, algorithmVersion: 1, groupBy: 'ADJACENT_STANDINGS', partners: 'FIRST_FOURTH_SECOND_THIRD' },
    completion: { kind: 'ROUND_COUNT', rounds: 7 },
  };
  expect(addEventEntries({ ...context, participantIds: ['p0', 'p1', 'p2', 'p3'] }).success).toBe(true);
  expect(checkValidEntries(context)).toMatchObject({ valid: true });
});

it('keeps event entries ungrouped and acceptance exclusive to the rotating draw', () => {
  const context = setup();
  expect(addEventEntries({ ...context, participantIds: ['p0', 'p1'] }).success).toBe(true);
  expect(context.event.entries?.map((entry) => entry.entryStatus)).toEqual(['UNGROUPED', 'UNGROUPED']);
  expect(context.drawDefinition.entries?.map((entry) => entry.entryStatus)).toEqual([
    'DIRECT_ACCEPTANCE',
    'DIRECT_ACCEPTANCE',
  ]);
  expect(checkValidEntries({ event: context.event, tournamentRecord: context.tournamentRecord })).toMatchObject({
    valid: true,
  });
});

it('preserves explicit UNPAIRED event admission while accepting the rotating roster', () => {
  const context = setup();
  expect(addEventEntries({ ...context, entryStatus: 'UNPAIRED', participantIds: ['p0'] }).success).toBe(true);
  expect(context.event.entries?.[0].entryStatus).toBe('UNPAIRED');
  expect(context.drawDefinition.entries?.[0].entryStatus).toBe('DIRECT_ACCEPTANCE');
});

it('refuses rotating individuals in an ordinary draw in the same doubles event', () => {
  const context = setup();
  addEventEntries({ ...context, participantIds: Array.from({ length: 8 }, (_, index) => `p${index}`) });
  const plain: DrawDefinition = {
    drawId: 'plain',
    drawType: 'AD_HOC',
    matchUpType: 'DOUBLES',
    entries: [],
    structures: [],
  };
  context.event.drawDefinitions!.push(plain);
  tournamentEngine.setState(context.tournamentRecord);
  const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
  expect(tournamentEngine.addDrawEntries({ drawId: 'plain', participantIds: ['p0', 'p1'] }).error).toBe(
    INVALID_ENTRIES,
  );
  expect(tournamentEngine.getTournament().tournamentRecord.events).toEqual(before.events);
  expect(tournamentEngine.getTournament().tournamentRecord.participants).toEqual(before.participants);
  const consideredEntries = [{ participantId: 'p0', entryStatus: 'DIRECT_ACCEPTANCE' as const }];
  expect(checkValidEntries({ ...context, drawDefinition: plain, consideredEntries }).error).toBe(INVALID_ENTRIES);
  expect(
    checkValidEntries({ ...context, drawDefinition: plain, consideredEntries: context.event.entries }),
  ).toMatchObject({ valid: true });
  const generated = tournamentEngine.generateDrawDefinition({
    eventId: context.event.eventId,
    drawType: 'SINGLE_ELIMINATION',
    drawSize: 8,
  });
  // An ordinary generator may create an empty bracket, but cannot select ungrouped people.
  expect(generated.drawDefinition?.entries ?? []).toHaveLength(0);
});

it('keeps the doubles event valid after deleting its rotating draw', () => {
  const context = setup();
  addEventEntries({ ...context, participantIds: ['p0', 'p1', 'p2', 'p3'] });
  tournamentEngine.setState(context.tournamentRecord);
  expect(
    tournamentEngine.deleteDrawDefinitions({ eventId: context.event.eventId, drawIds: [context.drawId] }).success,
  ).toBe(true);
  const { event } = tournamentEngine.getEvent({ eventId: context.event.eventId });
  expect(event.drawDefinitions).toHaveLength(0);
  expect(event.entries).toHaveLength(4);
  expect(event.entries.every((entry) => entry.entryStatus === 'UNGROUPED')).toBe(true);
  expect(tournamentEngine.checkValidEntries({ eventId: event.eventId }).valid).toBe(true);
});

it('refuses profile removal while individual draw entrants remain', () => {
  const context = setup();
  addEventEntries({ ...context, participantIds: ['p0', 'p1'] });
  const before = structuredClone(context.tournamentRecord);
  expect(removeCompetitionProfile(context).error).toBe(INVALID_VALUES);
  expect(context.tournamentRecord).toEqual(before);
  context.drawDefinition.entries = [];
  expect(removeCompetitionProfile(context).success).toBe(true);
  expect(checkValidEntries({ event: context.event, tournamentRecord: context.tournamentRecord })).toMatchObject({
    valid: true,
  });
});

it('keeps rotating ungrouped event entries when ordinary doubles PAIRs are admitted', () => {
  const context = setup();
  addEventEntries({ ...context, participantIds: ['p0', 'p1'] });
  expect(
    addEventEntries({ event: context.event, tournamentRecord: context.tournamentRecord, participantIds: ['pair'] })
      .success,
  ).toBe(true);
  expect(context.event.entries?.map((entry) => [entry.participantId, entry.entryStatus])).toEqual([
    ['p0', 'UNGROUPED'],
    ['p1', 'UNGROUPED'],
    ['pair', 'DIRECT_ACCEPTANCE'],
  ]);
});

it('does not grant event-level acceptance because an individual belongs to a rotating draw', () => {
  const context = setup();
  addEventEntries({ ...context, participantIds: ['p0'] });
  context.event.entries![0].entryStatus = 'DIRECT_ACCEPTANCE';
  expect(checkValidEntries({ event: context.event, tournamentRecord: context.tournamentRecord }).error).toBe(
    INVALID_ENTRIES,
  );
  expect(checkValidEntries(context)).toMatchObject({ valid: true });
});

it('keeps placement-oriented withDraws behavior consistent for unplaced AD_HOC entrants', () => {
  const context = setup();
  addEventEntries({ ...context, participantIds: ['p0', 'p1'] });
  const plain: DrawDefinition = {
    drawId: 'plain',
    drawType: 'AD_HOC',
    matchUpType: 'DOUBLES',
    entries: [],
    structures: [],
  };
  context.event.drawDefinitions!.push(plain);
  expect(
    addEventEntries({ ...context, drawDefinition: plain, drawId: plain.drawId, participantIds: ['pair'] }).success,
  ).toBe(true);
  tournamentEngine.setState(context.tournamentRecord);
  const { participants } = tournamentEngine.getParticipants({ withEvents: true, withDraws: true });
  expect(participants.find((participant) => participant.participantId === 'p0').draws).toHaveLength(0);
  expect(participants.find((participant) => participant.participantId === 'pair').draws).toHaveLength(0);
});

it('public checkValidEntries selects event or draw entries and honours explicit overrides', () => {
  const context = setup();
  context.event.entries = [{ participantId: 'p0', entryStatus: 'DIRECT_ACCEPTANCE' }];
  const plain: DrawDefinition = {
    drawId: 'plain',
    drawType: 'AD_HOC',
    matchUpType: 'DOUBLES',
    entries: [{ participantId: 'pair', entryStatus: 'DIRECT_ACCEPTANCE' }],
    structures: [],
  };
  context.event.drawDefinitions!.push(plain);
  context.drawDefinition.entries = [{ participantId: 'p1', entryStatus: 'DIRECT_ACCEPTANCE' }];
  tournamentEngine.setState(context.tournamentRecord);

  expect(tournamentEngine.checkValidEntries({ eventId: context.event.eventId })).toMatchObject({
    error: INVALID_ENTRIES,
    invalidParticipantIds: ['p0'],
  });
  expect(tournamentEngine.checkValidEntries({ drawId: plain.drawId })).toMatchObject({ valid: true });
  expect(tournamentEngine.checkValidEntries({ drawId: context.drawId })).toMatchObject({ valid: true });
  expect(
    tournamentEngine.checkValidEntries({ drawId: plain.drawId, consideredEntries: context.event.entries }),
  ).toMatchObject({ error: INVALID_ENTRIES, invalidParticipantIds: ['p0'] });
  expect(tournamentEngine.checkValidEntries({ eventId: context.event.eventId, consideredEntries: [] })).toMatchObject({
    valid: true,
  });
  expect(tournamentEngine.checkValidEntries({ drawId: plain.drawId, consideredEntries: [] })).toMatchObject({
    valid: true,
  });
});
