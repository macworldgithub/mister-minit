import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { LoggingService } from './logging.service';
import { LogEventType } from './log.schema';

@ApiTags('System Logs & Audit')
@Controller('logs')
export class LoggingController {
  constructor(private readonly loggingService: LoggingService) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated audit logs with optional filters' })
  async getLogs(
    @Query('eventType') eventType?: LogEventType,
    @Query('callerNumber') callerNumber?: string,
    @Query('storeId') storeId?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.loggingService.findLogs({
      eventType,
      callerNumber,
      storeId,
      limit: limit ? parseInt(limit, 10) : 50,
      skip: skip ? parseInt(skip, 10) : 0,
    });
  }

  @Get('recent')
  @ApiOperation({ summary: 'Get latest 25 real-time activity logs' })
  async getRecentLogs(@Query('limit') limit?: string) {
    return this.loggingService.findLogs({
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get aggregated log counts by event type' })
  async getStats() {
    return this.loggingService.getStats();
  }
}
