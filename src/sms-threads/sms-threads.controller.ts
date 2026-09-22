import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { SmsThreadsService } from './sms-threads.service';

@ApiTags('SMS Concierge & Threads')
@Controller('sms-threads')
export class SmsThreadsController {
  constructor(private readonly smsThreadsService: SmsThreadsService) {}

  @Get('live')
  @ApiOperation({
    summary: 'Get live/open SMS Concierge threads',
    description:
      'Returns active, non-closed, non-suppressed SMS threads with ongoing conversation history, current status, caller number, and store metadata.',
  })
  @ApiQuery({ name: 'storeId', required: false, description: 'Filter by Store ObjectId' })
  @ApiQuery({ name: 'did', required: false, description: 'Filter by Store DID phone number' })
  @ApiQuery({ name: 'search', required: false, description: 'Search caller mobile number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of results to return (default 50)' })
  @ApiQuery({ name: 'skip', required: false, description: 'Number of results to skip (default 0)' })
  async getLiveThreads(
    @Query('storeId') storeId?: string,
    @Query('did') did?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.smsThreadsService.findLiveThreads({
      storeId,
      did,
      search,
      limit: limit ? parseInt(limit, 10) : 50,
      skip: skip ? parseInt(skip, 10) : 0,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get thread details and full conversation history by ID',
    description: 'Returns single SMS thread with complete conversation history and current state.',
  })
  @ApiParam({ name: 'id', description: 'SMS Thread ID' })
  async getThreadById(@Param('id') id: string) {
    const thread = await this.smsThreadsService.findThreadById(id);
    if (!thread) {
      throw new NotFoundException(`SMS Thread with ID "${id}" not found`);
    }
    return thread;
  }

  @Get()
  @ApiOperation({
    summary: 'Query all SMS threads with optional status and store filters',
    description:
      'Filter threads by status ("live", "all", "sms_sent", "active", "booking_requested", "closed_visited", etc.).',
  })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by thread status (default "live")' })
  @ApiQuery({ name: 'storeId', required: false, description: 'Filter by Store ObjectId' })
  @ApiQuery({ name: 'did', required: false, description: 'Filter by Store DID phone number' })
  @ApiQuery({ name: 'search', required: false, description: 'Search caller mobile number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of results to return (default 50)' })
  @ApiQuery({ name: 'skip', required: false, description: 'Number of results to skip (default 0)' })
  async getAllThreads(
    @Query('status') status?: string,
    @Query('storeId') storeId?: string,
    @Query('did') did?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.smsThreadsService.findAllThreads({
      status,
      storeId,
      did,
      search,
      limit: limit ? parseInt(limit, 10) : 50,
      skip: skip ? parseInt(skip, 10) : 0,
    });
  }
}
