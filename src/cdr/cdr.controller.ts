import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CdrService } from './cdr.service';
import { CreateCdrDto } from './cdr.dto';

@ApiTags('3CX Call Logs')
@Controller('cdr')
export class CdrController {
  constructor(private readonly cdrService: CdrService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingest raw 3CX CDR record' })
  async create(@Body() createCdrDto: CreateCdrDto) {
    await this.cdrService.saveCdr(createCdrDto);
    return { success: true };
  }

  @Get('logs')
  @ApiOperation({
    summary: 'Get 3CX Call Logs filtered strictly to pilot stores',
    description:
      'Returns 3CX call logs strictly filtered to phone numbers (DIDs) present in StoreConfig, enriched with storeName and call status classification (missed vs answered).',
  })
  @ApiQuery({ name: 'storeId', required: false, description: 'Filter by Store ObjectId' })
  @ApiQuery({ name: 'did', required: false, description: 'Filter by Store DID phone number' })
  @ApiQuery({ name: 'isMissed', required: false, description: 'Filter by missed call status ("true" / "false")' })
  @ApiQuery({ name: 'search', required: false, description: 'Search caller mobile/phone number' })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO start date' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO end date' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of results to return (default 50)' })
  @ApiQuery({ name: 'skip', required: false, description: 'Number of results to skip (default 0)' })
  async getCallLogs(
    @Query('storeId') storeId?: string,
    @Query('did') did?: string,
    @Query('isMissed') isMissed?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.cdrService.findStoreCdrLogs({
      storeId,
      did,
      isMissed: isMissed !== undefined ? isMissed === 'true' : undefined,
      search,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : 50,
      skip: skip ? parseInt(skip, 10) : 0,
    });
  }

  @Get()
  @ApiOperation({
    summary: 'Get 3CX Call Logs (alias for /cdr/logs)',
    description: 'Alias for GET /cdr/logs.',
  })
  async getCallLogsRoot(
    @Query('storeId') storeId?: string,
    @Query('did') did?: string,
    @Query('isMissed') isMissed?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.getCallLogs(
      storeId,
      did,
      isMissed,
      search,
      startDate,
      endDate,
      limit,
      skip,
    );
  }
}

