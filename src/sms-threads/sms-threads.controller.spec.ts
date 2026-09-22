import { Test, TestingModule } from '@nestjs/testing';
import { SmsThreadsController } from './sms-threads.controller';
import { SmsThreadsService } from './sms-threads.service';

describe('SmsThreadsController', () => {
  let controller: SmsThreadsController;
  let service: SmsThreadsService;

  const mockThreadsService = {
    findLiveThreads: jest.fn(),
    findAllThreads: jest.fn(),
    findThreadById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SmsThreadsController],
      providers: [
        {
          provide: SmsThreadsService,
          useValue: mockThreadsService,
        },
      ],
    }).compile();

    controller = module.get<SmsThreadsController>(SmsThreadsController);
    service = module.get<SmsThreadsService>(SmsThreadsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call findLiveThreads on GET /live', async () => {
    const mockResult = { total: 1, limit: 50, skip: 0, threads: [{ id: '1', status: 'active' }] };
    mockThreadsService.findLiveThreads.mockResolvedValue(mockResult);

    const result = await controller.getLiveThreads(undefined, undefined, undefined, '25', '0');
    expect(service.findLiveThreads).toHaveBeenCalledWith({
      storeId: undefined,
      did: undefined,
      search: undefined,
      limit: 25,
      skip: 0,
    });
    expect(result).toEqual(mockResult);
  });

  it('should return thread by ID on GET /:id', async () => {
    const mockThread = { id: 'thread-123', status: 'active', conversationHistory: [] };
    mockThreadsService.findThreadById.mockResolvedValue(mockThread);

    const result = await controller.getThreadById('thread-123');
    expect(service.findThreadById).toHaveBeenCalledWith('thread-123');
    expect(result).toEqual(mockThread);
  });

  it('should throw NotFoundException if thread not found', async () => {
    mockThreadsService.findThreadById.mockResolvedValue(null);

    await expect(controller.getThreadById('non-existent')).rejects.toThrow();
  });
});
