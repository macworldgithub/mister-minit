import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    const isSecure =
      String(this.configService.get<string>('SMTP_SECURE')).toLowerCase() ===
      'true';
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: Number(this.configService.get<string>('SMTP_PORT')),
      secure: isSecure,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendEmail(to: string | string[], subject: string, text: string) {
    const rawList = Array.isArray(to) ? to : [to];
    const recipients = Array.from(
      new Set(
        rawList
          .flatMap((r) => (r ? String(r).split(/[,;\s]+/) : []))
          .map((r) => r.trim().toLowerCase())
          .filter((r) => r && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)),
      ),
    );

    if (recipients.length === 0) {
      this.logger.warn('No valid recipient email address provided.');
      return;
    }

    const from = this.configService.get<string>('SMTP_USER');

    try {
      await this.transporter.sendMail({
        from: `"Mister Minit Notifications" <${from}>`,
        to: recipients,
        subject,
        text,
      });
      this.logger.log(`Email sent successfully to: ${recipients.join(', ')}`);
    } catch (error: any) {
      this.logger.warn(
        `Batch email send failed (${error.message}). Retrying each recipient individually...`,
      );
      for (const recipient of recipients) {
        try {
          await this.transporter.sendMail({
            from: `"Mister Minit Notifications" <${from}>`,
            to: recipient,
            subject,
            text,
          });
          this.logger.log(`Email sent successfully to ${recipient}`);
        } catch (indivErr: any) {
          this.logger.error(
            `Failed to send email to ${recipient}: ${indivErr.message}`,
          );
        }
      }
    }
  }
}
