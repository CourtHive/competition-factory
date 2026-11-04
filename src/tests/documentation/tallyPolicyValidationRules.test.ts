import { validateTallyPolicy } from '@Validators/validateTallyPolicy';
import { validateSeason } from '@Validators/validateSeason';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  GRAPH_MEASURES,
  RATIO_MEASURES,
  SEASON_TALLY_MEASURES,
  SET_MEASURES,
  TALLY_MEASURES,
  V1_PRIMARY_KEYS,
  V2_MEASURES,
} from '@Query/standings/fromV1';

// constants
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * THE VALIDATION SECTION OF THE TALLY POLICY PAGE IS THE VALIDATOR'S SPECIFICATION.
 *
 * `documentation/docs/policies/roundRobinTallyPolicy.md` § Validation states every check `validateTallyPolicy` makes
 * where a policy is saved: the accepted names and a table of rules, each with a policy it refuses and the message it
 * gives. This test reads that section and holds the validator to it, so neither can change without the other.
 */

const page = fs.readFileSync('documentation/docs/policies/roundRobinTallyPolicy.md', 'utf8');
const section = page.slice(page.indexOf('\n## Validation\n'), page.indexOf('\n## Testing\n'));

const codeSpans = (text: string) => [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
const unquote = (cell: string) => cell.trim().replace(/^`/, '').replace(/`$/, '');

/** the rows of the rules table: the rule, the policy it refuses (JSON) and the message */
const rules = section
  .split('\n')
  .filter((line) => line.startsWith('| ') && !line.startsWith('| Rule') && !line.startsWith('| ---'))
  .map((line) => {
    const [rule, refused, message] = line.split(' | ').map((cell) => cell.replace(/^\| /, '').replace(/ \|$/, ''));
    return { rule: rule.trim(), refused: JSON.parse(unquote(refused)), message: unquote(message) };
  });

/** the names a bullet of "Accepted names" lists, found by its bold label */
function acceptedNames(label: string): string[] {
  const start = section.indexOf(`- **${label}**`);
  const next = section.indexOf('\n- ', start + 1);
  const end = section.indexOf('\n\n', start);
  const bullet = section.slice(start, next !== -1 && next < end ? next : end);
  // the label's own code spans (e.g. `groupOrderKey`) precede the colon
  return codeSpans(bullet.slice(bullet.indexOf(':') + 1));
}

/** the fenced JSON policy the page gives as passing every check */
function passingExample() {
  const fence = section.indexOf('```json\n');
  return JSON.parse(section.slice(fence + 8, section.indexOf('\n```', fence + 8)));
}

describe('roundRobinTallyPolicy.md § Validation', () => {
  it('states one rule per check, in the order the validator reports them', () => {
    // CONTROL: the section and its table were found
    expect(section.length).toBeGreaterThan(0);
    expect(rules.length).toEqual(48);
  });

  it.each(rules.map((row) => [row.rule, row]))('refuses: %s', (_rule, { refused, message }) => {
    let result: any = validateTallyPolicy({ tallyPolicy: refused });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.info).toEqual(message);
    expect(result.context.errors[0]).toEqual(message);
    expect(result.stack).toEqual(['validateTallyPolicy']);
  });

  it('collects every failing rule, the drawn-result options apart (only the first of those is reported)', () => {
    let result: any = validateTallyPolicy({ tallyPolicy: { groupOrderKey: 'sonnebornBerger' } });
    expect(result.context.errors).toEqual([
      'unknown groupOrderKey: sonnebornBerger',
      'groupOrderKey sonnebornBerger: a graph measure scores opponents by the primary measure, so it cannot be one',
    ]);
    result = validateTallyPolicy({
      tallyPolicy: {
        onSplit: 'X',
        terminal: 'Y',
        drawCredit: 2,
        outcomePoints: {} as any,
        groupOrderKey: 'standingsPoints',
      },
    });
    expect(result.context.errors).toEqual([
      'onSplit must be one of RESTART, CONTINUE, EXTRACT_ONE',
      'terminal must be one of ADJUDICATE, SHARE, LOT',
      'drawCredit must be a finite number between 0 and 1',
    ]);
  });

  it('an absent policy is valid, null is not', () => {
    expect(validateTallyPolicy({ tallyPolicy: undefined }).valid).toBe(true);
    let result: any = validateTallyPolicy({ tallyPolicy: null as any });
    expect(result.info).toEqual('tallyPolicy must be an object');
  });

  it('lists the accepted names the validator reads', () => {
    expect(acceptedNames('Primary measures')).toEqual([...V1_PRIMARY_KEYS, ...V2_MEASURES]);
    expect(acceptedNames('Measures')).toEqual(TALLY_MEASURES);
    expect(acceptedNames('Ratio measures')).toEqual(RATIO_MEASURES);
    expect(acceptedNames('Graph measures')).toEqual(GRAPH_MEASURES);
    expect(acceptedNames('Tied-set measures')).toEqual(SET_MEASURES);
    expect(acceptedNames("A season's extra measures")).toEqual(SEASON_TALLY_MEASURES);
    expect(acceptedNames('Directive-only attributes')).toEqual(['headToHead', 'external']);
  });

  it('accepts every documented primary measure and directive attribute', () => {
    const outcomePoints = { win: 2, draw: 1, loss: 0 };
    for (const groupOrderKey of acceptedNames('Primary measures')) {
      expect(validateTallyPolicy({ tallyPolicy: { groupOrderKey, outcomePoints } }).valid).toBe(true);
    }
    for (const attribute of acceptedNames('Measures')) {
      expect(validateTallyPolicy({ tallyPolicy: { tallyDirectives: [{ attribute }], outcomePoints } }).valid).toBe(
        true,
      );
    }
    const directiveOnly = [{ attribute: 'headToHead' }, { attribute: 'external', externalKey: 'k' }];
    expect(validateTallyPolicy({ tallyPolicy: { tallyDirectives: directiveOnly } }).valid).toBe(true);
  });

  it('a season policy may also rank by its extra measures', () => {
    const season: any = {
      seasonId: 'S',
      seriesId: 'SERIES',
      name: 'Season',
      startDate: '2026-01-01',
      status: 'ACTIVE',
      tallyPolicy: { groupOrderKey: 'valueLost', tallyDirectives: [{ attribute: 'valueWon' }] },
      tiers: [{ tierId: 'T', tier: { system: 'MOCK', value: 'T' }, tallyPolicy: { groupOrderKey: 'valueWon' } }],
      periods: [{ periodId: 'P1', periodNumber: 1, includeInStandings: true, competitions: [] }],
    };
    expect(validateSeason({ season }).valid).toBe(true);
    let result: any = validateTallyPolicy({ tallyPolicy: { groupOrderKey: 'valueLost' } });
    expect(result.info).toEqual('unknown groupOrderKey: valueLost');
  });

  it('accepts the documented policy that uses every option', () => {
    const tallyPolicy = passingExample();
    // CONTROL: the example was found
    expect(tallyPolicy.resultPoints.rules.length).toEqual(3);
    expect(validateTallyPolicy({ tallyPolicy }).valid).toBe(true);
  });

  it('attachPolicies returns the refusal as it is, and writes nothing', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    const [{ refused, message }] = rules.filter(({ message }) => message.startsWith('onSplit'));
    let result: any = tournamentEngine.attachPolicies({
      policyDefinitions: { [POLICY_TYPE_ROUND_ROBIN_TALLY]: refused },
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.info).toEqual(message);
    expect(result.context.errors).toEqual([message]);
    expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toEqual(before);
  });
});
