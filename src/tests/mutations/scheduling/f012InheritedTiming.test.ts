import { modifyEventMatchUpFormatTiming } from '@Mutate/extensions/events/modifyEventMatchUpFormatTiming';
import { captureNotices } from '../notifications/noticeConformance/harness';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { MODIFY_EVENT, MUTATIONS } from '@Constants/topicConstants';
import { SCHEDULE_TIMING } from '@Constants/extensionConstants';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, describe, expect, it } from 'vitest';

const matchUpFormat = FORMAT_STANDARD;
const record = () => ({
  tournamentId: 'T',
  events: ['U16', 'U18'].map((id) => ({ eventId: id, eventType: 'SINGLES', category: { categoryName: id } })),
});
const state = () => tournamentEngine.getTournament().tournamentRecord;
const event = (eventId: string) => state().events.find((item) => item.eventId === eventId);
const read = (eventId: string) =>
  tournamentEngine.getEventMatchUpFormatTiming({ matchUpFormats: [matchUpFormat], eventId })
    .eventMatchUpFormatTiming[0];

function override(eventId: string, averageMinutes: number) {
  const params = { eventId, matchUpFormat, averageMinutes };
  const notices = captureNotices(() => {
    expect(tournamentEngine.modifyEventMatchUpFormatTiming(params).success).toBe(true);
  });
  expect(notices.map(({ topic }) => topic)).toEqual([MODIFY_EVENT, MUTATIONS]);
  expect(notices[0].payload).toEqual({ tournamentId: 'T', event: event(eventId) });
  expect(notices[1].payload).toMatchObject({
    tournamentId: undefined,
    directives: [{ method: modifyEventMatchUpFormatTiming, params }],
  });
  expect(read(eventId).averageMinutes).toBe(averageMinutes);
}

afterEach(() => tournamentEngine.setState({ tournamentId: 'reset' }, true));

describe.each([true, false])('event-local timing, setState deepCopy=%s', (deepCopy) => {
  it.each(['first-class', 'legacy'])('isolates two sibling overrides from the %s tournament rule', (mode) => {
    const inherited = {
      matchUpAverageTimes: [
        {
          matchUpFormatCodes: [matchUpFormat],
          averageTimes: [{ categoryNames: ['U16', 'U18'], minutes: { SINGLES: 90 } }],
        },
      ],
    };
    const timing =
      mode === 'legacy'
        ? { extensions: [{ name: SCHEDULE_TIMING, value: inherited }] }
        : { scheduling: { timing: inherited } };
    const source = { ...record(), ...timing };
    expect(tournamentEngine.setState(source, deepCopy).success).toBe(true);
    const defaults = () => JSON.stringify(mode === 'legacy' ? state().extensions : state().scheduling);
    const before = defaults();
    const sibling = JSON.stringify(event('U18'));
    expect(read('U18').averageMinutes).toBe(90);

    override('U16', 75);
    expect(defaults()).toBe(before);
    expect(JSON.stringify(event('U18'))).toBe(sibling);
    expect(read('U18').averageMinutes).toBe(90);

    const first = JSON.stringify(event('U16'));
    override('U18', 80);
    expect(defaults()).toBe(before);
    expect(JSON.stringify(event('U16'))).toBe(first);
    expect(read('U16').averageMinutes).toBe(75);

    const saved = JSON.stringify(state());
    const refused = captureNotices(() => {
      expect(tournamentEngine.modifyEventMatchUpFormatTiming({ eventId: 'U16', matchUpFormat }).error).toEqual(
        INVALID_VALUES,
      );
    });
    expect(JSON.stringify(state())).toBe(saved);
    expect(refused).toEqual([]);
  });

  it('preserves doubles minutes from the same table when overriding singles minutes', () => {
    const inherited = {
      matchUpAverageTimes: [
        {
          matchUpFormatCodes: [matchUpFormat],
          averageTimes: [{ categoryNames: ['U16', 'U18'], minutes: { SINGLES: 90, DOUBLES: 100 } }],
        },
      ],
      matchUpRecoveryTimes: [
        {
          matchUpFormatCodes: [matchUpFormat],
          recoveryTimes: [{ categoryNames: ['U16'], minutes: { SINGLES: 30, DOUBLES: 45 } }],
        },
      ],
    };
    expect(tournamentEngine.setState({ ...record(), scheduling: { timing: inherited } }, deepCopy).success).toBe(true);
    const defaults = JSON.stringify(state().scheduling);
    override('U16', 75);
    const local = () => event('U16').extensions.find(({ name }) => name === SCHEDULE_TIMING).value;
    const average = () => local().matchUpAverageTimes[0].averageTimes.find((row) => row.categoryNames.includes('U16'));
    const recovery = () =>
      local().matchUpRecoveryTimes[0].recoveryTimes.find((row) => row.categoryNames.includes('U16'));
    expect(average().minutes).toEqual({ SINGLES: 75, DOUBLES: 100 });
    expect(read('U16').recoveryMinutes).toBe(30);
    const setBoth = tournamentEngine.modifyEventMatchUpFormatTiming({
      eventId: 'U16',
      matchUpFormat,
      averageMinutes: 70,
      recoveryMinutes: 25,
    });
    expect(setBoth.success).toBe(true);
    expect(average().minutes).toEqual({ SINGLES: 70, DOUBLES: 100 });
    expect(recovery().minutes).toEqual({ SINGLES: 25, DOUBLES: 45 });
    expect(JSON.stringify(state().scheduling)).toBe(defaults);
  });

  it('creates only the event override when no tournament rule exists', () => {
    expect(tournamentEngine.setState(record(), deepCopy).success).toBe(true);
    const sibling = JSON.stringify(event('U18'));
    override('U16', 75);
    expect(state().scheduling).toBeUndefined();
    expect(state().extensions).toBeUndefined();
    expect(JSON.stringify(event('U18'))).toBe(sibling);
  });
});
