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

  async findByCallId(callId: string): Promise<SuppressedEventDocument | null> {
    return this.suppressedEventModel.findOne({ callId }).exec();
  }

  /**
   * Retrieves paginated suppressed events with optional filters.
   */
  async findSuppressedEvents(filter: {
    reason?: SuppressedReason;
    storeId?: string;
    did?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    skip?: number;
  }): Promise<{
    total: number;
    limit: number;
    skip: number;
    events: any[];
  }> {
    const limit = Math.min(Math.max(filter.limit || 50, 1), 200);
    const skip = Math.max(filter.skip || 0, 0);

    const query: Record<string, any> = {};

    if (filter.reason) {
      query.suppressedReason = filter.reason;
    }
    if (filter.storeId) {
      query.storeId = filter.storeId;
    }
    if (filter.did) {
      query.did = filter.did;
    }
    if (filter.search && filter.search.trim()) {
      query.callerNumber = { $regex: filter.search.trim(), $options: 'i' };
    }
    if (filter.startDate || filter.endDate) {
      query.createdAt = {};
      if (filter.startDate) query.createdAt.$gte = new Date(filter.startDate);
      if (filter.endDate) query.createdAt.$lte = new Date(filter.endDate);
    }

    const [total, docs] = await Promise.all([
      this.suppressedEventModel.countDocuments(query).exec(),
      this.suppressedEventModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
    ]);

    const events = docs.map((doc) => {
      const obj = doc.toObject() as any;
      return {
        id: obj._id ? obj._id.toString() : '',
        callerNumber: obj.callerNumber,
        did: obj.did,
        storeId: obj.storeId || null,
        storeName: obj.storeName || 'Unknown Store',
        callId: obj.callId,
        suppressedReason: obj.suppressedReason,
        createdAt: obj.createdAt,
      };
    });

    return { total, limit, skip, events };
  }

  /**
   * Aggregated count by suppression reason.
   */
  async getSuppressionSummary(): Promise<{
    totalSuppressed: number;
    byReason: Record<string, number>;
  }> {
    const agg = await this.suppressedEventModel.aggregate([
      { $group: { _id: '$suppressedReason', count: { $sum: 1 } } },
    ]);

    const byReason: Record<string, number> = {};
    let totalSuppressed = 0;

    for (const item of agg) {
      byReason[item._id] = item.count;
      totalSuppressed += item.count;
    }

    return { totalSuppressed, byReason };
  }
}

