import { captureNotices } from '../notifications/noticeConformance/harness';
import { MODIFY_PARTICIPANTS, MUTATIONS } from '@Constants/topicConstants';
import { INVALID_DATE, VALUE_UNCHANGED } from '@Constants/errorConditionConstants';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

const participantId = 'P1';
const tournamentId = 'T';
const method = 'setParticipantScaleItem';
const scaleItem = {
  scaleType: 'RANKING',
  scaleName: 'U18',
  eventType: 'SINGLES',
  scaleValue: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
};
const record = () => tournamentEngine.getTournament().tournamentRecord;

afterEach(() => tournamentEngine.setState({ tournamentId: 'reset' }, true));

it.each([true, false])('preserves the full record on refused direct and queue scale edits, deepCopy=%s', (deepCopy) => {
  tournamentEngine.setState({ tournamentId, participants: [{ participantId }] }, deepCopy);
  const bad = {
    participantId,
    removePriorValues: true,
    scaleItem: { ...scaleItem, scaleValue: 2, scaleDate: 'invalid' },
  };
  function assertUnchanged() {
    const before = JSON.stringify(record());
    const notices = captureNotices(() => {
      expect(tournamentEngine.setParticipantScaleItem(bad).error).toEqual(INVALID_DATE);
      expect(tournamentEngine.executionQueue([{ method, params: bad }], false).error?.code).toBe(INVALID_DATE.code);
    });
    expect(notices).toEqual([]);
    expect(JSON.stringify(record())).toBe(before);
  }
  assertUnchanged();
  const notices = captureNotices(() => {
    expect(tournamentEngine.setParticipantScaleItem({ participantId, scaleItem })).toMatchObject({
      success: true,
      newValue: 1,
    });
  });
  expect(notices.map(({ topic }) => topic)).toEqual([MODIFY_PARTICIPANTS, MUTATIONS]);
  expect(notices[0].payload).toEqual({ tournamentId, participants: record().participants });
  expect(record().participants[0].timeItems).toEqual([
    { itemType: 'SCALE.RANKING.SINGLES.U18', itemValue: 1, createdAt: scaleItem.createdAt },
  ]);
  assertUnchanged();

  // A bad date is immaterial on the existing equivalent-value branch.
  const unchanged = JSON.stringify(record());
  expect(
    tournamentEngine.setParticipantScaleItem({ participantId, scaleItem: { ...scaleItem, scaleDate: 'invalid' } }),
  ).toMatchObject({
    success: true,
    info: VALUE_UNCHANGED,
    existingValue: 1,
  });
  expect(JSON.stringify(record())).toBe(unchanged);
});

it('initializes the time item list on a successful empty value without emitting a participant change', () => {
  tournamentEngine.setState({ tournamentId, participants: [{ participantId }] });
  const notices = captureNotices(() => {
    expect(
      tournamentEngine.setParticipantScaleItem({ participantId, scaleItem: { ...scaleItem, scaleValue: null } }).info,
    ).toEqual(VALUE_UNCHANGED);
  });
  expect(record().participants[0].timeItems).toEqual([]);
  expect(notices.filter(({ topic }) => topic === MODIFY_PARTICIPANTS)).toEqual([]);
});
