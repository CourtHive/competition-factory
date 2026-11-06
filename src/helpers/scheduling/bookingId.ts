export function deriveBookingId({
  courtId,
  date,
  startTime,
}: {
  courtId: string;
  date?: string;
  startTime?: string;
}): string {
  return `${courtId}-${date ?? ''}-${startTime ?? ''}`;
}
