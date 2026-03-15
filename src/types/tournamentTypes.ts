import type { competitionFormat } from './competitionFormat';

export interface Tournament {
  activeDates?: Date[] | string[]; // dates from startDate to endDate on which the tournament is active
  createdAt?: Date | string;
  endDate?: string;
  events?: Event[];
  extensions?: Extension[];
  formalName?: string;
  hostCountryCode?: CountryCodeUnion;
  indoorOutdoor?: IndoorOutdoorUnion;
  isMock?: boolean;
  localTimeZone?: string;
  matchUps?: MatchUp[];
  notes?: string;
  onlineResources?: OnlineResource[];
  parentOrganisationId?: string;
  parentOrganisation?: Organisation;
  participants?: Participant[];
  processCodes?: string[];
  promotionalName?: string;
  registrationProfile?: RegistrationProfile;
  season?: string;
  startDate?: string;
  surfaceCategory?: SurfaceCategoryUnion;
  timeItems?: TimeItem[];
  totalPrizeMoney?: PrizeMoney[];
  tournamentCategories?: Category[];
  tournamentGroups?: string[];
  tournamentId: string;
  tournamentLevel?: TournamentLevelUnion;
  tournamentName?: string;
  tournamentOtherIds?: UnifiedTournamentID[];
  tournamentRank?: string;
  tournamentStatus?: TournamentStatusUnion;
  updatedAt?: Date | string;
  venues?: Venue[];
  weekdays?: WeekdayUnion[];
}

export type TournamentStatusUnion = 'ABANDONDED' | 'CANCELLED' | 'ACTIVE' | 'COMPLETED';

export interface Organisation {
  onlineResources?: OnlineResource[];
  organisationAbbreviation: string;
  parentOrganisationId?: string;
  extensions?: Extension[];
  organisationName: string;
  organisationId: string;
  notes?: string;
}

export interface Event {
  activeDates?: Date[] | string[]; // dates from startDate to endDate on which the tournament is active
  allowedDrawTypes?: DrawTypeUnion[];
  category?: Category;
  competitionFormat?: competitionFormat;
  createdAt?: Date | string;
  discipline?: DisciplineUnion;
  drawDefinitions?: DrawDefinition[];
  endDate?: string;
  entries?: Entry[];
  eventAbbreviation?: string;
  eventId: string;
  eventLevel?: TournamentLevelUnion;
  eventName?: string;
  eventOrder?: number;
  eventRank?: string;
  eventType?: EventTypeUnion;
  extensions?: Extension[];
  gender?: GenderUnion;
  indoorOutdoor?: IndoorOutdoorUnion;
  isMock?: boolean;
  links?: DrawLink[];
  matchUpFormat?: string;
  notes?: string;
  processCodes?: string[];
  startDate?: string;
  surfaceCategory?: SurfaceCategoryUnion;
  tennisOfficialIds?: string[];
  tieFormat?: TieFormat;
  tieFormatId?: string;
  tieFormats?: TieFormat[];
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  weekdays?: WeekdayUnion[];
  wheelchairClass?: WheelchairClassUnion;
}

export const DrawTypeEnum = {
  AD_HOC: 'AD_HOC',
  ADAPTIVE: 'ADAPTIVE',
  COMPASS: 'COMPASS',
  CURTIS_cONSOLATION: 'CURTIS_CONSOLATION',
  DOUBLE_eLIMINATION: 'DOUBLE_ELIMINATION',
  FEED_IN: 'FEED_IN',
  FEED_IN_CHAMPIONSHIP: 'FEED_IN_CHAMPIONSHIP',
  FEED_IN_CHAMPIONSHIP_TO_QF: 'FEED_IN_CHAMPIONSHIP_TO_QF',
  FEED_IN_CHAMPIONSHIP_TO_R16: 'FEED_IN_CHAMPIONSHIP_TO_R16',
  FEED_In_CHAMPIONSHIP_TO_SF: 'FEED_IN_CHAMPIONSHIP_TO_SF',
  FIRST_MATCH_LOSER_CONSOLATION: 'FIRST_MATCH_LOSER_CONSOLATION',
  FIRST_ROUND_LOSER_CONSOLATION: 'FIRST_ROUND_LOSER_CONSOLATION',
  MODIFIED_FEED_IN_CHAMPIONSHIP: 'MODIFIED_FEED_IN_CHAMPIONSHIP',
  LUCKY_DRAW: 'LUCKY_DRAW',
  OLYMPIC: 'OLYMPIC',
  OTHER: 'OTHER',
  PLAYOFF: 'PLAYOFF',
  ROUND_ROBIN: 'ROUND_ROBIN',
  ROUND_ROBIN_WITH_PLAYOFF: 'ROUND_ROBIN_WITH_PLAYOFF',
  SINGLE_ELIMINATION: 'SINGLE_ELIMINATION',
} as const;

export type DrawTypeUnion = keyof typeof DrawTypeEnum;

