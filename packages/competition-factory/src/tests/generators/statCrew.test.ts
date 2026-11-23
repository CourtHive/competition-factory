import { generateStatCrew } from '@Generators/tournamentRecords/generateStatCrew';
import { jsonToXml } from '@Generators/tournamentRecords/jsonToXml';
import { expect, test } from 'vitest';
import fs from 'fs-extra';

test('json to xml', () => {
  const json = { first: '1st', second: { fourth: '4th' }, third: { fifth: '5th' } };
  const tagName = 'root';
  const result = jsonToXml({ json, tagName });
  expect(result).toEqual(
    '<root first="1st">\r\n<second fourth="4th"></second>\r\n<third fifth="5th"></third>\r\n</root>',
  );
});

test('json arrays to xml', () => {
  const json = { first: '1st', second: [{ third: { one: '1' } }, { third: { two: 2 } }, { third: { three: '3' } }] };
  const tagName = 'root';
  const result = jsonToXml({ json, tagName });
  expect(result).toEqual(
    '<root first="1st">\r\n<second>\r\n<third one="1"></third>\r\n<third two="2"></third>\r\n<third three="3"></third>\r\n</second>\r\n</root>',
  );
});

test('generation of statcrew from dual', () => {
  const tournamentRecordJSON = fs.readFileSync('./src/tests/generators/dual.codes.json', 'utf-8');
  const tournamentRecord = JSON.parse(tournamentRecordJSON);

  const result: any = generateStatCrew({ tournamentRecord });

  expect(Array.isArray(result.xml)).toEqual(true);
  const lines = result.xml[0].split('\n');
  const linesCount = lines.length;
  expect(linesCount).toEqual(197);

  expect(result.json[0].childArray.map(({ team }) => team.score)).toEqual([3, 4]);
});
