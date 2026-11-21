import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

function fixture() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    nonRandom: 501,
    setState: true,
    drawProfiles: [{ drawSize: 4 }],
  });
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const match = matchUps.find((m) => m.roundNumber === 1);
  return {
    ids: {
      tournamentId: tournamentRecord.tournamentId,
      eventId: match.eventId,
      drawId: match.drawId,
      matchUpId: match.matchUpId,
    },
    record: tournamentRecord,
  };
}
it.each(['recorder', 'director'])(
  'returns only declared score fields to %s from the guarded action query',
  (audience) => {
    const { ids, record } = fixture();
    for (const p of record.participants)
      p.person = { ...p.person, birthDate: 'protected-date', emailAddress: 'protected-contact' };
    tournamentEngine.setState(record);
    const canonical = tournamentEngine.matchUpActions(ids);
    const result = tournamentEngine.matchUpActions({ ...ids, operatorAudience: audience });
    expect(canonical.validActions.some((a) => a.type === 'SCORE')).toBe(true);
    expect(Object.keys(result)).toEqual(['operatorMatch']);
    const wire = JSON.stringify(result.operatorMatch);
    const serialized = JSON.parse(wire);
    expect(Object.keys(serialized).sort()).toEqual(
      [
        'audience',
        'clearable',
        'disabledMatchUpStatuses',
        'matchUpFormat',
        'matchUpId',
        'matchUpStatus',
        'resultIntent',
        'sets',
        'sideStatusCodes',
        'sides',
      ].sort(),
    );
    for (const side of serialized.sides) expect(Object.keys(side).sort()).toEqual(['sideNumber', 'name'].sort());
    expect(wire).not.toContain('protected-');
    expect(serialized).toMatchObject({ audience, resultIntent: 'record-initial-result', matchUpId: ids.matchUpId });
    const score = { sets: [1, 2].map((setNumber) => ({ setNumber, winningSide: 1, side1Score: 6, side2Score: 2 })) };
    expect(
      tournamentEngine.setMatchUpStatus({ ...ids, outcome: { score, winningSide: 1, matchUpStatus: 'COMPLETED' } })
        .success,
    ).toBe(true);
    const revised = tournamentEngine.matchUpActions({ ...ids, operatorAudience: audience }).operatorMatch;
    expect(revised.resultIntent).toBe('correct-result');
    expect(revised.advancement.roundName).toBe('Final');
    expect(revised.sets[0]).toMatchObject(score.sets[0]);
  },
);
it('refuses an undeclared audience and a mismatched event', () => {
  const { ids } = fixture();
  for (const extras of [{ operatorAudience: 'public' }, { operatorAudience: 'director', eventId: 'wrong' }]) {
    const result = tournamentEngine.matchUpActions({ ...ids, ...extras });
    expect(result.error).toBeTruthy();
    expect(result.operatorMatch).toBeUndefined();
  }
});
