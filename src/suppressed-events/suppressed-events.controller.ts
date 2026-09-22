import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SuppressedEventsService } from './suppressed-events.service';
import { SuppressedReason } from './suppressed-event.schema';
import { OptOutService } from '../opt-out/opt-out.service';

@ApiTags('Suppression & Opt-outs')
@Controller('suppressions')
export class SuppressedEventsController {
  constructor(
    private readonly suppressedEventsService: SuppressedEventsService,
    private readonly optOutService: OptOutService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get paginated list of suppressed call events',
    description:
      'Returns suppressed call events (e.g. not_missed_call, not_mobile, internal_extension, opted_out, dedup, not_a_pilot_store) with store details and timestamps.',
  })
  @ApiQuery({ name: 'reason', enum: SuppressedReason, required: false, description: 'Filter by suppression reason' })
  @ApiQuery({ name: 'storeId', required: false, description: 'Filter by Store ObjectId' })
  @ApiQuery({ name: 'did', required: false, description: 'Filter by Store DID phone number' })
  @ApiQuery({ name: 'search', required: false, description: 'Search caller mobile/phone number' })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO start date' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO end date' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of results to return (default 50)' })
  @ApiQuery({ name: 'skip', required: false, description: 'Number of results to skip (default 0)' })
  async getSuppressedEvents(
    @Query('reason') reason?: SuppressedReason,
    @Query('storeId') storeId?: string,
    @Query('did') did?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.suppressedEventsService.findSuppressedEvents({
      reason,
      storeId,
      did,
      search,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : 50,
      skip: skip ? parseInt(skip, 10) : 0,
    });
  }

  @Get('opt-outs')
  @ApiOperation({
    summary: 'Get paginated list of customer opt-outs',
    description:
      'Returns all customer opt-out records with caller mobile, keyword used, source (keyword or llm_detected), and timestamp.',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Search caller mobile number' })
  @ApiQuery({ name: 'source', enum: ['keyword', 'llm_detected'], required: false, description: 'Filter by opt-out trigger source' })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO start date' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO end date' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of results to return (default 50)' })
  @ApiQuery({ name: 'skip', required: false, description: 'Number of results to skip (default 0)' })
  async getOptOuts(
    @Query('search') search?: string,
    @Query('source') source?: 'keyword' | 'llm_detected',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.optOutService.findOptOuts({
      search,
      source,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : 50,
      skip: skip ? parseInt(skip, 10) : 0,
    });
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Get suppression and opt-out overview statistics',
    description: 'Returns aggregated counts by suppression reason and total opt-outs for dashboard summary cards.',
  })
  async getSummary() {
    const [suppressionSummary, optOutsSummary] = await Promise.all([
      this.suppressedEventsService.getSuppressionSummary(),
      this.optOutService.findOptOuts({ limit: 1 }),
    ]);

    return {
      totalSuppressed: suppressionSummary.totalSuppressed,
      byReason: suppressionSummary.byReason,
      totalOptOuts: optOutsSummary.total,
    };
  }
}
