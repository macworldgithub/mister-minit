import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cdr, CdrDocument } from './cdr.schema';
import { CreateCdrDto } from './cdr.dto';
import { StoreConfigService } from '../store-config/store-config.service';
import * as net from 'net';

const MAX_BUFFER_SIZE = 10 * 1024; // 10KB
const SOCKET_TIMEOUT = 60 * 1000; // 60 seconds

@Injectable()
export class CdrService implements OnModuleInit, OnModuleDestroy {
  private server: net.Server;
  private readonly logger = new Logger(CdrService.name);

  constructor(
    @InjectModel(Cdr.name) private cdrModel: Model<CdrDocument>,
    private eventEmitter: EventEmitter2,
    private storeConfigService: StoreConfigService,
  ) {}

  onModuleInit() {
    this.server = net.createServer((socket) => {
      this.logger.log(
        `Client connected from ${socket.remoteAddress}:${socket.remotePort}`,
      );

      let buffer = '';

      // Set encoding to handle multi-byte characters safely
      socket.setEncoding('utf8');

      // Set idle timeout
      socket.setTimeout(SOCKET_TIMEOUT);

      socket.on('timeout', () => {
        this.logger.warn(
          `Socket timeout after ${SOCKET_TIMEOUT}ms. Destroying socket for ${socket.remoteAddress}`,
        );
        socket.destroy();
      });

      socket.on('data', (data: string) => {
        buffer += data;

        // Buffer size limit guard to prevent memory DOS
        if (buffer.length > MAX_BUFFER_SIZE) {
          this.logger.error(
            `Buffer size exceeded limit (${MAX_BUFFER_SIZE} bytes). Destroying socket for ${socket.remoteAddress}`,
          );
          socket.destroy();
          return;
        }

        // Process data line by line
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.substring(0, newlineIndex);
          buffer = buffer.substring(newlineIndex + 1);
          this.handleDataLine(line);
        }
      });

      socket.on('error', (err) => {
        this.logger.error(`Socket error: ${err.message}`, err.stack);
      });

      socket.on('end', () => {
        this.logger.log('Client disconnected gracefully');
      });

      socket.on('close', (hadError) => {
        this.logger.log(`Socket closed ${hadError ? 'with error' : 'cleanly'}`);
      });
    });

    this.server.on('error', (err) => {
      this.logger.error(`Server error: ${err.message}`, err.stack);
    });

