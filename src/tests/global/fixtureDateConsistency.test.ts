import tournamentEngine from '@Engines/syncEngine';
import { extractDate } from '@Tools/dateTime';
import { expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Guard: every tournament record kept as a test fixture is consistent with the date model.
 *
 * - an event's startDate/endDate lies inside its tournament's range;
 * - a scheduled matchUp's scheduledDate lies inside its event's range, or the tournament's range
 *   when the event has none.
 *
 * Fixtures that contradicted this (events played a week after their tournament, matchUps
 * scheduled after their event ended) taught tests a date model the engine does not have.
 * Scheduled dates are read through the engine, so a date carried only by a scheduledTime counts.
 */
const SOURCE_ROOT = 'src';

function findTournamentFixtures(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findTournamentFixtures(entryPath, found);
    } else if (entry.name.endsWith('.json')) {
      const content = fs.readFileSync(entryPath, 'utf8');
      if (!content.includes('"tournamentId"')) continue;
      const parsed = JSON.parse(content);
      if (parsed && !Array.isArray(parsed) && parsed.tournamentId) found.push(entryPath);
    }
  }
  return found;
}

const day = (date?: string) => (date ? extractDate(date) : undefined);
const outside = (date: string, start?: string, end?: string) => (!!start && date < start) || (!!end && date > end);

function dateIssues(file: string): string[] {
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  const tournamentStart = day(record.startDate);
  const tournamentEnd = day(record.endDate);
  const issues: string[] = [];

  const eventRanges: Record<string, [string | undefined, string | undefined]> = {};
  for (const event of record.events ?? []) {
    const start = day(event.startDate);
    const end = day(event.endDate);
    eventRanges[event.eventId] = [start ?? tournamentStart, end ?? tournamentEnd];
    for (const date of [start, end]) {
      if (date && outside(date, tournamentStart, tournamentEnd))
        issues.push(`event ${event.eventId} ${start}..${end} outside tournament ${tournamentStart}..${tournamentEnd}`);
    }
  }

  tournamentEngine.reset();
  const result = tournamentEngine.setState(record);
  expect({ file, success: result.success }).toEqual({ file, success: true });
  const { matchUps = [] } = tournamentEngine.allTournamentMatchUps({ inContext: true });
  for (const matchUp of matchUps) {
    const scheduledDate = day(matchUp.schedule?.scheduledDate);
    if (!scheduledDate) continue;
    const [start, end] = eventRanges[matchUp.eventId] ?? [tournamentStart, tournamentEnd];
    if (outside(scheduledDate, start, end))
      issues.push(`matchUp ${matchUp.matchUpId} on ${scheduledDate} outside event ${matchUp.eventId} ${start}..${end}`);
  }

  return issues;
}

const fixtures = findTournamentFixtures(SOURCE_ROOT).sort((a, b) => a.localeCompare(b));

it('finds tournament fixtures to check', () => {
  expect(fixtures.length).toBeGreaterThan(20);
});

it.each(fixtures)('%s keeps event ranges and scheduled dates inside their bounds', (file) => {
  const issues = dateIssues(file);
  expect({ file, count: issues.length, sample: issues.slice(0, 5) }).toEqual({ file, count: 0, sample: [] });
});
