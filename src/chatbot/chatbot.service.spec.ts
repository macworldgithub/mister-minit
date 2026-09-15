import { SYSTEM_PROMPT } from './chatbot.service';

describe('ChatbotService - SYSTEM_PROMPT Car Key Rules', () => {
  it('should enforce emergency triage at the front of the car key flow', () => {
    expect(SYSTEM_PROMPT).toContain('CAR KEY REPLACEMENT FLOW & EMERGENCY TRIAGE');
    expect(SYSTEM_PROMPT).toContain(
      'Are you in an emergency situation — e.g. stranded or lost all your keys?\nReply YES or NO.',
    );
    expect(SYSTEM_PROMPT).toContain(
      'Do not quote, book, or process a car key inquiry without first checking if the situation is an emergency',
    );
    expect(SYSTEM_PROMPT).toContain('1800 766 600');
  });
});
