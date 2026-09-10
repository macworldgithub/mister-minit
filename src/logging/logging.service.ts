import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Log, LogDocument, LogEventType } from './log.schema';

export interface LogPayload {
  callerNumber?: string;
  storeId?: string;
  storeName?: string;
  threadId?: string;
  callId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class LoggingService {
  private readonly logger = new Logger(LoggingService.name);

  constructor(@InjectModel(Log.name) private logModel: Model<LogDocument>) {}

  async log(eventType: LogEventType, payload: LogPayload = {}): Promise<void> {
    try {
      await this.logModel.create({
        eventType,
        callerNumber: payload.callerNumber ?? undefined,
        storeId: payload.storeId ?? undefined,
        storeName: payload.storeName ?? undefined,
        threadId: payload.threadId ?? undefined,
        callId: payload.callId ?? undefined,
        metadata: payload.metadata ?? undefined,
      });
    } catch (err: any) {
      // Logging must never break the caller — swallow the error silently.
      this.logger.error(
        `Failed to write log entry [${eventType}]: ${err.message}`,
        err.stack,
      );
    }
  }
}
