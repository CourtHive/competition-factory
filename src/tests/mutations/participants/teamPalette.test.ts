import { normalizeTeamPalette } from '@Mutate/participants/normalizeTeamPalette';
import { writeModeMatrix } from '@Tests/testHarness/writeModeMatrix';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

function palette(count = 4) {
  return {
    palette: Array.from({ length: count }, (_, index) => ({
      colorId: `color-${index}`,
      value: index % 2 ? '#ffffff' : '#ce1126',
      name: `Color ${index}`,
      group: 'Primary',
    })),
    display: { primary: 'color-0', ...(count > 1 && { secondary: 'color-1' }) },
  };
}
function setup() {
  mocksEngine.generateTournamentRecord({ setState: true, nonRandom: 1 });
  let result: any = tournamentEngine.addParticipant({
    participant: {
      participantId: 'team',
      participantType: 'TEAM',
      participantRole: 'COMPETITOR',
      participantName: 'Palette team',
      teamColors: palette(),
    },
  });
  expect(result).toMatchObject({ success: true });
}
writeModeMatrix(() => {
  it.each([1, 2, 3, 4, 12, 32])('round-trips %s palette colors including repeated values and brand groups', (count) => {
    setup();
    let result: any = tournamentEngine.modifyParticipant({
      participant: { participantId: 'team', teamColors: palette(count) },
    });
    expect(result.success).toBe(true);
    const serialized = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    const record = JSON.parse(serialized);
    tournamentEngine.setState(record);
    const team = tournamentEngine
      .getParticipants()
      .participants?.find((participant) => participant.participantId === 'team');
    expect(team?.teamColors?.palette).toHaveLength(count);
    expect(team?.teamColors?.palette.every((entry) => entry.group === 'Primary')).toBe(true);
    expect(team?.teamColors?.palette[0].value).toBe('#CE1126');
    expect(team?.teamColors?.display.primary).toBe('color-0');
  });
  it('keeps references stable through reordering and permits atomic selection/deletion or whole replacement', () => {
    setup();
    const colors = palette();
    colors.palette.reverse();
    let result: any = tournamentEngine.modifyParticipant({
      participant: { participantId: 'team', teamColors: colors },
    });
    expect(result.participant.teamColors.display.primary).toBe('color-0');
    expect(result.participant.teamColors.palette[0].colorId).toBe('color-3');
    colors.palette = colors.palette.filter((entry) => entry.colorId !== 'color-0');
    colors.display = { primary: 'color-2' };
    result = tournamentEngine.modifyParticipant({ participant: { participantId: 'team', teamColors: colors } });
    expect(result.success).toBe(true);
    expect(result.participant.teamColors.palette).toHaveLength(3);
    expect(result.participant.teamColors.display).toEqual({ primary: 'color-2' });
    result = tournamentEngine.modifyParticipant({ participant: { participantId: 'team', teamColors: palette(1) } });
    expect(result.participant.teamColors.palette).toHaveLength(1);
    result = tournamentEngine.modifyParticipant({ participant: { participantId: 'team', teamColors: {} } });
    expect(result.participant).not.toHaveProperty('teamColors');
  });
  it.each([
    { palette: [], display: { primary: 'x' } },
    palette(33),
    { ...palette(), display: { primary: 'missing' } },
    { ...palette(), display: { primary: 'color-0', secondary: 'missing' } },
    { ...palette(), display: { primary: 'color-0', unknown: true } },
    {
      ...palette(),
      palette: [
        { colorId: 'x', value: '#ffffff' },
        { colorId: 'x', value: '#000000' },
      ],
    },
    { ...palette(), palette: [{ colorId: 'bad id', value: '#ffffff' }] },
    { ...palette(), palette: [{ colorId: 'color-0', value: '#fff' }] },
    { ...palette(), palette: [{ colorId: 'color-0', value: '#ffffff', name: ' ' }] },
    { ...palette(), palette: [{ colorId: 'color-0', value: '#ffffff', group: 'a'.repeat(101) }] },
    { ...palette(), palette: [{ colorId: 'color-0', value: '#ffffff', textColor: '#000000' }] },
  ])('refuses invalid palettes without changing unrelated fields or stored selections', (teamColors) => {
    setup();
    const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    let result: any = tournamentEngine.modifyParticipant({
      participant: { participantId: 'team', participantName: 'Must not change', teamColors: teamColors as any },
    });
    expect(result.error).toBeDefined();
    expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toBe(before);
  });
});
it('rejects the unmerged pair proposal instead of converting or storing it', () => {
  expect(normalizeTeamPalette({ primary: '#ffffff', secondary: '#ffffff' })).toBeUndefined();
});
