import { getGridBookings } from '@Query/venues/getGridBookings';
import { generateRange } from '@Tools/arrays';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

export function courtGridRows({ courtPrefix = 'C|', minRowsCount, courtsData, scheduledDate }) {
  if (!Array.isArray(courtsData)) return { error: INVALID_VALUES };
  const maxCourtOrder = courtsData?.reduce((order, court) => {
    const matchUps = court.matchUps ?? [];
    const courtOrder = Math.max(0, ...matchUps.map((m) => m.schedule.courtOrder || 0));
    return Math.max(courtOrder, order);
  }, 1);

  const rowsCount = Math.max(minRowsCount || 0, maxCourtOrder);

  const rowBuilder = generateRange(0, rowsCount).map((rowIndex) => ({
    matchUps: generateRange(0, courtsData.length).map((courtIndex) => {
      const courtInfo = courtsData[courtIndex];
      const { courtId, venueId } = courtInfo;

      // Check if this row is blocked by a grid booking
      if (scheduledDate) {
        const { gridBookings } = getGridBookings({
          court: courtInfo, // courtInfo IS the court object
          date: scheduledDate,
        });

        if (gridBookings.has(rowIndex + 1)) {
          const booking = gridBookings.get(rowIndex + 1);
          return {
            schedule: { courtOrder: rowIndex + 1, venueId, courtId },
            isBlocked: true,
            booking, // Include booking info for display
          };
        }
      }

      return {
        schedule: {
          courtOrder: rowIndex + 1,
          venueId,
          courtId,
        },
      };
    }),
  }));

  courtsData.forEach((courtInfo, i) => {
    for (const matchUp of courtInfo.matchUps) {
      const courtOrder = matchUp.schedule?.courtOrder;
      if (courtOrder) {
        rowBuilder[courtOrder - 1].matchUps[i] = matchUp;
      }
    }
  });

  return {
    courtPrefix,
    rows: rowBuilder.map((row, i) =>
      Object.assign(
        { rowId: `rowId-${i + 1}` },
        ...row.matchUps.map((matchUp, i) => ({
          [`${courtPrefix}${i}`]: matchUp,
        })),
      ),
    ),
  };
}
