import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as net from 'net';
import * as fs from 'fs/promises';
import * as path from 'path';

const MAX_BUFFER_SIZE = 10 * 1024; // 10KB
const SOCKET_TIMEOUT = 60 * 1000; // 60 seconds
const CDR_LOG_FILE = path.join(process.cwd(), 'cdr-logs.json');

@Injectable()
export class CdrService implements OnModuleInit, OnModuleDestroy {
  private server: net.Server;
  private readonly logger = new Logger(CdrService.name);

  onModuleInit() {
    this.server = net.createServer((socket) => {
      this.logger.log(`Client connected from ${socket.remoteAddress}:${socket.remotePort}`);

      let buffer = '';

      // Set encoding to handle multi-byte characters safely
      socket.setEncoding('utf8');

      // Set idle timeout
      socket.setTimeout(SOCKET_TIMEOUT);

      socket.on('timeout', () => {
        this.logger.warn(`Socket timeout after ${SOCKET_TIMEOUT}ms. Destroying socket for ${socket.remoteAddress}`);
        socket.destroy();
      });

      socket.on('data', (data: string) => {
        buffer += data;

        // Buffer size limit guard to prevent memory DOS
        if (buffer.length > MAX_BUFFER_SIZE) {
          this.logger.error(`Buffer size exceeded limit (${MAX_BUFFER_SIZE} bytes). Destroying socket for ${socket.remoteAddress}`);
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

    this.server.listen(4005, () => {
      this.logger.log('CDR TCP server listening on port 4005');
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
        this.logger.warn(`Received malformed CDR data (too few fields): ${rawData}`);
        return;
      }

      const cdr = {
        'callid': fields[0] || '',
        'duration': fields[1] || '',
        'time-start': fields[2] || '',
        'time-answered': fields[3] || '',
        'time-end': fields[4] || '',
        'reason-terminated': fields[5] || '',
        'from-no': fields[6] || '',
        'from-dn': fields[7] || '',
        'dial-no': fields[8] || '',
      };

      this.logger.log(`Successfully parsed CDR: ${cdr.callid}`);
      this.logger.debug(`Parsed CDR Details: ${JSON.stringify(cdr)}`);

      // 1. Asynchronous Persistence
      // This is non-blocking to the TCP socket listener
      await this.persistCdr(cdr).catch((err) => {
        this.logger.error(`Failed to persist CDR [${cdr.callid}]: ${err.message}`, err.stack);
      });

      // 2. Business Logic Execution
      this.executeBusinessLogic(cdr);

    } catch (err: any) {
      this.logger.error(`Unexpected error processing CDR line: ${err.message}`, err.stack);
    }
  }

  private async persistCdr(cdr: any) {
    const logEntry = JSON.stringify({ timestamp: new Date().toISOString(), ...cdr }) + '\n';
    await fs.appendFile(CDR_LOG_FILE, logEntry, 'utf8');
  }

  private executeBusinessLogic(cdr: any) {
    // Internal call filter: Ignore if 'from-dn' contains a value
    if (cdr['from-dn'] !== '') {
      this.logger.debug(`Ignored internal call from DN: ${cdr['from-dn']}`);
      return;
    }

    // Missed-call detection logic: A call is considered missed if the 'time-answered' field is completely empty.
    if (cdr['time-answered'] === '') {
      this.triggerMissedCallSMS(cdr['from-no'], cdr['dial-no']).catch((err) => {
        this.logger.error(`Error triggering SMS: ${err.message}`, err.stack);
      });
    }
  }

  private async triggerMissedCallSMS(customerNumber: string, storeDID: string) {
    this.logger.log(`[SMS TRIGGER] Missed call detected! From: ${customerNumber}, To: ${storeDID}`);

    // Placeholder logic for triggering SMS
    // Example: await this.smsService.sendMissedCallSMS(customerNumber, storeDID);
  }
}
