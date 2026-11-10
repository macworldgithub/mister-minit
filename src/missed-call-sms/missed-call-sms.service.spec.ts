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
        'Would you like one of our store team members to call you back? Reply Y or N',
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

  describe('45m Inactivity Auto-Close after Customer Reply', () => {
    it('should close both ghosted follow-up threads (closed_no_response) and 45m inactive replied threads (closed_answered)', async () => {
      const mockSmsThreadsService = {
        findThreadsForFollowUp: jest.fn().mockResolvedValue([]),
        findThreadsToClose: jest.fn().mockResolvedValue([
          {
            _id: 'ghosted-thread-1',
            callerNumber: '61400000001',
            storeId: 'store-1',
            customerReplied: false,
          },
        ]),
        findInactiveRepliedThreadsToClose: jest.fn().mockResolvedValue([
          {
            _id: 'replied-thread-2',
            callerNumber: '61407026749',
            storeId: 'store-2',
            customerReplied: true,
            callbackRequested: true,
          },
          {
            _id: 'replied-thread-3',
            callerNumber: '0448652915',
            storeId: 'store-3',
            customerReplied: true,
            callbackRequested: false,
          },
        ]),
        closeThread: jest.fn().mockResolvedValue(undefined),
      };

      const mockLoggingService = {
        log: jest.fn().mockResolvedValue(undefined),
      };

      const service = new MissedCallSmsService(
        {} as any,
        mockSmsThreadsService as any,
        {} as any,
        {} as any,
        mockLoggingService as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await service.runFollowUpScheduler();

      expect(mockSmsThreadsService.closeThread).toHaveBeenCalledWith(
        'ghosted-thread-1',
        'closed_no_response',
      );
      expect(mockSmsThreadsService.closeThread).toHaveBeenCalledWith(
        'replied-thread-2',
        'closed_callback',
      );
      expect(mockSmsThreadsService.closeThread).toHaveBeenCalledWith(
        'replied-thread-3',
        'closed_completed',
      );
    });
  });

  describe('Duplicate Callback Email Suppression', () => {
    let service: MissedCallSmsService;
    let mockStoreConfigService: any;
    let mockSmsThreadsService: any;
    let mockOptOutService: any;
    let mockSuppressedEventsService: any;
    let mockLoggingService: any;
    let mockChatbotService: any;
    let mockSmsProviderService: any;
    let mockMailService: any;
    let mockConfigService: any;

    const mockStore: any = {
      _id: 'store-tok-h',
      storeName: 'TOK H',
      staffContacts: [
        { name: 'Manager', email: 'manager@tokh.com', mobile: '0499999999' },
      ],
    };

    beforeEach(() => {
      mockStoreConfigService = {
        getStoreById: jest.fn().mockResolvedValue(mockStore),
        getStoreByDid: jest.fn().mockResolvedValue(mockStore),
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
        sendSms: jest.fn().mockResolvedValue({ success: true }),
      };
      mockMailService = {
        sendEmail: jest.fn().mockResolvedValue(true),
      };
      mockConfigService = {
        get: jest.fn().mockReturnValue('true'),
      };
    });

    it('should send email and staff SMS on the first affirmative callback request', async () => {
      const activeThread: any = {
        _id: 'thread-1',
        callerNumber: '0412938090',
        storeId: 'store-tok-h',
        status: 'open',
        callbackRequested: false,
        conversationHistory: [
          {
            role: 'assistant',
            content:
              'Would you like one of our store team members to call you back? Reply Y or N',
          },
        ],
        messageCount: 1,
      };

      mockSmsThreadsService = {
        findActiveThread: jest.fn().mockResolvedValue(activeThread),
        findMostRecentByCallerNumber: jest.fn().mockResolvedValue(activeThread),
        findThreadById: jest.fn().mockResolvedValue(activeThread),
        appendToHistory: jest.fn().mockResolvedValue(true),
        setCustomerReplied: jest.fn().mockResolvedValue(true),
        setCallbackRequested: jest.fn().mockResolvedValue(true),
        incrementMessageCount: jest.fn().mockResolvedValue(true),
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
        mockMailService,
        mockConfigService,
      );

      const res = await service.handleInboundSms({
        from: '0412938090',
        body: 'Yes please',
      });

      expect(mockMailService.sendEmail).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendEmail).toHaveBeenCalledWith(
        ['manager@tokh.com'],
        expect.stringContaining(
          'Callback Request — Mister Minit TOK H (0412938090)',
        ),
        expect.any(String),
      );
      expect(mockSmsProviderService.sendSms).not.toHaveBeenCalledWith(
        '0499999999',
        expect.anything(),
      );
      expect(res.humanCallbackRequested).toBe(true);
    });

    it('should suppress duplicate callback email and staff SMS when caller replies "Yes please" again on the same thread', async () => {
      const activeThreadAlreadyNotified: any = {
        _id: 'thread-1',
        callerNumber: '0412938090',
        storeId: 'store-tok-h',
        status: 'open',
        callbackRequested: true,
        conversationHistory: [
          {
            role: 'assistant',
            content:
              'Would you like one of our store team members to call you back? Reply Y or N',
          },
          {
            role: 'user',
            content: 'Yes please',
          },
          {
            role: 'assistant',
            content:
              "Thanks! I've notified the team at Mister Minit TOK H — you'll receive a call back soon.",
          },
        ],
        messageCount: 3,
      };

      mockSmsThreadsService = {
        findActiveThread: jest.fn().mockResolvedValue(activeThreadAlreadyNotified),
        findMostRecentByCallerNumber: jest.fn().mockResolvedValue(activeThreadAlreadyNotified),
        findThreadById: jest.fn().mockResolvedValue(activeThreadAlreadyNotified),
        appendToHistory: jest.fn().mockResolvedValue(true),
        setCustomerReplied: jest.fn().mockResolvedValue(true),
        setCallbackRequested: jest.fn().mockResolvedValue(true),
        saveBooking: jest.fn().mockResolvedValue(true),
        incrementMessageCount: jest.fn().mockResolvedValue(true),
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
        mockMailService,
        mockConfigService,
      );

      const res = await service.handleInboundSms({
        from: '0412938090',
        body: 'Yes please',
      });

      // Mail and staff SMS must NOT be sent again
      expect(mockMailService.sendEmail).not.toHaveBeenCalled();
      expect(mockSmsProviderService.sendSms).not.toHaveBeenCalledWith(
        '0499999999',
        expect.anything(),
      );
      // Customer gets reassurance instead
      expect(res.replyText).toContain('already notified the team at Mister Minit TOK H');
      expect(res.humanCallbackRequested).toBe(false);
    });

    it('should still send booking notification email if a booking is completed after an initial callback', async () => {
      const activeThreadAlreadyNotified: any = {
        _id: 'thread-1',
        callerNumber: '0412938090',
        storeId: 'store-tok-h',
        status: 'open',
        callbackRequested: true,
        conversationHistory: [
          {
            role: 'assistant',
            content:
              "Thanks! I've notified the team at Mister Minit TOK H — you'll receive a call back soon.",
          },
        ],
        messageCount: 3,
      };

      mockSmsThreadsService = {
        findActiveThread: jest.fn().mockResolvedValue(activeThreadAlreadyNotified),
        findMostRecentByCallerNumber: jest.fn().mockResolvedValue(activeThreadAlreadyNotified),
        findThreadById: jest.fn().mockResolvedValue(activeThreadAlreadyNotified),
        appendToHistory: jest.fn().mockResolvedValue(true),
        setCustomerReplied: jest.fn().mockResolvedValue(true),
        setCallbackRequested: jest.fn().mockResolvedValue(true),
        saveBooking: jest.fn().mockResolvedValue(true),
        incrementMessageCount: jest.fn().mockResolvedValue(true),
      };

      mockChatbotService = {
        handleMessage: jest.fn().mockResolvedValue({
          replyText:
            'Great, I have booked you in for shoe repair tomorrow at 10am!',
          bookingIntentDetected: true,
          bookingDetails: {
            customerName: 'Alex',
            serviceType: 'shoe repair',
            preferredTime: 'tomorrow at 10am',
          },
          humanCallbackRequested: false,
          optOut: false,
        }),
      };

      service = new MissedCallSmsService(
        mockStoreConfigService,
        mockSmsThreadsService,
        mockOptOutService,
        mockSuppressedEventsService,
        mockLoggingService,
        mockChatbotService,
        mockSmsProviderService,
        {} as any,
        mockMailService,
        mockConfigService,
      );

      await service.handleInboundSms({
        from: '0412938090',
        body: 'Actually can I just book a shoe repair tomorrow at 10am, name Alex',
      });

      // Booking email SHOULD be dispatched
      expect(mockMailService.sendEmail).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendEmail).toHaveBeenCalledWith(
        ['manager@tokh.com'],
        expect.stringContaining('New Booking Request — Mister Minit TOK H'),
        expect.stringContaining('shoe repair'),
      );
    });

    it('should send short final note and close thread when caller replies "Yes please" a 3rd time (after reassurance)', async () => {
      const threadWithReassurance: any = {
        _id: 'thread-1',
        callerNumber: '0412938090',
        storeId: 'store-tok-h',
        status: 'open',
        callbackRequested: true,
        conversationHistory: [
          {
            role: 'assistant',
            content:
              'Would you like one of our store team members to call you back? Reply Y or N',
          },
          {
            role: 'user',
            content: 'Yes please',
          },
          {
            role: 'assistant',
            content:
              "Thanks! I've notified the team at Mister Minit TOK H — you'll receive a call back soon.",
          },
          {
            role: 'user',
            content: 'Yes please',
          },
          {
            role: 'assistant',
            content:
              "We've already notified the team at Mister Minit TOK H about your callback request, and someone will be in touch shortly! In the meantime, feel free to message if you'd like to book a specific service or have any questions.",
          },
        ],
        messageCount: 5,
      };

      mockSmsThreadsService = {
        findActiveThread: jest.fn().mockResolvedValue(threadWithReassurance),
        findMostRecentByCallerNumber: jest
          .fn()
          .mockResolvedValue(threadWithReassurance),
        findThreadById: jest.fn().mockResolvedValue(threadWithReassurance),
        appendToHistory: jest.fn().mockResolvedValue(true),
        setCustomerReplied: jest.fn().mockResolvedValue(true),
        setCallbackRequested: jest.fn().mockResolvedValue(true),
        closeThread: jest.fn().mockResolvedValue(true),
        incrementMessageCount: jest.fn().mockResolvedValue(true),
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
        mockMailService,
        mockConfigService,
      );

      const res = await service.handleInboundSms({
        from: '0412938090',
        body: 'Yes please',
      });

      // No email & no staff SMS
      expect(mockMailService.sendEmail).not.toHaveBeenCalled();
      expect(mockSmsProviderService.sendSms).not.toHaveBeenCalledWith(
        '0499999999',
        expect.anything(),
      );
      // Final acknowledgment sent to customer
      expect(res.replyText).toContain('Understood! No further action needed');
      expect(res.replyText).toContain('team has your request and will call you soon');
      // Thread closed immediately
      expect(mockSmsThreadsService.closeThread).toHaveBeenCalledWith(
        'thread-1',
        'closed_callback',
      );
    });

    it('should stay silent (send no SMS) if caller replies "Yes" after final note has already been sent', async () => {
      const threadWithFinalAck: any = {
        _id: 'thread-1',
        callerNumber: '0412938090',
        storeId: 'store-tok-h',
        status: 'closed_callback',
        callbackRequested: true,
        conversationHistory: [
          {
            role: 'assistant',
            content:
              'Understood! No further action needed — the team has your request and will call you soon.',
          },
        ],
        messageCount: 6,
      };

      mockSmsThreadsService = {
        findActiveThread: jest.fn().mockResolvedValue(null),
        // Since thread is closed, findMostRecentByCallerNumber returns null
        findMostRecentByCallerNumber: jest.fn().mockResolvedValue(null),
        findThreadById: jest.fn().mockResolvedValue(threadWithFinalAck),
        appendToHistory: jest.fn().mockResolvedValue(true),
        setCustomerReplied: jest.fn().mockResolvedValue(true),
        setCallbackRequested: jest.fn().mockResolvedValue(true),
        closeThread: jest.fn().mockResolvedValue(true),
        incrementMessageCount: jest.fn().mockResolvedValue(true),
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
        mockMailService,
        mockConfigService,
      );

      const res = await service.handleInboundSms({
        from: '0412938090',
        body: 'Yes please',
      });

      // Completely discarded without sending any SMS
      expect(res.discarded).toBe(true);
      expect(mockSmsProviderService.sendSms).not.toHaveBeenCalled();
      expect(mockMailService.sendEmail).not.toHaveBeenCalled();
    });
  });
});
