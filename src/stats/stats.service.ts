import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SmsThread, SmsThreadDocument, ThreadStatus } from '../sms-threads/sms-thread.schema';
import { Cdr, CdrDocument } from '../cdr/cdr.schema';
import { SuppressedEvent, SuppressedEventDocument, SuppressedReason } from '../suppressed-events/suppressed-event.schema';
import { OptOut, OptOutDocument } from '../opt-out/opt-out.schema';
import { StoreConfig, StoreConfigDocument } from '../store-config/store-config.schema';

export interface StatsFilterDto {
  storeId?: string;
  did?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    @InjectModel(SmsThread.name) private smsThreadModel: Model<SmsThreadDocument>,
    @InjectModel(Cdr.name) private cdrModel: Model<CdrDocument>,
    @InjectModel(SuppressedEvent.name) private suppressedEventModel: Model<SuppressedEventDocument>,
    @InjectModel(OptOut.name) private optOutModel: Model<OptOutDocument>,
    @InjectModel(StoreConfig.name) private storeConfigModel: Model<StoreConfigDocument>,
  ) {}

  /**
   * Main analytics method with optional store filtering (by storeId or did).
   */
  async getStats(filter: StatsFilterDto = {}) {
    let targetStore: StoreConfigDocument | null = null;

    if (filter.storeId && Types.ObjectId.isValid(filter.storeId)) {
      targetStore = await this.storeConfigModel.findById(filter.storeId).exec();
    } else if (filter.did) {
      targetStore = await this.storeConfigModel.findOne({ did: filter.did }).exec();
    }

    const storeIdStr = targetStore ? (targetStore as any)._id.toString() : null;
    const storeDid = targetStore ? targetStore.did : null;

    // Date range filter
    const dateQuery: any = {};
    if (filter.startDate || filter.endDate) {
      dateQuery.createdAt = {};
      if (filter.startDate) dateQuery.createdAt.$gte = new Date(filter.startDate);
      if (filter.endDate) dateQuery.createdAt.$lte = new Date(filter.endDate);
    }

    // ── 1. Telephony Stats (from `cdr`) ─────────────────────────────────────
    const cdrMatch: any = {};
    if (storeDid) {
      cdrMatch['dial-no'] = storeDid;
    }
    if (filter.startDate || filter.endDate) {
      cdrMatch.createdAt = dateQuery.createdAt;
    }

    const [telephonyAgg] = await this.cdrModel.aggregate([
      { $match: cdrMatch },
      {
        $project: {
          isMissed: {
            $cond: [
              {
                $and: [
                  { $eq: ['$reason-terminated', 'src_participant_terminated'] },
                  {
                    $or: [
                      { $eq: ['$time-answered', ''] },
                      { $not: ['$time-answered'] },
                      {
                        $regexMatch: {
                          input: { $ifNull: ['$duration', ''] },
                          regex: '^00:00:0[0-9]$',
                        },
                      },
                    ],
                  },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          missed: { $sum: '$isMissed' },
        },
      },
    ]);

    const totalInboundCalls = telephonyAgg?.total || 0;
    const missedCalls = telephonyAgg?.missed || 0;
    const answeredCalls = Math.max(0, totalInboundCalls - missedCalls);
    const missedCallRate =
      totalInboundCalls > 0
        ? Number(((missedCalls / totalInboundCalls) * 100).toFixed(1))
        : 0;

    // ── 2. Conversion & Engagement Stats (from `sms-threads`) ───────────────
    const threadMatch: any = {};
    if (storeIdStr) {
      threadMatch.storeId = new Types.ObjectId(storeIdStr);
    }
    if (filter.startDate || filter.endDate) {
      threadMatch.createdAt = dateQuery.createdAt;
    }

    const [threadAgg] = await this.smsThreadModel.aggregate([
      { $match: threadMatch },
      {
        $group: {
          _id: null,
          totalThreads: { $sum: 1 },
          recoveredInquiries: {
            $sum: { $cond: [{ $ne: ['$status', ThreadStatus.PENDING] }, 1, 0] },
          },
          customerReplies: {
            $sum: { $cond: [{ $eq: ['$customerReplied', true] }, 1, 0] },
          },
          bookingsCaptured: {
            $sum: { $cond: [{ $eq: ['$bookingCaptured', true] }, 1, 0] },
          },
          footTrafficConversions: {
            $sum: { $cond: [{ $eq: ['$status', ThreadStatus.CLOSED_VISITED] }, 1, 0] },
          },
          totalOptedOut: {
            $sum: { $cond: [{ $eq: ['$optedOut', true] }, 1, 0] },
          },
        },
      },
    ]);

    const totalThreads = threadAgg?.totalThreads || 0;
    const recoveredInquiries = threadAgg?.recoveredInquiries || 0;
    const customerReplies = threadAgg?.customerReplies || 0;
    const bookingsCaptured = threadAgg?.bookingsCaptured || 0;
    const footTrafficConversions = threadAgg?.footTrafficConversions || 0;
    const totalOptedOut = threadAgg?.totalOptedOut || 0;

    const customerEngagementRate =
      totalThreads > 0
        ? Number(((customerReplies / totalThreads) * 100).toFixed(1))
        : 0;

    const bookingConversionRate =
      totalThreads > 0
        ? Number(((bookingsCaptured / totalThreads) * 100).toFixed(1))
        : 0;

    const optOutRate =
      recoveredInquiries > 0
        ? Number(((totalOptedOut / recoveredInquiries) * 100).toFixed(1))
        : 0;

    // Service Breakdown
    const serviceAgg = await this.smsThreadModel.aggregate([
      {
        $match: {
          ...threadMatch,
          'bookingDetails.serviceType': { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$bookingDetails.serviceType',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const serviceBreakdown: Record<string, number> = {};
    for (const item of serviceAgg) {
      if (item._id) {
        serviceBreakdown[item._id] = item.count;
      }
    }

    // Thread Status Distribution
    const statusAgg = await this.smsThreadModel.aggregate([
      { $match: threadMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const statusDistribution: Record<string, number> = {};
    for (const item of statusAgg) {
      statusDistribution[item._id] = item.count;
    }

    // ── 3. AI Safety & Quality Control (from `suppressed-events`) ───────────
    const suppressionMatch: any = {};
    if (storeIdStr || storeDid) {
      suppressionMatch.$or = [];
      if (storeIdStr) suppressionMatch.$or.push({ storeId: storeIdStr });
      if (storeDid) suppressionMatch.$or.push({ did: storeDid });
    }
    if (filter.startDate || filter.endDate) {
      suppressionMatch.createdAt = dateQuery.createdAt;
    }

    const suppressionAgg = await this.suppressedEventModel.aggregate([
      { $match: suppressionMatch },
      { $group: { _id: '$suppressedReason', count: { $sum: 1 } } },
    ]);

    const suppressionMap: Record<string, number> = {};
    for (const item of suppressionAgg) {
      suppressionMap[item._id] = item.count;
    }

    const aiSafetySuppressions = {
      deduplicationPrevented: suppressionMap[SuppressedReason.DEDUP] || 0,
      answeredCallsFiltered: suppressionMap[SuppressedReason.NOT_MISSED_CALL] || 0,
      landlineFiltering: suppressionMap[SuppressedReason.NOT_MOBILE] || 0,
      internalCallsFiltered: suppressionMap[SuppressedReason.INTERNAL_EXTENSION] || 0,
      optedOutFiltered: suppressionMap[SuppressedReason.OPTED_OUT] || 0,
      notPilotStoreFiltered: suppressionMap[SuppressedReason.NOT_A_PILOT_STORE] || 0,
      totalCallsFiltered: Object.values(suppressionMap).reduce((a, b) => a + b, 0),
    };

    // ── 4. Compliance & Opt-Outs Breakdown ──────────────────────────────────
    const optOutSourceAgg = await this.smsThreadModel.aggregate([
      { $match: { ...threadMatch, optedOut: true } },
      {
        $group: {
          _id: { $ifNull: ['$optOutKeyword', 'keyword'] },
          count: { $sum: 1 },
        },
      },
    ]);

    const optOutSources: Record<string, number> = {
      keyword: 0,
      llm_detected: 0,
    };

    for (const item of optOutSourceAgg) {
      if (item._id && String(item._id).toLowerCase().includes('llm')) {
        optOutSources.llm_detected += item.count;
      } else {
        optOutSources.keyword += item.count;
      }
    }

    return {
      scope: targetStore
        ? {
            isSingleStore: true,
            storeId: storeIdStr,
            storeName: targetStore.storeName,
            did: targetStore.did,
          }
        : {
            isSingleStore: false,
            scopeName: 'All Pilot Stores Combined',
          },
      telephony: {
        totalInboundCallVolume: totalInboundCalls,
        missedCalls,
        answeredCalls,
        storeMissedCallRate: missedCallRate, // e.g. 34.2%
      },
      conversions: {
        recoveredInquiries,
        customerReplies,
        customerEngagementRate, // e.g. 64.5%
        bookingsCaptured,
        bookingConversionRate, // e.g. 29.2%
        footTrafficConversions, // count of closed_visited
        serviceDemandBreakdown: serviceBreakdown,
        threadStatusDistribution: statusDistribution,
      },
      aiSafetyQualityControl: aiSafetySuppressions,
      complianceAndRetention: {
        totalOptOuts: totalOptedOut,
        optOutRate, // e.g. 1.2%
        sourceBreakdown: optOutSources,
      },
    };
  }

  /**
   * Generates a comparative store-by-store breakdown for all pilot stores.
   */
  async getStoreComparison() {
    const stores = await this.storeConfigModel.find().lean().exec();

    const comparisonList = await Promise.all(
      stores.map(async (store) => {
        const stats = await this.getStats({ storeId: String(store._id) });
        return {
          storeId: String(store._id),
          storeName: store.storeName,
          did: store.did,
          isActive: store.isActive,
          telephony: stats.telephony,
          conversions: stats.conversions,
          aiSafety: stats.aiSafetyQualityControl,
          compliance: stats.complianceAndRetention,
        };
      }),
    );

    return comparisonList.sort(
      (a, b) => b.conversions.recoveredInquiries - a.conversions.recoveredInquiries,
    );
  }

  /**
   * Returns store list for frontend dropdown filters.
   */
  async getStoreList() {
    const stores = await this.storeConfigModel
      .find({}, { _id: 1, storeName: 1, did: 1, isActive: 1 })
      .lean()
      .exec();

    return stores.map((s) => ({
      storeId: String(s._id),
      storeName: s.storeName,
      did: s.did,
      isActive: s.isActive,
    }));
  }
}
