import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OptOut, OptOutDocument } from './opt-out.schema';

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
      .exists({ callerNumber })
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
}
