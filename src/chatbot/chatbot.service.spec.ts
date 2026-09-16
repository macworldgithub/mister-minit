import { SYSTEM_PROMPT } from './chatbot.service';

describe('ChatbotService - SYSTEM_PROMPT Rules', () => {
  it('should enforce emergency triage at the front of the car key flow', () => {
    expect(SYSTEM_PROMPT).toContain('CAR KEY EMERGENCY TRIAGE — MANDATORY FIRST STEP');
    expect(SYSTEM_PROMPT).toContain(
      'Are you in an emergency situation — e.g. stranded or lost all your keys? Reply YES or NO.',
    );
    expect(SYSTEM_PROMPT).toContain(
      'Do not quote, book, or process a car key inquiry without first checking if the situation is an emergency',
    );
    expect(SYSTEM_PROMPT).toContain('1800 766 600');
  });

  it('should enforce sending both address and Google Maps link together for location inquiries', () => {
    expect(SYSTEM_PROMPT).toContain('LOCATION & ADDRESS INQUIRIES — MANDATORY RULE');
    expect(SYSTEM_PROMPT).toContain('{{STORE_ADDRESS}}');
    expect(SYSTEM_PROMPT).toContain('{{GOOGLE_MAPS_LINK}}');
    expect(SYSTEM_PROMPT).toContain(
      'You MUST ALWAYS provide BOTH the full address ({{STORE_ADDRESS}}) AND the Google Maps link ({{GOOGLE_MAPS_LINK}}) together in the SAME message.',
    );
  });
});
