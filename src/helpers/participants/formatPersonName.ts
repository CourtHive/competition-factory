import { capitalizeFirst } from '@Tools/strings';

// types
import { Person } from '@Types/tournamentTypes';

type FormatPersonNameArgs = {
  personFormat: string;
  person: Person;
};

export function formatPersonName({ personFormat, person }: FormatPersonNameArgs) {
  const alpha = (str: string) => str.replace(/\W/g, '');
  const allLowerCase = (str: string) => /^[a-z]*$/.test(alpha(str));
  const allUpperCase = (str: string) => /^[A-Z]*$/.test(alpha(str));
  const lastUpperCase = (str: string) => /^[LAST]{4}/.test(alpha(str));
  const lastFirst = (str: string) => str.toLowerCase().indexOf('l') < str.toLowerCase().indexOf('f');
  const commaSeparated = (str: string) => str.indexOf(',') >= 0;
  const firstInital = (str: string) => str.toLowerCase().indexOf('f.') >= 0;
  const lastNameOnly = (str: string) => str.toLowerCase().indexOf('f') < 0;
  const hasSpacing = (str: string) => str.indexOf(' ') > 0;

  if (!person) return;
  const spacer = hasSpacing(personFormat) ? ' ' : '';
  let firstName = capitalizeFirst(person?.standardGivenName ?? '');
  let lastName = capitalizeFirst(person?.standardFamilyName ?? '');

  if (!personFormat) return `${firstName}${spacer}${lastName}`;

  if (firstInital(personFormat) && !commaSeparated(personFormat) && !lastFirst(personFormat)) {
    firstName = `${firstName[0]}.`;
  }

  if (allLowerCase(personFormat)) {
    firstName = firstName.toLowerCase();
    lastName = lastName.toLowerCase();
  } else if (allUpperCase(personFormat)) {
    firstName = firstName.toUpperCase();
    lastName = lastName.toUpperCase();
  } else if (lastUpperCase(personFormat)) {
    lastName = lastName.toUpperCase();
  }

  let participantName = `${firstName}${spacer}${lastName}`;
  if (lastNameOnly(personFormat)) {
    participantName = lastName;
  } else if (lastFirst(personFormat)) {
    if (commaSeparated(personFormat)) {
      participantName = `${lastName},${spacer}${firstName}`;
    } else {
      participantName = `${lastName}${spacer}${firstName}`;
    }
  }

  return participantName;
}
