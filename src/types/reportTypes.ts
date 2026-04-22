export type ReportColumn = {
  key: string;
  title: string;
  type?: 'string' | 'number' | 'boolean' | 'date';
  width?: number;
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
