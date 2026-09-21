import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';

describe('StatsService & StatsController', () => {
  let service: StatsService;
  let controller: StatsController;

  let smsThreadModelMock: any;
  let cdrModelMock: any;
  let suppressedEventModelMock: any;
  let optOutModelMock: any;
  let storeConfigModelMock: any;

  beforeEach(() => {
    smsThreadModelMock = {
      aggregate: jest.fn().mockImplementation((pipeline) => {
        // Check if service breakdown
        const isService = pipeline.some((p: any) => p.$group && p.$group._id === '$bookingDetails.serviceType');
        if (isService) {
          return Promise.resolve([{ _id: 'car_keys', count: 5 }]);
        }
        const isStatus = pipeline.some((p: any) => p.$group && p.$group._id === '$status');
        if (isStatus) {
          return Promise.resolve([{ _id: 'active', count: 10 }]);
        }
        return Promise.resolve([
          {
            totalThreads: 20,
            recoveredInquiries: 18,
            customerReplies: 12,
            bookingsCaptured: 6,
            footTrafficConversions: 4,
            totalOptedOut: 1,
          },
        ]);
      }),
    };

    cdrModelMock = {
      aggregate: jest.fn().mockResolvedValue([
        {
          total: 50,
          missed: 20,
        },
      ]),
    };

    suppressedEventModelMock = {
      aggregate: jest.fn().mockResolvedValue([
        { _id: 'dedup', count: 3 },
        { _id: 'not_missed_call', count: 15 },
        { _id: 'not_mobile', count: 2 },
      ]),
    };

    optOutModelMock = {
      aggregate: jest.fn().mockResolvedValue([
        { _id: 'keyword', count: 1 },
      ]),
    };

    storeConfigModelMock = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: '6a9ea2774d7dcfbae9cc58b6',
          storeName: 'Marion',
          did: '0872286100',
        }),
      }),
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: '6a9ea2774d7dcfbae9cc58b6',
          storeName: 'Marion',
          did: '0872286100',
        }),
      }),
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            { _id: '6a9ea2774d7dcfbae9cc58b6', storeName: 'Marion', did: '0872286100', isActive: true },
          ]),
        }),
      }),
    };

    service = new StatsService(
      smsThreadModelMock,
      cdrModelMock,
      suppressedEventModelMock,
      optOutModelMock,
      storeConfigModelMock,
    );
    controller = new StatsController(service);
  });

  it('should return aggregated stats across all stores when no filter provided', async () => {
    const stats = await controller.getStats();

    expect(stats.scope.isSingleStore).toBe(false);
    expect(stats.telephony.totalInboundCallVolume).toBe(50);
    expect(stats.telephony.missedCalls).toBe(20);
    expect(stats.telephony.storeMissedCallRate).toBe(40); // (20/50)*100

    expect(stats.conversions.recoveredInquiries).toBe(18);
    expect(stats.conversions.customerReplies).toBe(12);
    expect(stats.conversions.customerEngagementRate).toBe(60); // (12/20)*100
    expect(stats.conversions.bookingsCaptured).toBe(6);
    expect(stats.conversions.bookingConversionRate).toBe(30); // (6/20)*100
    expect(stats.conversions.footTrafficConversions).toBe(4);

    expect(stats.aiSafetyQualityControl.deduplicationPrevented).toBe(3);
    expect(stats.aiSafetyQualityControl.answeredCallsFiltered).toBe(15);
    expect(stats.complianceAndRetention.totalOptOuts).toBe(1);
  });

  it('should filter stats by storeId when provided', async () => {
    const stats = await controller.getStats('6a9ea2774d7dcfbae9cc58b6');

    expect(stats.scope.isSingleStore).toBe(true);
    expect((stats.scope as any).storeName).toBe('Marion');
    expect(storeConfigModelMock.findById).toHaveBeenCalledWith('6a9ea2774d7dcfbae9cc58b6');
  });

  it('should return store comparison table', async () => {
    const comparison = await controller.getStoreComparison();

    expect(Array.isArray(comparison)).toBe(true);
    expect(comparison.length).toBe(1);
    expect(comparison[0].storeName).toBe('Marion');
    expect(comparison[0].conversions.bookingConversionRate).toBe(30);
  });

  it('should return store dropdown list', async () => {
    const stores = await controller.getStoreList();

    expect(Array.isArray(stores)).toBe(true);
    expect(stores.length).toBe(1);
    expect(stores[0].did).toBe('0872286100');
  });
});
