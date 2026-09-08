import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SuppressedEvent,
  SuppressedEventDocument,
  SuppressedReason,
} from './suppressed-event.schema';

export { SuppressedReason };

export interface SuppressPayload {
  callerNumber: string;
  did: string;
  storeId?: string;
  storeName?: string;
  callId: string;
  suppressedReason: SuppressedReason;
}

@Injectable()
export class SuppressedEventsService {
  private readonly logger = new Logger(SuppressedEventsService.name);

  constructor(
    @InjectModel(SuppressedEvent.name)
    private suppressedEventModel: Model<SuppressedEventDocument>,
  ) {}

  async suppress(payload: SuppressPayload): Promise<void> {
    try {
      await this.suppressedEventModel.create({
        callerNumber: payload.callerNumber,
        did: payload.did,
        storeId: payload.storeId ?? undefined,
        storeName: payload.storeName ?? undefined,
        callId: payload.callId,
        suppressedReason: payload.suppressedReason,
      });

      this.logger.log(
        `Call suppressed [${payload.suppressedReason}] — caller: ${payload.callerNumber}, callId: ${payload.callId}`,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to record suppressed event for callId ${payload.callId}: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }
}
