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
});
