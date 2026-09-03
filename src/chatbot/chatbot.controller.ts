import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';

interface SmsPayload {
  from: string;
  text: string;
}

interface InitiatePayload {
  from: string;
  storeDID: string;
}

@Controller('sms')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  async initiateCall(@Body() payload: InitiatePayload) {
    if (!payload.from || !payload.storeDID) {
      return { status: 'ignored', reason: 'Invalid payload' };
    }
    const greeting = await this.chatbotService.initiateChat(payload.from, payload.storeDID);
    return { status: 'initiated', greeting };
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload: SmsPayload) {
    if (!payload.from || !payload.text) {
      return { status: 'ignored', reason: 'Invalid payload' };
    }

    const reply = await this.chatbotService.handleIncomingMessage(payload.from, payload.text);
    return { status: 'received', reply };
  }
}
