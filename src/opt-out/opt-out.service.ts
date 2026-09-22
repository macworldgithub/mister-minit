import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OptOut, OptOutDocument } from './opt-out.schema';
import { getPhoneNumberVariations } from '../sms-threads/sms-threads.service';

export interface AddOptOutPayload {
  callerNumber: string;
  keyword: string;
  source: 'keyword' | 'llm_detected';
  threadId: string;
}

@Injectable()
export class OptOutService {
  private readonly logger = new Logger(OptOutService.name);

  constructor(
    @InjectModel(OptOut.name) private optOutModel: Model<OptOutDocument>,
  ) {}

  /**
   * Returns true if the number has previously opted out.
   * Indexed lookup — O(log n).
   */
  async isOptedOut(callerNumber: string): Promise<boolean> {
    const exists = await this.optOutModel
      .exists({ callerNumber: { $in: getPhoneNumberVariations(callerNumber) } })
      .exec();
    return exists !== null;
  }

  /**
   * Records an opt-out.
   * Idempotent — if the number already exists the document is not duplicated.
   */
  async addOptOut(payload: AddOptOutPayload): Promise<void> {
    try {
      const already = await this.optOutModel
        .exists({ callerNumber: payload.callerNumber })
        .exec();

      if (already !== null) {
        this.logger.debug(
          `Opt-out already recorded for ${payload.callerNumber} — skipping.`,
        );
        return;
      }

      await this.optOutModel.create({
        callerNumber: payload.callerNumber,
        keyword: payload.keyword,
        source: payload.source,
        threadId: payload.threadId,
        optOutAt: new Date(),
      });

      this.logger.log(
        `Opt-out recorded for ${payload.callerNumber} (source: ${payload.source})`,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to record opt-out for ${payload.callerNumber}: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }

  /**
   * Retrieves paginated opt-out records with optional search filter.
   */
  async findOptOuts(filter: {
    search?: string;
    source?: 'keyword' | 'llm_detected';
    startDate?: string;
    endDate?: string;
    limit?: number;
    skip?: number;
  }): Promise<{
    total: number;
    limit: number;
    skip: number;
    optOuts: any[];
  }> {
    const limit = Math.min(Math.max(filter.limit || 50, 1), 200);
    const skip = Math.max(filter.skip || 0, 0);

    const query: Record<string, any> = {};

    if (filter.search && filter.search.trim()) {
      query.callerNumber = { $regex: filter.search.trim(), $options: 'i' };
    }
    if (filter.source) {
      query.source = filter.source;
    }
    if (filter.startDate || filter.endDate) {
      query.optOutAt = {};
      if (filter.startDate) query.optOutAt.$gte = new Date(filter.startDate);
      if (filter.endDate) query.optOutAt.$lte = new Date(filter.endDate);
    }

    const [total, docs] = await Promise.all([
      this.optOutModel.countDocuments(query).exec(),
      this.optOutModel
        .find(query)
        .sort({ optOutAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
    ]);

    const optOuts = docs.map((doc) => {
      const obj = doc.toObject() as any;
      return {
        id: obj._id ? obj._id.toString() : '',
        callerNumber: obj.callerNumber,
        keyword: obj.keyword,
        source: obj.source,
        threadId: obj.threadId,
        optOutAt: obj.optOutAt,
        createdAt: obj.createdAt,
      };
    });

    return { total, limit, skip, optOuts };
  }
}

