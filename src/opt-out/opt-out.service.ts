import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OptOut, OptOutDocument } from './opt-out.schema';
import { getPhoneNumberVariations } from '../sms-threads/sms-threads.service';

export interface AddOptOutPayload {
  callerNumber: string;
  keyword: string;
  source: 'keyword' | 'llm_detected' | 'manual_suppression' | 'blocked';
  threadId?: string;
}

/**
 * Permanent internal blocklist: these numbers are permanently suppressed
 * at the system level and will NEVER receive any SMS (missed-call opening,
 * follow-up, inbound replies, or manual SMS).
 */
export const INTERNAL_BLOCKED_NUMBERS = new Set([
  '0405434292',
  '61405434292',
  '+61405434292',
  '0406500312',
  '61406500312',
  '+61406500312',
]);

@Injectable()
export class OptOutService {
  private readonly logger = new Logger(OptOutService.name);

  constructor(
    @InjectModel(OptOut.name) private optOutModel: Model<OptOutDocument>,
  ) {}

  /**
   * Returns true if the number has previously opted out or is in the permanent blocklist.
   * Indexed lookup — O(log n).
   */
  async isOptedOut(callerNumber: string): Promise<boolean> {
    if (!callerNumber) return false;
    const variations = getPhoneNumberVariations(callerNumber);

    // 1. Check permanent hardcoded blocklist
    for (const v of variations) {
      if (INTERNAL_BLOCKED_NUMBERS.has(v) || INTERNAL_BLOCKED_NUMBERS.has(v.replace(/\D/g, ''))) {
        return true;
      }
    }

    // 2. Check environment variable BLOCKED_PHONE_NUMBERS
    const envBlocked = (process.env.BLOCKED_PHONE_NUMBERS || '')
      .split(',')
      .map((s) => s.trim().replace(/\D/g, ''))
      .filter(Boolean);
    if (envBlocked.length > 0) {
      for (const v of variations) {
        const vDigits = v.replace(/\D/g, '');
        if (envBlocked.some((b) => b === vDigits || vDigits.endsWith(b) || b.endsWith(vDigits))) {
          return true;
        }
      }
    }

    // 3. Check MongoDB opt-outs collection
    const exists = await this.optOutModel
      .exists({ callerNumber: { $in: variations } })
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
        keyword: payload.keyword || 'BLOCK',
        source: payload.source,
        threadId: payload.threadId || 'manual',
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
   * Manually blocks a phone number from receiving any SMS.
   */
  async blockNumber(
    callerNumber: string,
    reason: 'manual_suppression' | 'blocked' = 'manual_suppression',
  ): Promise<{ success: boolean; callerNumber: string }> {
    const cleanNumber = callerNumber.trim().replace(/[\s\-()]/g, '');
    const variations = getPhoneNumberVariations(cleanNumber);

    const already = await this.optOutModel
      .exists({ callerNumber: { $in: variations } })
      .exec();

    if (!already) {
      await this.optOutModel.create({
        callerNumber: cleanNumber,
        keyword: 'INTERNAL_BLOCK',
        source: reason,
        threadId: 'manual',
        optOutAt: new Date(),
      });
      this.logger.log(`[MANUAL BLOCK] Number ${cleanNumber} permanently blocked.`);
    }

    return { success: true, callerNumber: cleanNumber };
  }

  /**
   * Removes a phone number from the opt-out / blocklist.
   */
  async removeOptOut(
    callerNumber: string,
  ): Promise<{ success: boolean; deletedCount: number }> {
    const variations = getPhoneNumberVariations(callerNumber);
    const result = await this.optOutModel
      .deleteMany({ callerNumber: { $in: variations } })
      .exec();
    this.logger.log(
      `[MANUAL UNBLOCK] Number ${callerNumber} unblocked (removed ${result.deletedCount || 0} records).`,
    );
    return {
      success: (result.deletedCount || 0) > 0,
      deletedCount: result.deletedCount || 0,
    };
  }

  /**
   * Retrieves paginated opt-out records with optional search filter.
   */
  async findOptOuts(filter: {
    search?: string;
    source?: 'keyword' | 'llm_detected' | 'manual_suppression' | 'blocked' | string;
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
      if (filter.endDate) {
        const end = new Date(filter.endDate);
        if (filter.endDate.length <= 10) {
          end.setUTCHours(23, 59, 59, 999);
        }
        query.optOutAt.$lte = end;
      }
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

