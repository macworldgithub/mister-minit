import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SmsThread,
  SmsThreadDocument,
  ThreadStatus,
  CLOSED_STATUSES,
  ConversationEntry,
  BookingDetails,
} from './sms-thread.schema';

export { ThreadStatus };

export function getPhoneNumberVariations(phone: string): string[] {
  if (!phone) return [];
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  const variations = new Set<string>();
  variations.add(trimmed);
  variations.add(digits);

  if (digits.startsWith('61') && digits.length === 11) {
    variations.add(`+${digits}`);
    variations.add(digits);
    variations.add(`0${digits.slice(2)}`);
  } else if (digits.startsWith('04') && digits.length === 10) {
    variations.add(digits);
    variations.add(`61${digits.slice(1)}`);
    variations.add(`+61${digits.slice(1)}`);
  } else if (digits.startsWith('4') && digits.length === 9) {
    variations.add(`0${digits}`);
    variations.add(`61${digits}`);
    variations.add(`+61${digits}`);
  }

  return Array.from(variations);
}

@Injectable()
export class SmsThreadsService {
  private readonly logger = new Logger(SmsThreadsService.name);

  constructor(
    @InjectModel(SmsThread.name)
    private smsThreadModel: Model<SmsThreadDocument>,
  ) {}

  /**
   * Finds an open (non-closed) thread for the given caller + store combination.
   */
  async findActiveThread(
    callerNumber: string,
    storeId: string,
  ): Promise<SmsThread | null> {
    return this.smsThreadModel
      .findOne({
        callerNumber: { $in: getPhoneNumberVariations(callerNumber) },
        storeId: new Types.ObjectId(storeId),
        status: { $nin: CLOSED_STATUSES },
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Finds the most recent thread for the given caller + store, regardless of status.
   */
  async findByCallerAndStore(
    callerNumber: string,
    storeId: string,
  ): Promise<SmsThread | null> {
    return this.smsThreadModel
      .findOne({
        callerNumber: { $in: getPhoneNumberVariations(callerNumber) },
        storeId: new Types.ObjectId(storeId),
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Finds the most recent active (non-closed) thread for a caller across all stores.
   * Used by inbound SMS handler where storeId is not yet known.
   */
  async findMostRecentByCallerNumber(
    callerNumber: string,
  ): Promise<SmsThread | null> {
    return this.smsThreadModel
      .findOne({
        callerNumber: { $in: getPhoneNumberVariations(callerNumber) },
        status: { $nin: CLOSED_STATUSES },
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Finds the most recent thread for a caller across all stores, regardless of status.
   * Useful for test endpoints to inspect the final state of closed threads.
   */
  async findMostRecentThreadAnyStatus(
    callerNumber: string,
  ): Promise<SmsThread | null> {
    return this.smsThreadModel
      .findOne({ callerNumber: { $in: getPhoneNumberVariations(callerNumber) } })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Creates a new SMS thread in PENDING status.
   */
  async createThread(payload: {
    callId: string;
    callerNumber: string;
    did: string;
    storeId: string;
  }): Promise<SmsThread> {
    const created = await this.smsThreadModel.create({
      callId: payload.callId,
      callerNumber: payload.callerNumber,
      did: payload.did,
      storeId: new Types.ObjectId(payload.storeId),
      status: ThreadStatus.PENDING,
    });
    this.logger.log(
      `Thread created [${created._id}] for caller ${payload.callerNumber}`,
    );
    return created;
  }

  /**
   * Updates the status field of an existing thread.
   */
  async updateStatus(threadId: string, status: ThreadStatus): Promise<void> {
    await this.smsThreadModel
      .updateOne({ _id: threadId }, { $set: { status } })
      .exec();
  }

  /**
   * Appends a message entry to conversationHistory.
   */
  async appendToHistory(
    threadId: string,
    entry: ConversationEntry,
  ): Promise<void> {
    await this.smsThreadModel
      .updateOne({ _id: threadId }, { $push: { conversationHistory: entry } })
      .exec();
  }

  /**
   * Marks the opening SMS as sent; transitions to sms_sent status.
   */
  async setOpeningSent(threadId: string): Promise<void> {
    await this.smsThreadModel
      .updateOne(
        { _id: threadId },
        {
          $set: {
            openingSentAt: new Date(),
            status: ThreadStatus.SMS_SENT,
          },
        },
      )
      .exec();
  }

  /**
   * Records first customer reply.
   */
  async setCustomerReplied(threadId: string): Promise<void> {
    await this.smsThreadModel
      .updateOne(
        { _id: threadId },
        {
          $set: {
            customerReplied: true,
            lastInteractionAt: new Date(),
          },
        },
      )
      .exec();
  }

  /**
   * Saves captured booking details and transitions to booking_requested.
   */
  async saveBooking(
    threadId: string,
    bookingDetails: BookingDetails,
  ): Promise<void> {
    await this.smsThreadModel
      .updateOne(
        { _id: threadId },
        {
          $set: {
            bookingCaptured: true,
            bookingDetails,
            status: ThreadStatus.BOOKING_REQUESTED,
          },
        },
      )
      .exec();
  }

  /**
   * Closes a thread with a given reason. The reason string is expected to be
   * one of the closed_* ThreadStatus values.
   */
  async closeThread(threadId: string, reason: string): Promise<void> {
    await this.smsThreadModel
      .updateOne(
        { _id: threadId },
        {
          $set: {
            closedAt: new Date(),
            closedReason: reason,
            status: reason,
          },
        },
      )
      .exec();
  }

  /**
   * Marks the day-3 follow-up as sent.
   */
  async setFollowUpSent(threadId: string): Promise<void> {
    await this.smsThreadModel
      .updateOne({ _id: threadId }, { $set: { followUpSentAt: new Date() } })
      .exec();
  }

  /**
   * Returns threads that are eligible to receive the day-3 follow-up:
   * - No customer reply
   * - Still in sms_sent status
   * - Opening sent >= 72 hours ago
   * - Follow-up not yet sent
   */
  async findThreadsForFollowUp(): Promise<SmsThread[]> {
    const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);
    return this.smsThreadModel
      .find({
        customerReplied: false,
        status: ThreadStatus.SMS_SENT,
        openingSentAt: { $lte: cutoff },
        followUpSentAt: null,
      })
      .exec();
  }

  /**
   * Returns threads to auto-close:
   * - No customer reply
   * - Still in sms_sent status
   * - Follow-up already sent >= 72 hours ago
   */
  async findThreadsToClose(): Promise<SmsThread[]> {
    const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);
    return this.smsThreadModel
      .find({
        customerReplied: false,
        status: ThreadStatus.SMS_SENT,
        followUpSentAt: { $ne: null, $lte: cutoff },
      })
      .exec();
  }

  async incrementMessageCount(threadId: string): Promise<void> {
    await this.smsThreadModel
      .findByIdAndUpdate(threadId, { $inc: { messageCount: 1 } })
      .exec();
  }
}
