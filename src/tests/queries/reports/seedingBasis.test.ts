import tournamentRecord from './seedingBasis.tods.json';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

it('test structureReports seedingBasis', () => {
  tournamentEngine.setState(tournamentRecord);

  const { structureReports, eventStructureReports } = tournamentEngine.getStructureReports({
    extensionProfiles: [
      { name: 'level', label: 'levelOrder', accessor: 'level.orderIndex' },
      { name: 'districtCode' },
      { name: 'sectionCode' },
    ],
  });

  structureReports.forEach((report) => expect(report.seedingBasis).not.toBeUndefined());
  eventStructureReports.forEach((report) => expect(report.seedingBasis).not.toBeUndefined());
});
