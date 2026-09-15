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
});