    this.server.listen(4155, () => {
      this.logger.log('CDR TCP server listening on port 4155');
    });
  }

  onModuleDestroy() {
    if (this.server) {
      this.server.close(() => {
        this.logger.log('CDR TCP server closed');
      });
    }
  }

  /**
   * Safely parse a CSV line respecting quotes around fields containing commas.
   */
  private parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;

    // Handle standard \r\n from Windows/3CX
    const cleanLine = line.replace(/\r$/, '');

    for (let i = 0; i < cleanLine.length; i++) {
      const char = cleanLine[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(currentField);
        currentField = '';
      } else {
        currentField += char;
      }
    }
    fields.push(currentField);
    return fields.map((f) => f.trim());
  }

  private async handleDataLine(rawData: string) {
    if (!rawData.trim()) return;

    try {
      const fields = this.parseCsvLine(rawData);

      // Expected format length is around 9. If significantly smaller, it's malformed.
      if (fields.length < 5) {
        this.logger.warn(
          `Received malformed CDR data (too few fields): ${rawData}`,
        );
        return;
      }

      const dto: CreateCdrDto = {
        callid: fields[0] || '',
        duration: fields[1] || '',
        'time-start': fields[2] || '',
        'time-answered': fields[3] || '',
        'time-end': fields[4] || '',
        'reason-terminated': fields[5] || '',
        'from-no': fields[6] || '',
        'from-dn': fields[7] || '',
        'dial-no': fields[8] || '',
        timestamp: new Date().toISOString(),
      };

      this.logger.log(`Successfully parsed CDR: ${dto.callid}`);
      this.logger.debug(`Parsed CDR Details: ${JSON.stringify(dto)}`);

      // 1. Asynchronous Persistence to MongoDB
      const savedDocument = await this.saveCdr(dto).catch((err) => {
        this.logger.error(
          `Failed to persist CDR [${dto.callid}]: ${err.message}`,
          err.stack,
        );
        return null;
      });

      if (savedDocument) {
        this.eventEmitter.emit('cdr.created', savedDocument);
      }

      // 2. Business Logic Execution
      this.executeBusinessLogic(dto);
    } catch (err: any) {
      this.logger.error(
        `Unexpected error processing CDR line: ${err.message}`,
        err.stack,
      );
    }
  }

  public async saveCdr(dto: CreateCdrDto) {
    if (!dto.timestamp) {
      dto.timestamp = new Date().toISOString();
    }
    return this.cdrModel
      .findOneAndUpdate(
        { callid: dto.callid },
        { $set: dto },
        { upsert: true, new: true },
      )
      .exec();
  }

  private executeBusinessLogic(cdr: any) {
    // Legacy stub: Production missed-call and SMS handling is managed by MissedCallSmsService via the 'cdr.created' event.
    this.logger.debug(`CDR business logic passed to event listeners for call: ${cdr.callid}`);
  }

  private async triggerMissedCallSMS(customerNumber: string, storeDID: string) {
    this.logger.log(
      `[SMS TRIGGER] Missed call detected! From: ${customerNumber}, To: ${storeDID}`,
    );
  }

  /**
   * Retrieves 3CX call logs strictly filtered to DIDs stored in store configs,
   * enriched with storeName, storeId, isMissed, durationSeconds, and callStatus.
   */
  async findStoreCdrLogs(filter: {
    storeId?: string;
    did?: string;
    isMissed?: boolean;
    search?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    skip?: number;
  }): Promise<{
    total: number;
    limit: number;
    skip: number;
    logs: any[];
  }> {
    const limit = Math.min(Math.max(filter.limit || 50, 1), 200);
    const skip = Math.max(filter.skip || 0, 0);

    // 1. Fetch all store configs to build DID-to-Store map
    const stores = await this.storeConfigService.findAll();
    const didToStoreMap = new Map<string, { storeId: string; storeName: string }>();

    for (const store of stores) {
      if (store.did) {
        didToStoreMap.set(store.did.trim(), {
          storeId: (store as any)._id.toString(),
          storeName: store.storeName,
        });
      }
    }

    // 2. Determine target DIDs (strictly only DIDs from store configs)
    let targetDids = Array.from(didToStoreMap.keys());

    if (filter.storeId) {
      const specificStore = stores.find(
        (s) => (s as any)._id.toString() === filter.storeId,
      );
      if (!specificStore || !specificStore.did) {
        return { total: 0, limit, skip, logs: [] };
      }
      targetDids = [specificStore.did.trim()];
    } else if (filter.did) {
      const cleanDid = filter.did.trim();
      if (!didToStoreMap.has(cleanDid)) {
        return { total: 0, limit, skip, logs: [] };
      }
      targetDids = [cleanDid];
    }

    if (targetDids.length === 0) {
      return { total: 0, limit, skip, logs: [] };
    }

    // 3. Build MongoDB query
    const query: Record<string, any> = {
      'dial-no': { $in: targetDids },
    };

    if (filter.search && filter.search.trim()) {
      const cleanSearch = filter.search.trim();
      query['from-no'] = { $regex: cleanSearch, $options: 'i' };
    }

    // Date range
    if (filter.startDate || filter.endDate) {
      query.createdAt = {};
      if (filter.startDate) {
        query.createdAt.$gte = new Date(filter.startDate);
      }
      if (filter.endDate) {
        query.createdAt.$lte = new Date(filter.endDate);
      }
    }

    // Missed call filter at query level when possible
    if (filter.isMissed === true) {
      query['reason-terminated'] = 'src_participant_terminated';
    }

    const [total, docs] = await Promise.all([
      this.cdrModel.countDocuments(query).exec(),
      this.cdrModel
        .find(query)
        .sort({ createdAt: -1, timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
    ]);

    const logs = docs
      .map((doc) => {
        const obj = doc.toObject() as any;
        const did = (obj['dial-no'] || '').trim();
        const storeInfo = didToStoreMap.get(did) || {
          storeId: '',
          storeName: 'Unknown Store',
        };

        const durationStr = obj.duration || '00:00:00';
        const durationSecs = this.parseDurationToSeconds(durationStr);
        const reason = obj['reason-terminated'] || '';
        const isMissed =
          reason === 'src_participant_terminated' && durationSecs < 10;

        return {
          id: obj._id ? obj._id.toString() : obj.callid,
          callId: obj.callid,
          timestamp: obj.timestamp,
          timeStart: obj['time-start'] || null,
          timeAnswered: obj['time-answered'] || null,
          timeEnd: obj['time-end'] || null,
          duration: durationStr,
          durationSeconds: durationSecs,
          reasonTerminated: reason,
          fromNo: obj['from-no'] || '',
          fromDn: obj['from-dn'] || '',
          dialNo: did,
          storeId: storeInfo.storeId,
          storeName: storeInfo.storeName,
          isMissed,
          callStatus: isMissed ? 'missed' : 'answered',
          createdAt: obj.createdAt,
        };
      })
      .filter((item) => {
        if (filter.isMissed === undefined) return true;
        return item.isMissed === filter.isMissed;
      });

    return {
      total: filter.isMissed === undefined ? total : logs.length,
      limit,
      skip,
      logs,
    };
  }

  private parseDurationToSeconds(duration: string): number {
    if (!duration || !duration.trim()) return 0;
    const parts = duration.trim().split(':');
    if (parts.length !== 3) return 0;
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const seconds = parseInt(parts[2], 10) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }
}

