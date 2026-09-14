import { TournamentRecords } from '@Types/factoryTypes';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Tournament } from '@Types/tournamentTypes';

export class SaveTournamentRecordsDto {
  @ApiPropertyOptional()
  tournamentRecords?: TournamentRecords;

  @ApiPropertyOptional()
  tournamentRecord?: Tournament;
}