export interface Category {
  ageCategoryCode?: string;
  ageMax?: number;
  ageMaxDate?: string;
  ageMin?: number;
  ageMinDate?: string;
  ballType?: BallTypeUnion;
  categoryName?: string;
  categoryType?: string;
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  ratingMax?: number;
  ratingMin?: number;
  ratingType?: string;
  subType?: string;
  timeItems?: TimeItem[];
  type?: CategoryUnion;
  updatedAt?: Date | string;
}

export enum BallTypeEnum {
  HIGH_ALTITUDE = 'HIGH_ALTITUDE',
  Stage1Green = 'STAGE1GREEN',
  Stage2Orange = 'STAGE2ORANGE',
  Stage3Red = 'STAGE3RED',
  T2STANDARD_PRESSURELESS = 'T2STANDARD_PRESSURELESS',
  T2STANDARD_PRESSURISED = 'T2STANDARD_PRESSURISED',
  TYPE1FAST = 'TYPE1FAST',
  TYPE3SLOW = 'TYPE3SLOW',
}
export type BallTypeUnion = keyof typeof BallTypeEnum;

export interface Extension {
  description?: string;
  name: string;
  value: any;
}

export interface TimeItem {
  createdAt?: Date | string;
  itemDate?: Date | string;
  itemSubTypes?: string[];
  itemType?: string;
  itemValue?: any;
}

export type DisciplineUnion = 'BEACH_TENNIS' | 'TENNIS' | 'WHEELCHAIR_TENNIS';
export type CategoryUnion = 'AGE' | 'BOTH' | 'LEVEL';

