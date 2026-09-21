import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { StatsService } from './stats.service';

@ApiTags('Analytics & Stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get system analytics (Overall or filtered by specific store)',
    description:
      'Returns telephony volume, recovered inquiries, engagement rates, booking conversions, AI safety suppressions, and opt-outs. Pass ?storeId or ?did to filter by a specific store.',
  })
  @ApiQuery({ name: 'storeId', required: false, description: 'MongoDB ObjectId of store' })
  @ApiQuery({ name: 'did', required: false, description: 'Store DID phone number (e.g. 0872286100)' })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO date string (e.g. 2026-01-01)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO date string (e.g. 2026-12-31)' })
  async getStats(
    @Query('storeId') storeId?: string,
    @Query('did') did?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.statsService.getStats({ storeId, did, startDate, endDate });
  }

  @Get('by-store')
  @ApiOperation({
    summary: 'Get comparative analytics across all stores',
    description: 'Returns side-by-side comparative stats table for each store.',
  })
  async getStoreComparison() {
    return this.statsService.getStoreComparison();
  }

  @Get('stores')
  @ApiOperation({
    summary: 'Get store list for frontend filter dropdown',
    description: 'Returns list of store names, IDs, and DIDs for dropdown selector.',
  })
  async getStoreList() {
    return this.statsService.getStoreList();
  }
}
