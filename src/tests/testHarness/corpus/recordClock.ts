/**
 * The instant a corpus source builds its starting record at: one hour before the clock its steps run at. Built at the
 * step clock, a record already carries the factory stamp (`timeStamp`) every write would give it, so a consumer that
 * never stamps the records a call modifies would replay to the same hash. Built earlier, the first write moves it.
 */
export const RECORD_CLOCK = '2026-10-01T11:00:00.000Z';
