import { ApiPropertyOptional } from '@nestjs/swagger';

export class RemoveTournamentRecordsDto {
  @ApiPropertyOptional()
  tournamentIds?: string[];

  @ApiPropertyOptional()
  tournamentId?: string;
}
