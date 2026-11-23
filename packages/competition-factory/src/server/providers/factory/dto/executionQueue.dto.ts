import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExecutionQueueDto {
  @ApiPropertyOptional()
  tournamentIds?: string[];

  @ApiPropertyOptional()
  tournamentId?: string;

  @ApiProperty()
  executionQueue: any[] = [];
}
