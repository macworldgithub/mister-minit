import { MissedCallSmsService } from './missed-call-sms.service';

describe('MissedCallSmsService - buildOpeningSms', () => {
  it('should generate a concise opening SMS with website link and opt-out', () => {
    // Instantiate with mock dependencies (buildOpeningSms does not need constructor dependencies)
    const service = new MissedCallSmsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const mockStore: any = {
      storeName: 'Westfield Doncaster',
      tradingHours: 'Mon-Fri 9am-5pm',
      googleMapsLink: 'https://maps.google.com/?cid=123',
      bookingLink: 'https://misterminit.co/pages/car-keys',
    };

    const sms = service.buildOpeningSms(mockStore);

    expect(sms).toContain('Hi, sorry we missed your call to Mister Minit Westfield Doncaster! How can we help you today?');
    expect(sms).toContain('Website: https://misterminit.co');
    expect(sms).toContain('Reply STOP to opt out.');
    // Ensure heavy info is not in the opening message
    expect(sms).not.toContain('Our hours:');
    expect(sms).not.toContain('Find us here:');
    expect(sms).not.toContain('Booking Link:');
  });

  describe('CDR Qualification - Australian Mobile & Extension filtering', () => {
    let service: MissedCallSmsService;
    let mockStoreConfigService: any;
    let mockSmsThreadsService: any;
    let mockOptOutService: any;
    let mockSuppressedEventsService: any;
    let mockLoggingService: any;
    let mockSmsProviderService: any;
    let mockConfigService: any;

    beforeEach(() => {
      mockStoreConfigService = {
        getStoreByDid: jest.fn().mockResolvedValue({
          _id: 'store123',
          storeName: 'Marion',
          isActive: true,
          tradingHours: '9-5',
          googleMapsLink: 'https://maps.google.com',
        }),
      };
      mockSmsThreadsService = {
        findActiveThread: jest.fn().mockResolvedValue(null),
        createThread: jest.fn().mockResolvedValue({ _id: 'thread123' }),
        setOpeningSent: jest.fn().mockResolvedValue(true),
        appendToHistory: jest.fn().mockResolvedValue(true),
        incrementMessageCount: jest.fn().mockResolvedValue(true),
      };
      mockOptOutService = {
        isOptedOut: jest.fn().mockResolvedValue(false),
      };
      mockSuppressedEventsService = {
        suppress: jest.fn().mockResolvedValue(true),
      };
      mockLoggingService = {
        log: jest.fn().mockResolvedValue(true),
      };
      mockSmsProviderService = {
        sendSms: jest.fn().mockResolvedValue(true),
      };
      mockConfigService = {
        get: jest.fn().mockReturnValue('true'),
      };

      service = new MissedCallSmsService(
        mockStoreConfigService,
        mockSmsThreadsService,
        mockOptOutService,
        mockSuppressedEventsService,
        mockLoggingService,
        {} as any,
        mockSmsProviderService,
        {} as any,
        {} as any,
        mockConfigService,
      );
    });

    it('should qualify and trigger SMS for standard Australian mobile 0435594154', async () => {
      await service.handleCdrCreated({
        callid: 'call-01',
        timestamp: new Date().toISOString(),
        duration: '00:00:05',
        'time-start': '2026/09/05 03:37:00',
        'time-answered': '2026/09/05 03:37:00',
        'time-end': '2026/09/05 03:37:06',
        'reason-terminated': 'src_participant_terminated',
        'from-no': '0435594154',
        'from-dn': '10008', // 3CX trunk ID should be ignored
        'dial-no': '09821200012620',
      });

      expect(mockSmsProviderService.sendSms).toHaveBeenCalledWith(
        '0435594154',
        expect.stringContaining('Mister Minit Marion'),
      );
      expect(mockSuppressedEventsService.suppress).not.toHaveBeenCalled();
    });

    it('should qualify and trigger SMS for 61435594154 (without leading plus)', async () => {
      await service.handleCdrCreated({
        callid: 'call-02',
        timestamp: new Date().toISOString(),
        duration: '00:00:05',
        'time-start': '2026/09/05 03:37:00',
        'time-answered': '2026/09/05 03:37:00',
        'time-end': '2026/09/05 03:37:06',
        'reason-terminated': 'src_participant_terminated',
        'from-no': '61435594154',
        'from-dn': '10008',
        'dial-no': '09821200012620',
      });

      expect(mockSmsProviderService.sendSms).toHaveBeenCalledWith(
        '61435594154',
        expect.stringContaining('Mister Minit Marion'),
      );
    });

    it('should qualify and trigger SMS for +61435594154 (with leading plus)', async () => {
      await service.handleCdrCreated({
        callid: 'call-03',
        timestamp: new Date().toISOString(),
        duration: '00:00:05',
        'time-start': '2026/09/05 03:37:00',
        'time-answered': '2026/09/05 03:37:00',
        'time-end': '2026/09/05 03:37:06',
        'reason-terminated': 'src_participant_terminated',
        'from-no': '+61435594154',
        'from-dn': '10008',
        'dial-no': '09821200012620',
      });

      expect(mockSmsProviderService.sendSms).toHaveBeenCalledWith(
        '+61435594154',
        expect.stringContaining('Mister Minit Marion'),
      );
    });

    it('should suppress internal extension caller (Ext.1001) as internal_extension', async () => {
      await service.handleCdrCreated({
        callid: 'call-ext-01',
        timestamp: new Date().toISOString(),
        duration: '00:00:05',
        'time-start': '2026/09/05 03:37:00',
        'time-answered': '2026/09/05 03:37:00',
        'time-end': '2026/09/05 03:37:06',
        'reason-terminated': 'src_participant_terminated',
        'from-no': 'Ext.1001',
        'from-dn': '1001',
        'dial-no': '09821200012620',
      });

      expect(mockSmsProviderService.sendSms).not.toHaveBeenCalled();
      expect(mockSuppressedEventsService.suppress).toHaveBeenCalledWith(
        expect.objectContaining({
          suppressedReason: 'internal_extension',
          callerNumber: 'Ext.1001',
        }),
      );
    });

    it('should suppress landline (0272486824) as not_mobile', async () => {
      await service.handleCdrCreated({
        callid: 'call-landline',
        timestamp: new Date().toISOString(),
        duration: '00:00:05',
        'time-start': '2026/09/05 03:37:00',
        'time-answered': '2026/09/05 03:37:00',
        'time-end': '2026/09/05 03:37:06',
        'reason-terminated': 'src_participant_terminated',
        'from-no': '0272486824',
        'from-dn': '10001',
        'dial-no': '09821200012620',
      });

      expect(mockSmsProviderService.sendSms).not.toHaveBeenCalled();
      expect(mockSuppressedEventsService.suppress).toHaveBeenCalledWith(
        expect.objectContaining({
          suppressedReason: 'not_mobile',
          callerNumber: '0272486824',
        }),
      );
    });
  });

  describe('Store Name Replacement & Message Templates', () => {
    let service: MissedCallSmsService;

    beforeEach(() => {
      service = new MissedCallSmsService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
    });

    it('should correctly format store name when raw name is Marion', () => {
      const mockStore: any = {
        storeName: 'Marion',
        did: '0872286100',
      };

      const opening = service.buildOpeningSms(mockStore);
      expect(opening).toContain('Mister Minit Marion');

      const followUp = service.buildFollowUpSms(mockStore);
      expect(followUp).toContain(
        "Hi, just checking in from Mister Minit Marion! Did you still need help? I'm our smart virtual assistant and can answer anything about our services or pricing.",
      );
      expect(followUp).toContain(
        'Would you like one of our store team members to call you back instead? Reply YES',
      );
      expect(followUp).toContain('Reply STOP to opt out.');

      const callbackConf = service.buildCallbackConfirmation(mockStore);
      expect(callbackConf).toBe(
        "Thanks! I've notified the team at Mister Minit Marion — you'll receive a call back soon. In the meantime, feel free to message me if you have any questions.",
      );

      const staffNotice = service.buildCallbackStaffNotification(
        mockStore,
        '0412345678',
      );
      expect(staffNotice).toContain('Callback request — Mister Minit Marion');
      expect(staffNotice).toContain('Customer mobile: 0412345678');
    });

    it('should avoid duplicate prefix if storeName already contains Mister Minit', () => {
      const mockStore: any = {
        storeName: 'Mister Minit Westfield Doncaster',
        did: '0370360236',
      };

      const followUp = service.buildFollowUpSms(mockStore);
      expect(followUp).toContain(
        'Hi, just checking in from Mister Minit Westfield Doncaster!',
      );
      expect(followUp).not.toContain('Mister Minit Mister Minit');

      const callbackConf = service.buildCallbackConfirmation(mockStore);
      expect(callbackConf).toContain(
        "Thanks! I've notified the team at Mister Minit Westfield Doncaster — you'll receive a call back soon.",
      );
      expect(callbackConf).not.toContain('Mister Minit Mister Minit');
    });

    it('should handle null store gracefully with fallback Mister Minit', () => {
      const followUp = service.buildFollowUpSms(null);
      expect(followUp).toContain(
        "Hi, just checking in from Mister Minit! Did you still need help?",
      );

      const callbackConf = service.buildCallbackConfirmation(null);
      expect(callbackConf).toBe(
        "Thanks! I've notified the team at Mister Minit — you'll receive a call back soon. In the meantime, feel free to message me if you have any questions.",
      );
    });
  });

  describe('Affirmative & YES Detection', () => {
    let service: MissedCallSmsService;

    beforeEach(() => {
      service = new MissedCallSmsService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
    });

    it('should detect plain affirmatives', () => {
      const positives = [
        'YES',
        'yes',
        'Yes please',
        'yeah',
        'Yep',
        'sure',
        'ok',
        'okay',
        'please do',
        'sounds good',
        'definitely',
        'absolutely',
        'call me please',
        '👍',
      ];

      for (const phrase of positives) {
        expect(service.isAffirmativeReply(phrase)).toBe(true);
      }
    });

    it('should not treat questions or negative replies as plain affirmative', () => {
      const nonPositives = [
        'How much is a car key?',
        'What time do you close?',
        'No thanks',
        'Not needed',
        'Who is this?',
      ];

      for (const phrase of nonPositives) {
        expect(service.isAffirmativeReply(phrase)).toBe(false);
      }
    });

    it('should detect when callback offer is pending in history', () => {
      const historyWithOffer = [
        {
          role: 'assistant',
          content:
            'Hi, just checking in! Would you like one of our store team members to call you back instead? Reply YES',
        },
      ];
      expect(service.isCallbackOfferPending(historyWithOffer)).toBe(true);

      const historyWithoutOffer = [
        {
          role: 'assistant',
          content: 'We are open 9am to 5pm Monday to Friday.',
        },
      ];
      expect(service.isCallbackOfferPending(historyWithoutOffer)).toBe(false);
    });
  });

  describe('extractStoreEmails', () => {
    let service: MissedCallSmsService;
    let mockConfigService: any;

    beforeEach(() => {
      mockConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'DEFAULT_NOTIFICATION_EMAIL') return 'default@neximet.com';
          if (key === 'SMTP_USER') return 'smtp@neximet.com';
          return null;
        }),
      };

      service = new MissedCallSmsService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockConfigService,
      );
    });

    it('should extract all emails attached to store staffContacts', () => {
      const mockStore: any = {
        storeName: 'Marion',
        staffContacts: [
          { name: 'Syed', email: 'syeddyaseenn@gmail.com', mobile: '0412345678' },
          { name: 'Lee', email: 'lee@bele.ai', mobile: '0400000000' },
          { name: 'James', email: 'james@smarttalk.com.au', mobile: '0411111111' },
        ],
      };

      const emails = service.extractStoreEmails(mockStore);
      expect(emails).toEqual([
        'syeddyaseenn@gmail.com',
        'lee@bele.ai',
        'james@smarttalk.com.au',
      ]);
    });

    it('should deduplicate and clean comma-separated or mixed-case emails', () => {
      const mockStore: any = {
        storeName: 'Enex Perth',
        staffContacts: [
          { name: 'Syed', email: ' SyEdDyAseenn@gmail.com ' },
          { name: 'Lee', email: 'lee@bele.ai, syeddyaseenn@gmail.com' },
        ],
      };

      const emails = service.extractStoreEmails(mockStore);
      expect(emails).toEqual(['syeddyaseenn@gmail.com', 'lee@bele.ai']);
    });

    it('should include store-level email fields if present', () => {
      const mockStore: any = {
        storeName: 'Traralgon',
        email: 'store@misterminit.com.au',
        staffContacts: [
          { name: 'Lee', email: 'lee@bele.ai' },
        ],
      };

      const emails = service.extractStoreEmails(mockStore);
      expect(emails).toEqual(['lee@bele.ai', 'store@misterminit.com.au']);
    });

    it('should fallback to default notification email if store has no emails', () => {
      const mockStore: any = {
        storeName: 'Empty Store',
        staffContacts: [],
      };

      const emails = service.extractStoreEmails(mockStore);
      expect(emails).toEqual(['default@neximet.com']);
    });
  });
});
