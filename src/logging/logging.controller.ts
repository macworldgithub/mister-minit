import { Controller, Get, Query } from '@nestjs/common';
import { LoggingService } from './logging.service';
import { LogEventType } from './log.schema';

@Controller('logs')
export class LoggingController {
  constructor(private readonly loggingService: LoggingService) {}

  @Get()
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
  async getRecentLogs(@Query('limit') limit?: string) {
    return this.loggingService.findLogs({
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Get('stats')
  async getStats() {
    return this.loggingService.getStats();
  }
}
