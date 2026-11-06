import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { OptOutService } from './opt-out.service';

@ApiTags('Opt-Out & Blocklist Management')
@Controller('opt-out')
export class OptOutController {
  constructor(private readonly optOutService: OptOutService) {}

  @Post()
  @ApiOperation({
    summary: 'Manually block a phone number from receiving any SMS',
    description:
      'Adds a phone number to the permanent opt-out/blocklist so no missed-call or outbound SMS is ever sent to it.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        callerNumber: { type: 'string', example: '0405434292' },
        reason: { type: 'string', example: 'manual_suppression' },
      },
      required: ['callerNumber'],
    },
  })
  async blockNumber(@Body() body: { callerNumber: string; reason?: string }) {
    if (!body?.callerNumber) {
      throw new BadRequestException('callerNumber is required');
    }
    return this.optOutService.blockNumber(
      body.callerNumber,
      (body.reason as any) || 'manual_suppression',
    );
  }

  @Delete(':callerNumber')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove phone number from opt-out/blocklist',
    description: 'Unblocks a phone number, re-enabling SMS communications.',
  })
  @ApiParam({ name: 'callerNumber', example: '0405434292' })
  async removeOptOut(@Param('callerNumber') callerNumber: string) {
    if (!callerNumber) {
      throw new BadRequestException('callerNumber is required');
    }
    return this.optOutService.removeOptOut(callerNumber);
  }

  @Get('status/:callerNumber')
  @ApiOperation({ summary: 'Check if phone number is opted-out / blocked' })
  async checkStatus(@Param('callerNumber') callerNumber: string) {
    const isBlocked = await this.optOutService.isOptedOut(callerNumber);
    return { callerNumber, isBlocked };
  }
}

