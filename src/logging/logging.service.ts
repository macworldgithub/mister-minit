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

export interface LogFilterDto {
  eventType?: LogEventType;
  callerNumber?: string;
  storeId?: string;
  limit?: number;
  skip?: number;
}

@Injectable()
export class LoggingService {
  private readonly logger = new Logger(LoggingService.name);

  constructor(@InjectModel(Log.name) private logModel: Model<LogDocument>) {}

  async log(eventType: LogEventType, payload: LogPayload = {}): Promise<void> {
    // 1. Output clearly formatted log to console for real-time observability
    const details = payload.metadata ? ` | metadata: ${JSON.stringify(payload.metadata)}` : '';
    const caller = payload.callerNumber ? ` | caller: ${payload.callerNumber}` : '';
    const store = payload.storeName ? ` | store: "${payload.storeName}"` : payload.storeId ? ` | storeId: ${payload.storeId}` : '';
    const thread = payload.threadId ? ` | threadId: ${payload.threadId}` : '';
    const call = payload.callId ? ` | callId: ${payload.callId}` : '';

    this.logger.log(`[EVENT: ${eventType}]${caller}${store}${thread}${call}${details}`);

    // 2. Persist to MongoDB
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

  /**
   * Retrieve historical logs with optional filters
   */
  async findLogs(filter: LogFilterDto = {}) {
    const query: any = {};
    if (filter.eventType) {
      query.eventType = filter.eventType;
    }
    if (filter.callerNumber) {
      query.callerNumber = filter.callerNumber;
    }
    if (filter.storeId) {
      query.storeId = filter.storeId;
    }

    const limit = Math.min(filter.limit || 50, 200);
    const skip = filter.skip || 0;

    const [logs, total] = await Promise.all([
      this.logModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.logModel.countDocuments(query).exec(),
    ]);

    return { total, limit, skip, logs };
  }

  /**
   * Get log event summary statistics
   */
  async getStats() {
    return this.logModel
      .aggregate([
        {
          $group: {
            _id: '$eventType',
            count: { $sum: 1 },
            lastOccurred: { $max: '$createdAt' },
          },
        },
        { $sort: { count: -1 } },
      ])
      .exec();
  }
}
