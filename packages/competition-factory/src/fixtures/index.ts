import { countries, countryToFlag, flagIOC } from './countryData';
import { competitionFormats } from './scoring/competitionFormats';
import ratingsParameters from './ratings/ratingsParameters';
import { matchUpFormats } from './scoring/matchUpFormats';
import { tieFormats } from './scoring/tieFormats';
import { policies } from './policies';
import {
  getDisciplineProfile,
  listDisciplineProfiles,
  registerDisciplineProfile,
} from './disciplines/disciplineProfiles';

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
