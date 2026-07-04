export type ReportColumn = {
  key: string;
  title: string;
  type?: 'string' | 'number' | 'boolean' | 'date';
  width?: number;
  headerWordWrap?: boolean;
  // Size the column to its content (header + longest value) and do not let it
  // absorb spare table width — consumers keep other columns flexible instead.
  fitData?: boolean;
};

export type ReportDefinition = {
  reportId: string;
  name: string;
  description: string;
  category: string;
  source?: 'factory' | 'server';
};

export type ReportResult = {
  reportId: string;
  generatedAt: string;
  parameters?: Record<string, any>;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  summary?: Record<string, any>;
};

export type ReportAvailability = ReportDefinition & {
  computableNow: boolean;
};

export type ReportContext = {
  tournamentRecord: any;
  participantMap?: Record<string, any>;
  matchUps?: any[];
  venues?: any[];
};
