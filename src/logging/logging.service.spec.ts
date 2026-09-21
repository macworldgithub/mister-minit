import { LoggingService } from './logging.service';
import { LoggingController } from './logging.controller';
import { LogEventType } from './log.schema';

describe('LoggingService & Controller', () => {
  let service: LoggingService;
  let controller: LoggingController;
  let logModelMock: any;

  beforeEach(() => {
    logModelMock = {
      create: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([
                  { eventType: LogEventType.OPENING_SMS_SENT, callerNumber: '0412345678' },
                ]),
              }),
            }),
          }),
        }),
      }),
      countDocuments: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      }),
      aggregate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: LogEventType.OPENING_SMS_SENT, count: 1 },
        ]),
      }),
    };

    service = new LoggingService(logModelMock);
    controller = new LoggingController(service);
  });

  it('should format and persist log event', async () => {
    await service.log(LogEventType.OPENING_SMS_SENT, {
      callerNumber: '0412345678',
      storeName: 'Westfield Doncaster',
    });

    expect(logModelMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: LogEventType.OPENING_SMS_SENT,
        callerNumber: '0412345678',
        storeName: 'Westfield Doncaster',
      }),
    );
  });

  it('should query logs via controller', async () => {
    const res = await controller.getLogs();
    expect(res.total).toBe(1);
    expect(res.logs.length).toBe(1);
  });

  it('should return stats via controller', async () => {
    const stats = await controller.getStats();
    expect(stats.length).toBe(1);
    expect(stats[0]._id).toBe(LogEventType.OPENING_SMS_SENT);
  });
});
