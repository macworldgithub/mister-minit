import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as net from 'net';

@Injectable()
export class CdrService implements OnModuleInit, OnModuleDestroy {
  private server: net.Server;
  private readonly logger = new Logger(CdrService.name);

  onModuleInit() {
    this.server = net.createServer((socket) => {
      this.logger.log(`Client connected from ${socket.remoteAddress}:${socket.remotePort}`);

      let buffer = '';

      socket.on('data', (data) => {
        buffer += data.toString();

        // Process data line by line if multiple records arrive
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.substring(0, newlineIndex);
          buffer = buffer.substring(newlineIndex + 1);
          this.handleData(line);
        }
      });

      socket.on('error', (err) => {
        this.logger.error(`Socket error: ${err.message}`, err.stack);
      });

      socket.on('end', () => {
        this.logger.log('Client disconnected');
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

  private handleData(rawData: string) {
    if (!rawData.trim()) return;

    // Expected format: callid, duration, time-start, time-answered, time-end, reason-terminated, from-no, from-dn, dial-no
    const fields = rawData.split(',');

    if (fields.length < 9) {
      this.logger.warn(`Received malformed CDR data: ${rawData}`);
      return;
    }

    const cdr = {
      'callid': fields[0].trim(),
      'duration': fields[1].trim(),
      'time-start': fields[2].trim(),
      'time-answered': fields[3].trim(),
      'time-end': fields[4].trim(),
      'reason-terminated': fields[5].trim(),
      'from-no': fields[6].trim(),
      'from-dn': fields[7].trim(),
      'dial-no': fields[8].trim(),
    };

    this.logger.debug(`Parsed CDR: ${JSON.stringify(cdr)}`);

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
