import { RemoveTournamentRecordsDto } from './dto/removeTournamentRecords.dto';
import { FetchTournamentRecordsDto } from './dto/fetchTournamentRecords.dto';
import { QueryTournamentRecordsDto } from './dto/queryTournamentRecords.dto';
import { SaveTournamentRecordsDto } from './dto/saveTournamentRecords.dto';
import { ExecutionQueueDto } from './dto/executionQueue.dto';

import { Controller, Get, Post, HttpCode, HttpStatus, Body, UseGuards } from '@nestjs/common';
import { Public } from '@Server/auth/decorators/public.decorator';
import { Roles } from '@Server/auth/decorators/roles.decorator';
import { RolesGuard } from '@Server/auth/guards/role.guard';
import { FactoryService } from './factory.service';

@UseGuards(RolesGuard)
@Controller('factory')
export class FactoryController {
  constructor(private readonly factoryService: FactoryService) {}

  @Get()
  @Public()
  default() {
    return { message: 'Factory services' };
  }

  @Public()
  @Get('version')
  getVersion(): { version: string } {
    return this.factoryService.getVersion();
  }

  @Post()
  @Roles(['client'])
  @HttpCode(HttpStatus.OK)
  executionQueue(@Body() eqd: ExecutionQueueDto) {
    return this.factoryService.executionQueue(eqd);
  }

  @Post('fetch')
  @Roles(['client'])
  @HttpCode(HttpStatus.OK)
  fetchTournamentRecords(@Body() ftd: FetchTournamentRecordsDto) {
    return this.factoryService.fetchTournamentRecords(ftd);
  }

  @Post('generate')
  @Roles(['client'])
  @HttpCode(HttpStatus.OK)
  generateTournamentRecord(@Body() gtd: any) {
    return this.factoryService.generateTournamentRecord(gtd);
  }

  @Post('query')
  @Roles(['client'])
  @HttpCode(HttpStatus.OK)
  queryTournamentRecords(@Body() qtd: QueryTournamentRecordsDto) {
    return this.factoryService.queryTournamentRecords(qtd);
  }

  @Post('remove')
  @Roles(['client'])
  @HttpCode(HttpStatus.OK)
  removeTournamentRecords(@Body() rtd: RemoveTournamentRecordsDto) {
    return this.factoryService.removeTournamentRecords(rtd);
  }

  @Post('save')
  @Roles(['client'])
  @HttpCode(HttpStatus.OK)
  saveTournamentRecords(@Body() std: SaveTournamentRecordsDto) {
    return this.factoryService.saveTournamentRecords(std);
  }
}
