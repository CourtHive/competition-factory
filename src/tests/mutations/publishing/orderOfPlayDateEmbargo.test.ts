import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMatchUpIds } from '@Functions/global/extractors';
import { cast } from '@Query/readModel/cast';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { INVALID_EMBARGO, INVALID_VALUES } from '@Constants/errorConditionConstants';

const NOW = new Date('2025-06-15T12:00:00Z').getTime();
const DAY_1 = '2025-06-15';
const DAY_2 = '2025-06-16';
const DAY_2_RELEASE = '2025-06-15T18:00:00Z'; // the evening before day 2
const AFTER_RELEASE = new Date('2025-06-15T18:00:01Z').getTime();
const PAST = '2025-06-10T12:00:00Z';

// eight first-round matchUps of a 16 draw: four on each of two days
function scheduleTwoDays() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16 }],
    venueProfiles: [{ courtsCount: 4 }],
    startDate: DAY_1,
    endDate: DAY_2,
    setState: true,
  });
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
  const matchUpIds = getMatchUpIds(matchUps);
  tournamentEngine.scheduleMatchUps({ scheduleDate: DAY_1, matchUpIds: matchUpIds.slice(0, 4) });
  tournamentEngine.scheduleMatchUps({ scheduleDate: DAY_2, matchUpIds: matchUpIds.slice(4) });
  const { eventId } = tournamentRecord.events![0];
  tournamentEngine.publishEvent({ eventId, drawIdsToAdd: [drawId] });
}

function publishedDates(scheduledDate?: string) {
  const { dateMatchUps } = tournamentEngine.competitionScheduleMatchUps({
    matchUpFilters: scheduledDate ? { scheduledDate } : undefined,
    usePublishState: true,
  });
  // later rounds are unscheduled: they carry no date, and no date embargo touches them
  const dates = dateMatchUps.map((matchUp) => matchUp.schedule?.scheduledDate).filter(Boolean);
  return [...new Set(dates)].sort();
}

describe('publishOrderOfPlay({ dateEmbargoes }): each scheduled date on its own clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('withholds an embargoed date while the other dates stay published, then releases it on time', () => {
    scheduleTwoDays();
    let result: any = tournamentEngine.publishOrderOfPlay({
      scheduledDates: [DAY_1, DAY_2],
      dateEmbargoes: { [DAY_2]: DAY_2_RELEASE },
    });
    expect(result.success).toEqual(true);

    expect(publishedDates()).toEqual([DAY_1]);
    expect(publishedDates(DAY_1)).toEqual([DAY_1]);
    expect(publishedDates(DAY_2)).toEqual([]);

    vi.setSystemTime(AFTER_RELEASE);
    expect(publishedDates()).toEqual([DAY_1, DAY_2]);
    expect(publishedDates(DAY_2)).toEqual([DAY_2]);

    // the admin view (no publish state) never withholds anything
    vi.setSystemTime(NOW);
    result = tournamentEngine.competitionScheduleMatchUps();
    expect(result.dateMatchUps.filter((matchUp) => matchUp.schedule?.scheduledDate).length).toEqual(8);
  });

  it('works when every date is published (no scheduledDates), which the date filter alone cannot express', () => {
    scheduleTwoDays();
    tournamentEngine.publishOrderOfPlay({ dateEmbargoes: { [DAY_2]: DAY_2_RELEASE } });
    expect(publishedDates()).toEqual([DAY_1]);
  });

  it('an embargo already in the past withholds nothing; the whole-schedule embargo still withholds every date', () => {
    scheduleTwoDays();
    tournamentEngine.publishOrderOfPlay({ dateEmbargoes: { [DAY_1]: PAST } });
    expect(publishedDates()).toEqual([DAY_1, DAY_2]);

    tournamentEngine.publishOrderOfPlay({ embargo: DAY_2_RELEASE });
    expect(publishedDates()).toEqual([]);
  });

  it('keeps the prior map when a later call omits it, and clears it on null or {}', () => {
    scheduleTwoDays();
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [DAY_2], dateEmbargoes: { [DAY_2]: DAY_2_RELEASE } });

    // adding a date (a chip toggle) restates scheduledDates only; day 2 must stay embargoed
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [DAY_1, DAY_2], removePriorValues: true });
    expect(publishedDates()).toEqual([DAY_1]);

    tournamentEngine.publishOrderOfPlay({ scheduledDates: [DAY_1, DAY_2], dateEmbargoes: null });
    expect(publishedDates()).toEqual([DAY_1, DAY_2]);
    expect(tournamentEngine.getPublishState().publishState.tournament.orderOfPlay.dateEmbargoes).toBeUndefined();

    tournamentEngine.publishOrderOfPlay({ dateEmbargoes: { [DAY_1]: DAY_2_RELEASE } });
    tournamentEngine.publishOrderOfPlay({ dateEmbargoes: {} });
    expect(publishedDates()).toEqual([DAY_1, DAY_2]);
  });

  it('refuses a malformed map without writing anything', () => {
    scheduleTwoDays();
    let result: any = tournamentEngine.publishOrderOfPlay({ dateEmbargoes: { [DAY_2]: '2025-06-15T18:00:00' } });
    expect(result.error).toEqual(INVALID_EMBARGO);
    result = tournamentEngine.publishOrderOfPlay({ dateEmbargoes: { '2025-6-16': DAY_2_RELEASE } });
    expect(result.error).toEqual(INVALID_VALUES);
    result = tournamentEngine.publishOrderOfPlay({ dateEmbargoes: [DAY_2_RELEASE] });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(tournamentEngine.getPublishState().publishState.tournament.orderOfPlay).toBeUndefined();
  });

  it('reports each date embargo in getPublishState and projects the map into the read model', () => {
    scheduleTwoDays();
    tournamentEngine.publishOrderOfPlay({ dateEmbargoes: { [DAY_1]: PAST, [DAY_2]: DAY_2_RELEASE } });

    const { embargoes } = tournamentEngine.getPublishState().publishState;
    expect(embargoes.filter((entry) => entry.type === 'orderOfPlayDate')).toEqual([
      { type: 'orderOfPlayDate', id: DAY_1, embargo: PAST, embargoActive: false },
      { type: 'orderOfPlayDate', id: DAY_2, embargo: DAY_2_RELEASE, embargoActive: true },
    ]);

    const { tournamentRecord } = tournamentEngine.getTournament();
    const { rows } = cast({ tournamentRecord });
    expect(rows!.order_of_play[0].date_embargoes).toEqual({ [DAY_1]: PAST, [DAY_2]: DAY_2_RELEASE });
  });
});