export interface DrawDefinition {
  activeDates?: Date[] | string[]; // dates from startDate to endDate on which the tournament is active
  automated?: boolean;
  competitionFormat?: competitionFormat;
  createdAt?: Date | string;
  drawId: string;
  drawName?: string;
  drawOrder?: number;
  drawRepresentativeIds?: string[];
  drawStatus?: DrawStatusUnion;
  drawType?: DrawTypeUnion;
  endDate?: string;
  entries?: Entry[];
  extensions?: Extension[];
  isMock?: boolean;
  links?: DrawLink[];
  matchUpFormat?: string;
  matchUps?: MatchUp[];
  matchUpType?: EventTypeUnion;
  notes?: string;
  processCodes?: string[];
  startDate?: string;
  structures?: Structure[];
  tieFormat?: TieFormat;
  tieFormatId?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export type DrawStatusUnion = 'COMPLETE' | 'IN_PROGRESS' | 'TO_BE_PLAYED';

export interface Entry {
  createdAt?: Date | string;
  entryId?: string;
  entryPosition?: number;
  entryStage?: StageTypeUnion;
  entryStageSequence?: number;
  entryStatus?: EntryStatusUnion;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  participantId: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  scaleValue?: number;
}

// NOTE: PLAY_OFF (underscore) is a stage type. PLAYOFF (no underscore) is a draw type (see DrawTypeEnum).
export enum StageTypeEnum {
  CONSOLATION = 'CONSOLATION',
  MAIN = 'MAIN',
  PLAY_OFF = 'PLAY_OFF',
  QUALIFYING = 'QUALIFYING',
  VOLUNTARY_CONSOLATION = 'VOLUNTARY_CONSOLATION',
}
export type StageTypeUnion = keyof typeof StageTypeEnum;

export enum EntryStatusEnum {
  ALTERNATE = 'ALTERNATE',
  CONFIRMED = 'CONFIRMED',
  DIRECT_ACCEPTANCE = 'DIRECT_ACCEPTANCE',
  FEED_IN = 'FEED_IN',
  JUNIOR_EXEMPT = 'JUNIOR_EXEMPT',
  LUCKY_LOSER = 'LUCKY_LOSER',
  ORGANISER_ACCEPTANCE = 'ORGANISER_ACCEPTANCE',
  QUALIFIER = 'QUALIFIER',
  REGISTERED = 'REGISTERED',
  SPECIAL_EXEMPT = 'SPECIAL_EXEMPT',
  UNGROUPED = 'UNGROUPED',
  UNPAIRED = 'UNPAIRED',
  WILDCARD = 'WILDCARD',
  WITHDRAWN = 'WITHDRAWN',
}
export type EntryStatusUnion = keyof typeof EntryStatusEnum;

export interface DrawLink {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  linkCondition?: string;
  linkType: LinkTypeUnion;
  notes?: string;
  source: DrawLinkSource;
  target: DrawLinkTarget;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export enum LinkTypeEnum {
  LOSER = 'LOSER',
  POSITION = 'POSITION',
  WINNER = 'WINNER',
}
export type LinkTypeUnion = keyof typeof LinkTypeEnum;

export interface DrawLinkSource {
  bestOf?: number;
  createdAt?: Date | string;
  drawId?: string;
  extensions?: Extension[];
  finishingPositions?: number[];
  isMock?: boolean;
  notes?: string;
  rankBy?: string;
  remainder?: boolean;
  roundNumber?: number;
  structureId: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface DrawLinkTarget {
  createdAt?: Date | string;
  drawId?: string;
  extensions?: Extension[];
  feedProfile: PositioningProfileUnion;
  groupedOrder?: number[];
  isMock?: boolean;
  notes?: string;
  positionInterleave?: Interleave;
  roundNumber: number;
  structureId: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export enum PositioningProfileEnum {
  BOTTOM_UP = 'BOTTOM_UP',
  DRAW = 'DRAW',
  LOSS_POSITION = 'LOSS_POSITION',
  RANDOM = 'RANDOM',
  TOP_DOWN = 'TOP_DOWN',
  WATERFALL = 'WATERFALL',
}
export type PositioningProfileUnion = keyof typeof PositioningProfileEnum;

export enum SeedingProfileEnum {
  CLUSTER = 'CLUSTER',
  SEPARATE = 'SEPARATE',
  WATERFALL = 'WATERFALL',
}
export type SeedingProfileUnion = keyof typeof SeedingProfileEnum;

export interface Interleave {
  interleave: number;
  offset: number;
}

export type EventTypeUnion = 'SINGLES' | 'DOUBLES' | 'TEAM';

export interface MatchUp {
  collectionId?: string;
  collectionPosition?: number;
  createdAt?: Date | string;
  drawPositions?: number[];
  endDate?: string;
  extensions?: Extension[];
  finishingPositionRange?: MatchUpFinishingPositionRange;
  finishingRound?: number;
  indoorOutdoor?: IndoorOutdoorUnion;
  isMock?: boolean;
  loserMatchUpId?: string;
  matchUpDuration?: string;
  matchUpFormat?: string;
  matchUpId: string;
  matchUpStatus?: MatchUpStatusUnion;
  matchUpStatusCodes?: any[];
  matchUpType?: EventTypeUnion;
  notes?: string;
  orderOfFinish?: number;
  processCodes?: string[];
  roundName?: string;
  roundNumber?: number;
  roundPosition?: number;
  score?: Score;
  sides?: Side[];
  startDate?: string;
  surfaceCategory?: SurfaceCategoryUnion;
  tieFormat?: TieFormat;
  tieFormatId?: string;
  tieMatchUps?: MatchUp[];
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  winnerMatchUpId?: string;
  winningSide?: number;
}

export interface MatchUpFinishingPositionRange {
  loser: number[];
  winner: number[];
}

export type IndoorOutdoorUnion = 'INDOOR' | 'MIXED' | 'OUTDOOR';

export enum MatchUpStatusEnum {
  ABANDONED = 'ABANDONED',
  AWAITING_RESULT = 'AWAITING_RESULT',
  BYE = 'BYE',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  DEAD_RUBBER = 'DEAD_RUBBER',
  DEFAULTED = 'DEFAULTED',
  DOUBLE_DEFAULT = 'DOUBLE_DEFAULT',
  DOUBLE_WALKOVER = 'DOUBLE_WALKOVER',
  IN_PROGRESS = 'IN_PROGRESS',
  INCOMPLETE = 'INCOMPLETE',
  NOT_PLAYED = 'NOT_PLAYED',
  RETIRED = 'RETIRED',
  SUSPENDED = 'SUSPENDED',
  TO_BE_PLAYED = 'TO_BE_PLAYED',
  WALKOVER = 'WALKOVER',
}
export type MatchUpStatusUnion = keyof typeof MatchUpStatusEnum;

export interface Score {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  scoreStringSide1?: string;
  scoreStringSide2?: string;
  sets?: Set[];
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface Set {
  createdAt?: Date | string;
  extensions?: Extension[];
  games?: Game[];
  isMock?: boolean;
  notes?: string;
  setDuration?: string;
  setFormat?: string;
  setNumber?: number;
  side1PointScore?: number | string;
  side1Score?: number;
  side1TiebreakScore?: number;
  side2PointScore?: number | string;
  side2Score?: number;
  side2TiebreakScore?: number;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  winningSide?: number;
}

export interface Game {
  createdAt?: Date | string;
  extensions?: Extension[];
  gameDuration?: string;
  gameFormat?: string;
  gameNumber?: number;
  isMock?: boolean;
  notes?: string;
  points?: Point[];
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  winningSide?: number;
  winReason?: WinReasonUnion;
}

export interface Point {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  pointDuration?: string;
  pointNumber?: number;
  shots?: Shot[];
  side1Score?: string;
  side2Score?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  winningSide?: number;
  winReason?: WinReasonUnion;
}

export interface Shot {
  bounceAt?: CourtPosition;
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  participantId: string;
  shotDetail?: ShotDetailUnion;
  shotMadeFrom?: CourtPosition;
  shotNumber?: number;
  shotOutcome?: ShotOutcomeUnion;
  shotType?: ShotTypeUnion;
  sideNumber?: number;
  speed?: number;
  spin?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface CourtPosition {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  positionName?: CourtPositionUnion;
  timeAtPosition?: Date | string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  x?: number;
  y?: number;
}

export enum CourtPositionEnum {
  BaSELINE = 'BASELINE',
  LEFT_SERVICE_COURT = 'LEFT_SERVICE_COURT',
  NET = 'NET',
  RIGHT_SERVICE_COURT = 'RIGHT_SERVICE_COURT',
  SERVICELINE = 'SERVICELINE',
}
export type CourtPositionUnion = keyof typeof CourtPositionEnum;

export enum ShotDetailEnum {
  DRIVE = 'DRIVE',
  DRIVE_VOLLEY = 'DRIVE_VOLLEY',
  DROP_SHOT = 'DROP_SHOT',
  GROUND_STROKE = 'GROUND_STROKE',
  HALF_VOLLEY = 'HALF_VOLLEY',
  LOB = 'LOB',
  PASSING_SHOT = 'PASSING_SHOT',
  SMASH = 'SMASH',
  TRICK = 'TRICK',
  VOLLEY = 'VOLLEY',
}
export type ShotDetailUnion = keyof typeof ShotDetailEnum;

export enum ShotOutcomeEnum {
  IN = 'IN',
  LET = 'LET',
  NET = 'NET',
  OUT = 'OUT',
}
export type ShotOutcomeUnion = keyof typeof ShotOutcomeEnum;

export enum ShotTypeEnum {
  BACKHAND = 'BACKHAND',
  FOREHAND = 'FOREHAND',
  SERVE = 'SERVE',
}
export type ShotTypeUnion = keyof typeof ShotTypeEnum;

export enum WinReasonEnum {
  ACE = 'ACE',
  DOUBLE_FAULT = 'DOUBLE_FAULT',
  ERROR = 'ERROR',
  FORCED = 'FORCED',
  NETcORD = 'NET_CORD',
  PENALTY = 'PENALTY',
  UNFORCED = 'UNFORCED',
  WINNER = 'WINNER',
}
export type WinReasonUnion = keyof typeof WinReasonEnum;

export interface Side {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  lineUp?: TeamCompetitor[];
  notes?: string;
  participantId?: string;
  participant?: Participant;
  sideNumber?: number;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface TeamCompetitor {
  collectionAssignments?: CollectionAssignment[];
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  participantId: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface Team {
  gender?: GenderEnum;
  homeVenueIds?: string[];
  nativeTeamName?: string;
  otherTeamNames?: string[];
  parentOrganisationId?: string;
  personIds?: string[];
  previousTeamNames?: string[];
  teamId: string;
  teamName?: string;
}

export interface CollectionAssignment {
  collectionId: string;
  collectionPosition: number;
  previousParticipantId?: string;
  substitutionOrder?: number;
}

export enum SurfaceCategoryEnum {
  ARTIFICIAL = 'ARTIFICIAL',
  CARPET = 'CARPET',
  CLAY = 'CLAY',
  GRASS = 'GRASS',
  HARD = 'HARD',
}
export type SurfaceCategoryUnion = keyof typeof SurfaceCategoryEnum;

export interface TieFormat {
  collectionDefinitions: CollectionDefinition[];
  collectionGroups?: CollectionGroup[];
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  tieFormatId?: string;
  tieFormatName?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  winCriteria: WinCriteria;
}

export interface CollectionDefinition {
  collectionValueProfiles?: CollectionValueProfile[];
  collectionGroupNumber?: number;
  category?: Category;
  collectionId: string;
  collectionName?: string;
  collectionOrder?: number;
  collectionValue?: number;
  createdAt?: Date | string;
  extensions?: Extension[];
  gender?: GenderUnion;
  isMock?: boolean;
  matchUpCount?: number;
  matchUpFormat?: string;
  matchUpType?: EventTypeUnion;
  matchUpValue?: number;
  notes?: string;
  processCodes?: string[];
  scoreValue?: number;
  setValue?: number;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  winCriteria?: WinCriteria;
}

export interface CollectionValueProfile {
  collectionPosition: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  extensions?: Extension[];
  timeItems?: TimeItem[];
  matchUpValue: number;
  isMock?: boolean;
  notes?: string;
}

enum GenderEnum {
  FEMALE_ABBR = 'F',
  MIXED_ABBR = 'X',
  MALE_ABBR = 'M',
  ANY_ABBR = 'A',

  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
  MIXED = 'MIXED',
  MALE = 'MALE',
  ANY = 'ANY',
}
export type GenderUnion = keyof typeof GenderEnum;

export interface WinCriteria {
  aggregateValue?: boolean;
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  valueGoal: number;
}

export interface CollectionGroup {
  createdAt?: Date | string;
  extensions?: Extension[];
  groupName?: string;
  groupNumber: number;
  groupValue?: number;
  isMock?: boolean;
  notes?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  winCriteria?: WinCriteria;
}

export interface Structure {
  competitionFormat?: competitionFormat;
  createdAt?: Date | string;
  extensions?: Extension[];
  finishingPosition?: FinishingPositionUnion;
  isMock?: boolean;
  matchUpFormat?: string;
  matchUps?: MatchUp[];
  matchUpType?: EventTypeUnion;
  notes?: string;
  positionAssignments?: PositionAssignment[];
  processCodes?: string[];
  qualifyingRoundNumber?: number;
  roundLimit?: number;
  roundOffset?: number;
  seedAssignments?: SeedAssignment[];
  seedingProfile?: SeedingProfileUnion;
  seedLimit?: number;
  stage?: StageTypeUnion;
  stageSequence?: number;
  structureAbbreviation?: string;
  structureId: string;
  structureName?: string;
  structures?: Structure[];
  structureOrder?: number;
  structureType?: StructureTypeUnion;
  tieFormat?: TieFormat;
  tieFormatId?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export enum FinishingPositionEnum {
  ROUND_OUTCOME = 'ROUND_OUTCOME',
  WIN_RATIO = 'WIN_RATIO',
}
export type FinishingPositionUnion = keyof typeof FinishingPositionEnum;

export interface PositionAssignment {
  bye?: boolean;
  createdAt?: Date | string;
  drawPosition: number;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  participantId?: string;
  qualifier?: boolean;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface SeedAssignment {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  participantId?: string;
  seedNumber: number;
  seedValue: number | string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export enum StructureTypeEnum {
  CONTAINER = 'CONTAINER',
  ITEM = 'ITEM',
}
export type StructureTypeUnion = keyof typeof StructureTypeEnum;

export enum TournamentLevelEnum {
  CLUB = 'CLUB',
  DISTRICT = 'DISTRICT',
  INTERNATIONAL = 'INTERNATIONAL',
  LOCAL = 'LOCAL',
  NATIONAL = 'NATIONAL',
  Recreational = 'RECREATIONAL',
  REGIONAL = 'REGIONAL',
  ZONAL = 'ZONAL',
}
export type TournamentLevelUnion = keyof typeof TournamentLevelEnum;

export enum WheelchairClassEnum {
  QUAD = 'QUAD',
  STANDARD = 'STANDARD',
}
export type WheelchairClassUnion = keyof typeof WheelchairClassEnum;

export enum CountryCodeEnum {
  ASM = 'ASM',
  ATA = 'ATA',
  Abw = 'ABW',
  Afg = 'AFG',
  Ago = 'AGO',
  Aia = 'AIA',
  Ala = 'ALA',
  Alb = 'ALB',
  And = 'AND',
  Ant = 'ANT',
  Are = 'ARE',
  Arg = 'ARG',
  Arm = 'ARM',
  Atf = 'ATF',
  Atg = 'ATG',
  Aus = 'AUS',
  Aut = 'AUT',
  Aze = 'AZE',
  Bdi = 'BDI',
  Bel = 'BEL',
  Ben = 'BEN',
  Bfa = 'BFA',
  Bgd = 'BGD',
  Bgr = 'BGR',
  Bhr = 'BHR',
  Bhs = 'BHS',
  Bih = 'BIH',
  Blm = 'BLM',
  Blr = 'BLR',
  Blz = 'BLZ',
  Bmu = 'BMU',
  Bol = 'BOL',
  Bra = 'BRA',
  Brb = 'BRB',
  Brn = 'BRN',
  Btn = 'BTN',
  Bvt = 'BVT',
  Bwa = 'BWA',
  COM = 'COM',
  Caf = 'CAF',
  Can = 'CAN',
  Cck = 'CCK',
  Cgd = 'CGD',
  Che = 'CHE',
  Chl = 'CHL',
  Chn = 'CHN',
  Civ = 'CIV',
  Cmr = 'CMR',
  Cod = 'COD',
  Cog = 'COG',
  Cok = 'COK',
  Col = 'COL',
  Cpv = 'CPV',
  Cri = 'CRI',
  Cub = 'CUB',
  Cuw = 'CUW',
  Cxr = 'CXR',
  Cym = 'CYM',
  Cyp = 'CYP',
  Cze = 'CZE',
  DMA = 'DMA',
  DOM = 'DOM',
  Deu = 'DEU',
  Dji = 'DJI',
  Dnk = 'DNK',
  Dza = 'DZA',
  Ecu = 'ECU',
  Egy = 'EGY',
  Eri = 'ERI',
  Ese = 'ESE',
  Esh = 'ESH',
  Esp = 'ESP',
  Eth = 'ETH',
  FSM = 'FSM',
  Fin = 'FIN',
  Fji = 'FJI',
  Flk = 'FLK',
  Fra = 'FRA',
  Fro = 'FRO',
  Gab = 'GAB',
  Gbr = 'GBR',
  Geo = 'GEO',
  Ggy = 'GGY',
  Gha = 'GHA',
  Gib = 'GIB',
  Gin = 'GIN',
  Glp = 'GLP',
  Gmb = 'GMB',
  Gnb = 'GNB',
  Gnq = 'GNQ',
  Grc = 'GRC',
  Grd = 'GRD',
  Grl = 'GRL',
  Gtm = 'GTM',
  Guf = 'GUF',
  Gum = 'GUM',
  Guy = 'GUY',
  Hkg = 'HKG',
  Hmd = 'HMD',
  Hnd = 'HND',
  Hrv = 'HRV',
  Hti = 'HTI',
  Hun = 'HUN',
  IRQ = 'IRQ',
  ISR = 'ISR',
  Idn = 'IDN',
  Imn = 'IMN',
  Ind = 'IND',
  Iot = 'IOT',
  Irl = 'IRL',
  Irn = 'IRN',
  Isl = 'ISL',
  Ita = 'ITA',
  Jam = 'JAM',
  Jey = 'JEY',
  Jor = 'JOR',
  Jpn = 'JPN',
  Kaz = 'KAZ',
  Ken = 'KEN',
  Kgz = 'KGZ',
  Khm = 'KHM',
  Kir = 'KIR',
  Kna = 'KNA',
  Kor = 'KOR',
  Kos = 'KOS',
  Kwt = 'KWT',
  Lao = 'LAO',
  Lbn = 'LBN',
  Lbr = 'LBR',
  Lby = 'LBY',
  Lca = 'LCA',
  Lie = 'LIE',
  Lka = 'LKA',
  Lso = 'LSO',
  Ltu = 'LTU',
  Lux = 'LUX',
  Lva = 'LVA',
  MAC = 'MAC',
  MDA = 'MDA',
  MNG = 'MNG',
  Maf = 'MAF',
  Mar = 'MAR',
  Mco = 'MCO',
  Mdg = 'MDG',
  Mdv = 'MDV',
  Mex = 'MEX',
  Mhl = 'MHL',
  Mkd = 'MKD',
  Mli = 'MLI',
  Mlt = 'MLT',
  Mmr = 'MMR',
  Mne = 'MNE',
  Mnp = 'MNP',
  Moz = 'MOZ',
  Mrt = 'MRT',
  Msr = 'MSR',
  Mtq = 'MTQ',
  Mus = 'MUS',
  Mwi = 'MWI',
  Mys = 'MYS',
  Myt = 'MYT',
  NIC = 'NIC',
  NPL = 'NPL',
  Nam = 'NAM',
  Ncl = 'NCL',
  Ner = 'NER',
  Nfk = 'NFK',
  Nga = 'NGA',
  Niu = 'NIU',
  Nld = 'NLD',
  Nmp = 'NMP',
  Nor = 'NOR',
  Nru = 'NRU',
  Nzl = 'NZL',
  Omn = 'OMN',
  PNG = 'PNG',
  Pak = 'PAK',
  Pan = 'PAN',
  Pcn = 'PCN',
  Per = 'PER',
  Phl = 'PHL',
  Plw = 'PLW',
  Pol = 'POL',
  Pri = 'PRI',
  Prk = 'PRK',
  Prt = 'PRT',
  Pry = 'PRY',
  Pse = 'PSE',
  Pyf = 'PYF',
  Qat = 'QAT',
  Reu = 'REU',
  Rou = 'ROU',
  Rus = 'RUS',
  Rwa = 'RWA',
  SDN = 'SDN',
  SPM = 'SPM',
  SSD = 'SSD',
  Sau = 'SAU',
  Sen = 'SEN',
  Sgp = 'SGP',
  Sgs = 'SGS',
  Shn = 'SHN',
  Sjm = 'SJM',
  Slb = 'SLB',
  Sle = 'SLE',
  Slv = 'SLV',
  Smr = 'SMR',
  Smx = 'SMX',
  Som = 'SOM',
  Srb = 'SRB',
  Stp = 'STP',
  Sur = 'SUR',
  Svk = 'SVK',
  Svn = 'SVN',
  Swe = 'SWE',
  Swz = 'SWZ',
  Syc = 'SYC',
  Syr = 'SYR',
  TLS = 'TLS',
  Tca = 'TCA',
  Tcd = 'TCD',
  Tgo = 'TGO',
  Tha = 'THA',
  Tjk = 'TJK',
  Tkl = 'TKL',
  Tkm = 'TKM',
  Ton = 'TON',
  Tto = 'TTO',
  Tun = 'TUN',
  Tur = 'TUR',
  Tuv = 'TUV',
  Twn = 'TWN',
  Tza = 'TZA',
  Uga = 'UGA',
  Ukr = 'UKR',
  Umi = 'UMI',
  Ury = 'URY',
  Usa = 'USA',
  Uzb = 'UZB',
  Vat = 'VAT',
  Vct = 'VCT',
  Ven = 'VEN',
  Vgb = 'VGB',
  Vir = 'VIR',
  Vnm = 'VNM',
  Vut = 'VUT',
  Wlf = 'WLF',
  Wsm = 'WSM',
  Yem = 'YEM',
  Zaf = 'ZAF',
  Zmb = 'ZMB',
  Zwe = 'ZWE',
}
export type CountryCodeUnion = keyof typeof CountryCodeEnum;

export interface OnlineResource {
  createdAt?: Date | string;
  extensions?: Extension[];
  identifier?: string;
  isMock?: boolean;
  name?: string;
  notes?: string;
  provider?: string;
  resourceSubType?: string;
  resourceType?: OnlineResourceTypeUnion;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export enum OnlineResourceTypeEnum {
  EMAIL = 'EMAIL',
  OTHER = 'OTHER',
  SOCIAl_MEDIA = 'SOCIAL_MEDIA',
  URL = 'URL',
}
export type OnlineResourceTypeUnion = keyof typeof OnlineResourceTypeEnum;

export interface Participant {
  contacts?: Contact[];
  createdAt?: Date | string;
  extensions?: Extension[];
  homeVenueIds?: string[]; // only releveant when participantType is TEAM
  individualParticipantIds?: string[];
  isMock?: boolean;
  notes?: string;
  onlineResources?: OnlineResource[];
  participantId: string;
  participantName?: string;
  participantOtherName?: string;
  participantRole?: ParticipantRoleUnion;
  participantRoleResponsibilities?: string[];
  participantStatus?: ParticipantStatusUnion;
  participantType?: ParticipantTypeUnion;
  penalties?: Penalty[];
  person?: Person;
  personId?: string;
  representing?: CountryCodeUnion;
  teamId?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface Contact {
  createdAt?: Date | string;
  emailAddress?: string;
  extensions?: Extension[];
  fax?: string;
  isMock?: boolean;
  isPublic?: boolean;
  mobileTelephone?: string;
  name?: string;
  notes?: string;
  telephone?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export enum ParticipantRoleEnum {
  ADMINISTRATION = 'ADMINISTRATION',
  CAPTAIN = 'CAPTAIN',
  COACH = 'COACH',
  COMPETITOR = 'COMPETITOR',
  DIRECTOR = 'DIRECTOR',
  HOSPITALITY = 'HOSPITALITY',
  MEDIA = 'MEDIA',
  MEDICAL = 'MEDICAL',
  OFFICIAL = 'OFFICIAL',
  OTHER = 'OTHER',
  SECURITY = 'SECURITY',
  STRINGER = 'STRINGER',
  SUPERVISOR = 'SUPERVISOR',
  TRANSPORT = 'TRANSPORT',
  VOLUNTEER = 'VOLUNTEER',
}
export type ParticipantRoleUnion = keyof typeof ParticipantRoleEnum;

export enum ParticipantStatusEnum {
  ACTIVE = 'ACTIVE',
  WITHDRAWN = 'WITHDRAWN',
}
export type ParticipantStatusUnion = keyof typeof ParticipantStatusEnum;

export enum ParticipantTypeEnum {
  GROUP = 'GROUP',
  INDIVIDUAL = 'INDIVIDUAL',
  PAIR = 'PAIR',
  TEAM = 'TEAM',
}
export type ParticipantTypeUnion = keyof typeof ParticipantTypeEnum;

export interface Penalty {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  issuedAt?: string;
  matchUpId?: string;
  notes?: string;
  penaltyCode?: string;
  penaltyId: string;
  penaltyType: PenaltyTypeUnion;
  refereeParticipantId?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export enum PenaltyTypeEnum {
  BALL_ABUSE = 'BALL_ABUSE',
  COACHING = 'COACHING',
  DRESS_CODE_VIOLATION = 'DRESS_CODE_VIOLATION',
  EQUIMENT_VIOLATION = 'EQUIMENT_VIOLATION',
  FAILUIRE_TO_SIGN_IN = 'FAILUIRE_TO_SIGN_IN',
  FAILURE_TO_COMPLETE = 'FAILURE_TO_COMPLETE',
  INELIGIBILITY = 'INELIGIBILITY',
  LEAVING_THE_COURT = 'LEAVING_THE_COURT',
  NO_SHOW = 'NO_SHOW',
  OTHER = 'OTHER',
  PHYSICAL_ABUSE = 'PHYSICAL_ABUSE',
  PROHIBITED_SUBSTANCE = 'PROHIBITED_SUBSTANCE',
  PUNCTUALITY = 'PUNCTUALITY',
  RACKET_ABUSE = 'RACKET_ABUSE',
  REFUSAL_TO_PLAY = 'REFUSAL_TO_PLAY',
  UNSPORTSMANLIKE_CONDUCT = 'UNSPORTSMANLIKE_CONDUCT',
  VERBAL_ABUSE = 'VERBAL_ABUSE',
}
export type PenaltyTypeUnion = keyof typeof PenaltyTypeEnum;

export interface Person {
  addresses?: Address[];
  biographicalInformation?: BiographicalInformation;
  birthDate?: string;
  contacts?: Contact[];
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  nationalityCode?: string;
  nativeFamilyName?: string;
  nativeGivenName?: string;
  notes?: string;
  onlineResources?: OnlineResource[];
  otherNames?: string[];
  parentOrganisationId?: string;
  passportFamilyName?: string;
  passportGivenName?: string;
  personId: string;
  personOtherIds?: UnifiedPersonID[];
  previousNames?: string[];
  sectionId?: string;
  sex?: SexUnion;
  standardFamilyName?: string;
  standardGivenName?: string;
  status?: string;
  tennisId?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  wheelchair?: boolean;
}

export interface Address {
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  addressName?: string;
  addressType?: AddressTypeUnion;
  city?: string;
  countryCode?: CountryCodeUnion;
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  latitude?: string;
  longitude?: string;
  notes?: string;
  postalCode?: string;
  state?: string;
  timeItems?: TimeItem[];
  timeZone?: string;
  updatedAt?: Date | string;
}

export enum AddressTypeEnum {
  HOME = 'HOME',
  MAIL = 'MAIL',
  PRIMARY = 'PRIMARY',
  RESIDENTIAL = 'RESIDENTIAL',
  VENUE = 'VENUE',
  WORK = 'WORK',
}
export type AddressTypeUnion = keyof typeof AddressTypeEnum;

export interface BiographicalInformation {
  ageBeganTennis?: number;
  ageTurnedPro?: number;
  birthCountryCode?: CountryCodeUnion;
  coachId?: string;
  createdAt?: Date | string;
  doublePlayingHand?: PlayingDoubleHandCodeUnion;
  extensions?: Extension[];
  height?: number;
  heightUnit?: LengthUnitUnion;
  isMock?: boolean;
  notes?: string;
  organisationIds?: string[];
  placeOfResidence?: string;
  playingHand?: PlayingHandCodeUnion;
  residenceCountryCode?: CountryCodeUnion;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  weight?: number;
  weightUnit?: WeightUnitEnum;
}

export enum PlayingDoubleHandCodeEnum {
  BACKHAND = 'BACKHAND',
  BOTH = 'BOTH',
  FOREHAND = 'FOREHAND',
  NONE = 'NONE',
}
export type PlayingDoubleHandCodeUnion = keyof typeof PlayingDoubleHandCodeEnum;

export enum LengthUnitEnum {
  CENTIMETER = 'CENTIMETER',
  METER = 'METER',
  MILLIMETER = 'MILLIMETER',
}
export type LengthUnitUnion = keyof typeof LengthUnitEnum;

export enum PlayingHandCodeEnum {
  AMBIDEXTROUS = 'AMBIDEXTROUS',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
}
export type PlayingHandCodeUnion = keyof typeof PlayingHandCodeEnum;

enum WeightUnitEnum {
  GRAM = 'GRAM',
  KILOGRAM = 'KILOGRAM',
}
export type WeightUnitUnion = keyof typeof WeightUnitEnum;

export interface UnifiedPersonID {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  organisationId: string;
  personId: string;
  timeItems?: TimeItem[];
  uniqueOrganisationName?: string;
  updatedAt?: Date | string;
}

export enum SexEnum {
  FEMALE = 'FEMALE',
  MALE = 'MALE',
  OTHER = 'OTHER',
}
export type SexUnion = keyof typeof SexEnum;

export interface RegistrationProfile {
  createdAt?: Date | string;
  entriesClose?: Date | string;
  entriesOpen?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  withdrawalDeadline?: Date | string;
}

export interface PrizeMoney {
  amount: number;
  createdAt?: Date | string;
  currencyCode: string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface UnifiedTournamentID {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  organisationId: string;
  timeItems?: TimeItem[];
  tournamentId: string;
  uniqueOrganisationName?: string;
  updatedAt?: Date | string;
}

export interface Venue {
  addresses?: Address[];
  contacts?: Contact[];
  courts?: Court[];
  createdAt?: Date | string;
  dateAvailability?: Availability[];
  defaultEndTime?: string;
  defaultStartTime?: string;
  extensions?: Extension[];
  isMock?: boolean;
  isPrimary?: boolean;
  notes?: string;
  onlineResources?: OnlineResource[];
  parentOrganisationId?: string;
  roles?: string[];
  subVenues?: Venue[];
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  venueAbbreviation?: string;
  venueId: string;
  venueName?: string;
  venueOtherIds?: UnifiedVenueID[];
  venueType?: string;
}

export interface Court {
  altitude?: number;
  courtDimensions?: string;
  courtId: string;
  courtName?: string;
  createdAt?: Date | string;
  dateAvailability?: Availability[];
  extensions?: Extension[];
  floodlit?: boolean;
  indoorOutdoor?: IndoorOutdoorUnion;
  isMock?: boolean;
  latitude?: string;
  longitude?: string;
  notes?: string;
  onlineResources?: OnlineResource[];
  pace?: string;
  surfaceCategory?: SurfaceCategoryUnion;
  surfacedDate?: Date | string;
  surfaceType?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface Availability {
  bookings?: Booking[];
  createdAt?: Date | string;
  date?: string;
  endTime?: string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  startTime?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface Booking {
  bookingType?: string;
  createdAt?: Date | string;
  endTime?: string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  startTime?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface UnifiedVenueID {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  organisationId: string;
  timeItems?: TimeItem[];
  uniqueOrganisationName?: string;
  updatedAt?: Date | string;
  venueId: string;
}

export enum WeekdayEnum {
  MON = 'MON',
  TUE = 'TUE',
  WED = 'WED',
  THU = 'THU',
  FRI = 'FRI',
  SAT = 'SAT',
  SUN = 'SUN',
}
export type WeekdayUnion = keyof typeof WeekdayEnum;
