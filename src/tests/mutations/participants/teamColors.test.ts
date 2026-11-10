import { writeModeMatrix } from '@Tests/testHarness/writeModeMatrix';
import { addParticipant } from '@Mutate/participants/addParticipant';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';

// constants and types
import schema from '../../../global/schema/tournament.schema.json';
import { TEAM } from '@Constants/participantConstants';

const colors = { primary: '#aabbcc', secondary: '#001122' };

function createTeam() {
  mocksEngine.generateTournamentRecord({ setState: true, nonRandom: 1 });
  let result: any = tournamentEngine.addParticipant({
    participant: {
      participantId: 'branded-team',
      participantType: TEAM,
      participantRole: 'COMPETITOR',
      participantName: 'Branded team',
      teamColors: colors,
    },
    returnParticipant: true,
  });
  expect(result.success).toBe(true);
  return result.participant;
}

writeModeMatrix(() => {
  it('creates, persists, replaces, preserves and clears TEAM branding', () => {
    const team = createTeam();
    expect(team.teamColors).toEqual({ primary: '#AABBCC', secondary: '#001122' });
    const reload = () => {
      const record = makeDeepCopy(tournamentEngine.getTournament().tournamentRecord);
      tournamentEngine.setState(record);
      return tournamentEngine.getParticipants().participants.find((p: any) => p.participantId === team.participantId);
    };
    expect(reload().teamColors).toEqual(team.teamColors);
    let result: any = tournamentEngine.modifyParticipant({
      participant: { participantId: team.participantId, teamColors: { primary: '#ffeedd' } },
    });
    expect(result.success).toBe(true);
    expect(reload().teamColors).toEqual({ primary: '#FFEEDD' });
    for (const value of [undefined, null]) {
      result = tournamentEngine.modifyParticipant({
        participant: { participantId: team.participantId, teamColors: value },
      });
      expect(result.success).toBe(true);
      expect(reload().teamColors).toEqual({ primary: '#FFEEDD' });
    }
    result = tournamentEngine.modifyParticipant({ participant: { participantId: team.participantId, teamColors: {} } });
    expect(result.success).toBe(true);
    expect(reload()).not.toHaveProperty('teamColors');
  });

  it.each([
    { value: [] },
    { value: new Date('2026-11-09') },
    { value: '#ffffff' },
    ...[
      { secondary: '#ffffff' },
      { primary: 'red' },
      { primary: '#fff' },
      { primary: '#11223344' },
      { primary: 'var(--team)' },
      { primary: '#ffffff', unknown: true },
      { primary: '#ffffff', secondary: null },
    ].map((value) => ({ value })),
  ])('refuses malformed colors atomically: $value', ({ value: teamColors }) => {
    const team = createTeam();
    const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    let result: any = tournamentEngine.modifyParticipant({
      participant: { participantId: team.participantId, participantName: 'Must not change', teamColors },
    });
    expect(result.error).toBeDefined();
    expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toBe(before);
    const record: any = { tournamentId: 'empty' };
    result = addParticipant({ tournamentRecord: record, participant: { participantType: TEAM, teamColors } as any });
    expect(result.error).toBeDefined();
    expect(record).toEqual({ tournamentId: 'empty' });
  });

  it('refuses non-TEAM creation and modification, while allowing unchanged legacy whole-participant saves', () => {
    createTeam();
    const participant = tournamentEngine
      .getParticipants()
      .participants.find((p: any) => p.participantType === 'INDIVIDUAL');
    let result: any = tournamentEngine.modifyParticipant({
      participant: { participantId: participant.participantId, teamColors: colors },
    });
    expect(result.error).toBeDefined();
    result = tournamentEngine.addParticipant({
      participant: {
        participantType: 'GROUP',
        participantRole: 'COMPETITOR',
        participantName: 'Group',
        teamColors: colors,
      },
    });
    expect(result.error).toBeDefined();
    const record = tournamentEngine.getTournament().tournamentRecord;
    const team = record.participants.find((p: any) => p.participantId === 'branded-team');
    team.teamColors = { primary: 'legacy-value' };
    tournamentEngine.setState(record);
    result = tournamentEngine.modifyParticipant({ participant: { ...team, participantName: 'Legacy renamed' } });
    expect(result.success).toBe(true);
    expect(result.participant.teamColors.primary).toBe('legacy-value');
  });
});

describe('stored TeamColors schema', () => {
  const validate = new Ajv({ strict: false }).compile({ ...schema.definitions.TeamColors });
  it('requires a primary color and rejects command/unknown fields', () => {
    expect(validate(colors)).toBe(true);
    for (const value of [{}, [], { primary: '#ffffff', textColor: '#000000' }, { primary: '#fff' }]) {
      expect(validate(value)).toBe(false);
    }
  });
});

it.each([false, true])(
  'hydrates branded TEAM identities onto singles/doubles lines (completed=%s) without bypassing privacy',
  (completeAllMatchUps) => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM }],
      completeAllMatchUps,
      setState: true,
      nonRandom: 1,
    });
    const teams = tournamentEngine.getParticipants().participants.filter((p: any) => p.participantType === TEAM);
    for (const team of teams) {
      let result: any = tournamentEngine.modifyParticipant({
        participant: { participantId: team.participantId, teamColors: colors },
      });
      expect(result.success).toBe(true);
    }
    const query = (policyDefinitions?: any) =>
      tournamentEngine.allTournamentMatchUps({ inContext: true, policyDefinitions }).matchUps;
    const parents = query().filter((m: any) => m.matchUpType === TEAM && m.sides?.every((s: any) => s.participant));
    expect(parents.length).toBeGreaterThan(0);
    const lines = parents.flatMap((m: any) => m.tieMatchUps ?? []);
    expect(new Set(lines.map((m: any) => m.matchUpType))).toEqual(new Set(['SINGLES', 'DOUBLES']));
    for (const line of lines)
      for (const side of line.sides) {
        expect(side.teamParticipant.teamColors).toEqual({ primary: '#AABBCC', secondary: '#001122' });
        expect(teams.some((t: any) => t.participantId === side.teamParticipant.participantId)).toBe(true);
      }
    const filtered = query({
      participant: { participant: { participantId: true, participantType: true, participantName: true } },
    });
    for (const m of filtered)
      for (const line of m.tieMatchUps ?? [])
        for (const side of line.sides ?? []) {
          expect(side.teamParticipant?.teamColors).toBeUndefined();
        }
  },
);

it('clears an invalid legacy empty TEAM object using the reserved clear command', () => {
  const team = createTeam();
  const record = tournamentEngine.getTournament().tournamentRecord;
  record.participants.find((p: any) => p.participantId === team.participantId).teamColors = {};
  tournamentEngine.setState(record);
  let result: any = tournamentEngine.modifyParticipant({
    participant: { participantId: team.participantId, teamColors: {} },
  });
  expect(result.success).toBe(true);
  expect(result.participant).not.toHaveProperty('teamColors');
});
