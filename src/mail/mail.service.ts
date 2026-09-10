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
    if (!to || (Array.isArray(to) && to.length === 0)) {
      this.logger.warn('No recipient email address provided.');
      return;
    }

    try {
      const from = this.configService.get<string>('SMTP_USER');
      const recipients = Array.isArray(to) ? to.join(', ') : to;

      await this.transporter.sendMail({
        from: `"Mister Minit Notifications" <${from}>`,
        to: recipients,
        subject,
        text,
      });
      this.logger.log(`Email sent successfully to ${recipients}`);
    } catch (error: any) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
    }
  }
}
