import {
  getDisciplineProfile,
  listDisciplineProfiles,
  registerDisciplineProfile,
} from './disciplines/disciplineProfiles';
import { countries, countryToFlag, flagIOC } from './countryData';
import ratingsParameters from './ratings/ratingsParameters';
import { competitionFormats } from './scoring/competitionFormats';
import { matchUpFormats } from './scoring/matchUpFormats';
import { tieFormats } from './scoring/tieFormats';
import { policies } from './policies';

export const fixtures = {
  registerDisciplineProfile,
  listDisciplineProfiles,
  getDisciplineProfile,
  competitionFormats,
  ratingsParameters,
  matchUpFormats,
  countryToFlag,
  tieFormats,
  countries,
  policies,
  flagIOC,
};
