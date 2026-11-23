import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { JSON2CSV } from '@Tools/json';
import { expect, test } from 'vitest';

// constants
import { MALE } from '@Constants/genderConstants';

test('can generate UTR CSV export', () => {
  const drawSize = 8;
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, gender: MALE }],
    completeAllMatchUps: true,
    setState: true,
  });
  const csv = downloadUTRmatches();
  const lines = csv.split('\r\n');
  const genderCount = lines.map((line) => line.includes('"M"')).filter(Boolean).length;

  // there is a line for every matchUp; number of matchUps is one less than drawSize
  // lines include header and one line for each matchUp
  expect(lines.length).toEqual(drawSize);
  expect(genderCount).toBe(lines.length - 1);
});

function downloadUTRmatches() {
  const zeroPad = (number) => (number.toString()[1] ? number : '0' + number);
  const dateFormatUTR = (date) => {
    if (!date) return '';
    const utrDate = new Date(date);
    return [zeroPad(utrDate.getMonth() + 1), zeroPad(utrDate.getDate()), utrDate.getFullYear()].join('/');
  };

  const { tournamentInfo } = tournamentEngine.getTournamentInfo();
  const { completedMatchUps } = tournamentEngine.tournamentMatchUps({
    context: {
      tournamentSanctionBody: tournamentInfo.parentOrganisation?.organisationName,
      tournamentStartDate: dateFormatUTR(tournamentInfo.startDate),
      tournamentEndDate: dateFormatUTR(tournamentInfo.endDate),
      tournamentEventSource: 'CourtHive',
      tournamentEventCategory: 'Junior',
      tournamentEventType: 'Tournament',
      ...tournamentInfo,
      idType: 'UTR',
    },
  });

  // modify matchUps to include winners and losers
  const matchUpsWinnersLosers = completedMatchUps.map((matchUp) => {
    const { winningSide, sides, score } = matchUp;
    const winners = sides.find(({ sideNumber }) => sideNumber === winningSide);
    const losers = sides.find(({ sideNumber }) => sideNumber !== winningSide);
    const winnerScore = score[`scoreStringSide${winningSide}`];

    return {
      winnerScore,
      ...matchUp,
      winners,
      losers,
    };
  });

  const genderInitial = (value) => value?.slice(0, 1);

  const config = {
    columnAccessors: [''],
    columnTransform: {
      Date: ['tournamentEndDate'],
      'Winner 1 Name': [
        'winners.participant.individualParticipants.0.participantName',
        'winners.participant.participantName',
      ],
      'Winner 1 Third Party ID': [
        'winners.participant.individualParticipants.0.participantId',
        'winners.participant.participantId',
      ],
      'Winner 1 City': [
        'winners.participant.individualParticipants.0.addresses.0.city',
        'winners.participant.addresses.0.city',
      ],
      'Winner 1 State': [
        'winners.participant.individualParticipants.0.addresses.0.state',
        'winners.participant.addresses.0.state',
      ],
      'Winner 1 Country': [
        'winners.participant.individualParticipants.0.addresses.0.nationalityCode',
        'winners.participant.addresses.0nationalityCode',
      ],
      'Winner 1 Gender': ['winners.participant.individualParticipants.0.person.sex', 'winners.participant.person.sex'],
      'Winner 1 DOB': [
        'winners.participant.individualParticipants.0.person.birthDate',
        'winners.participant.person.birthDate',
      ],
      'Winner 2 Name': ['winner.participant.individualParticipants.1.participantName'],
      'Winner 2 City': ['winners.participant.individualParticipants.1.addresses.0.city'],
      'Winner 2 State': ['winners.participant.individualParticipants.1.addresses.0.state'],
      'Winner 2 Country': ['winners.participant.individualParticipants.1.addresses.0.nationalityCode'],
      'Winner 2 Third Party ID': ['winners.participant.individualParticipants.1.participantId'],
      'Winner 2 Gender': ['winners.participant.individualParticipants.1.person.sex'],
      'Winner 2 DOB': ['winners.participant.individualParticipants.1.person.birthDate'],
      'Loser 1 Name': [
        'losers.participant.individualParticipants.0.participantName',
        'losers.participant.participantName',
      ],
      'Loser 1 City': [
        'losers.participant.individualParticipants.0.addresses.0.city',
        'losers.participant.addresses.0.city',
      ],
      'Loser 1 State': [
        'losers.participant.individualParticipants.0.addresses.0.state',
        'losers.participant.addresses.0.state',
      ],
      'Loser 1 Country': [
        'losers.participant.individualParticipants.0.addresses.0.nationalityCode',
        'losers.participant.addresses.0nationalityCode',
      ],
      'Loser 1 Third Party ID': [
        'losers.participant.individualParticipants.0.participantId',
        'losers.participant.participantId',
      ],
      'Loser 1 Gender': ['losers.participant.individualParticipants.0.person.sex', 'winners.participant.person.sex'],
      'Loser 1 DOB': [
        'losers.participant.individualParticipants.0.person.birthDate',
        'losers.participant.person.birthDate',
      ],
      'Loser 2 Name': ['losers.participant.individualParticipants.1.participantName'],
      'Loser 2 City': ['losers.participant.individualParticipants.1.addresses.0.city'],
      'Loser 2 State': ['losers.participant.individualParticipants.1.addresses.0.state'],
      'Loser 2 Country': ['losers.participant.individualParticipants.1.addresses.0.nationalityCode'],
      'Loser 2 Third Party ID': ['losers.participant.individualParticipants.1.participantId'],
      'Loser 2 Gender': ['losers.participant.individualParticipants.1.person.sex'],
      'Loser 2 DOB': ['losers.participant.individualParticipants.1.person.birthDate'],
      'Tournament Sanction Body': ['tournamentSanctionBody'],
      'Tournament Event Category': ['tournamentEventCategory'],
      'Tournament Import Source': ['tournamentEventSource'],
      'Tournament Event Type': ['tournamentEventType'],
      'Tournament Start Date': ['tournamentStartDate'],
      'Tournament End Date': ['tournamentEndDate'],
      'Tournament Name': ['tournamentName'],
      'Draw Name': ['drawName'],
      'Draw Type': ['drawType'],
      'Match ID': ['matchUpId'],
      Score: ['winnerScore'],
      'Id Type': ['idType'],
    },
    functionMap: {
      'Winner 1 Gender': genderInitial,
      'Winner 2 Gender': genderInitial,
      'Loser 1 Gender': genderInitial,
      'Loser 2 Gender': genderInitial,
    },
  };

  return JSON2CSV(matchUpsWinnersLosers, config);
}
