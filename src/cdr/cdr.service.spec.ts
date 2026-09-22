import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CdrService } from './cdr.service';
import { Cdr } from './cdr.schema';
import { StoreConfigService } from '../store-config/store-config.service';

describe('CdrService', () => {
  let service: CdrService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CdrService,
        {
          provide: getModelToken(Cdr.name),
          useValue: {
            findOneAndUpdate: jest.fn(),
            find: jest.fn(),
            countDocuments: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: StoreConfigService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<CdrService>(CdrService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
