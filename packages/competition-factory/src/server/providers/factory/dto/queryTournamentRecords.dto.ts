import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QueryTournamentRecordsDto {
  @ApiPropertyOptional()
  tournamentIds?: string[];

  @ApiPropertyOptional()
  tournamentId?: string;

  @ApiProperty()
  params: any;
}
