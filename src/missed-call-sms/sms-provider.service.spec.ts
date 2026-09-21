import { SmsProviderService } from './sms-provider.service';
import { MobileMessageWebhookController } from './mobilemessage-webhook.controller';

describe('SmsProviderService', () => {
  it('should fallback to stub logging when credentials are not set', async () => {
    const configServiceMock = {
      get: jest.fn().mockReturnValue(undefined),
    };
    const provider = new SmsProviderService(configServiceMock as any);
    const result = await provider.sendSms('0412345678', 'Test message');
    expect(result).toBe(true);
  });

  it('should call MobileMessage API when credentials are provided', async () => {
    const configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'MOBILEMESSAGE_USERNAME') return 'test_user';
        if (key === 'MOBILEMESSAGE_PASSWORD') return 'test_pass';
        if (key === 'MOBILEMESSAGE_FROM') return '+61420136984';
        return undefined;
      }),
    };

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          status: 'complete',
          results: [{ to: '0412345678', status: 'success', message_id: 'uuid-123', cost: 1 }],
        }),
      ),
    });
    global.fetch = mockFetch;

    const provider = new SmsProviderService(configServiceMock as any);
    const result = await provider.sendSms('0412345678', 'Test message');

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.mobilemessage.com.au/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
          'Content-Type': 'application/json',
        }),
      }),
    );
  });
});

describe('MobileMessageWebhookController', () => {
  let controller: MobileMessageWebhookController;
  let missedCallSmsServiceMock: any;
  let configServiceMock: any;

  beforeEach(() => {
    missedCallSmsServiceMock = {
      handleInboundSms: jest.fn().mockResolvedValue({
        replyText: 'How can we help?',
        bookingIntentDetected: false,
        optOut: false,
      }),
    };
    configServiceMock = {
      get: jest.fn().mockReturnValue(undefined),
    };
    controller = new MobileMessageWebhookController(
      missedCallSmsServiceMock,
      configServiceMock,
    );
  });

  it('should handle standard MobileMessage inbound payload format', async () => {
    const payload = {
      type: 'inbound',
      sender: '+61412345678',
      to: '+61420136984',
      message: 'Can I get my watch battery replaced?',
      received_at: '2026-09-21T07:45:00Z',
    };

    const res = await controller.handleMobileMessageWebhook(payload);
    expect(res.success).toBe(true);
    expect(missedCallSmsServiceMock.handleInboundSms).toHaveBeenCalledWith({
      from: '+61412345678',
      body: 'Can I get my watch battery replaced?',
    });
  });

  it('should handle delivery status report without passing to chatbot', async () => {
    const payload = {
      status: 'delivered',
      message_id: 'test-uuid',
      to: '+61412345678',
    };

    const res = await controller.handleMobileMessageWebhook(payload);
    expect(res.success).toBe(true);
    expect(res.message).toBe('Status receipt acknowledged');
    expect(missedCallSmsServiceMock.handleInboundSms).not.toHaveBeenCalled();
  });
});
