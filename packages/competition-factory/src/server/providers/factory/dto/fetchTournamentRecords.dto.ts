import { ApiPropertyOptional } from '@nestjs/swagger';

export class FetchTournamentRecordsDto {
  @ApiPropertyOptional()
  tournamentIds?: string[];

  @ApiPropertyOptional()
  tournamentId?: string;
}
