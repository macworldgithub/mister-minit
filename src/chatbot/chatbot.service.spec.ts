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

  it('should include all 14 2026 public holidays and mandatory closure rule', () => {
    expect(SYSTEM_PROMPT).toContain('2026 PUBLIC HOLIDAYS LIST');
    expect(SYSTEM_PROMPT).toContain('{{HOLIDAY_STATUS_DIRECTIVE}}');
    expect(SYSTEM_PROMPT).toContain('{{CURRENT_DATE}}');
    expect(SYSTEM_PROMPT).toContain("New Year's Day — 1 January 2026 (Thursday)");
    expect(SYSTEM_PROMPT).toContain('Australia Day — 26 January 2026 (Monday)');
    expect(SYSTEM_PROMPT).toContain('Labour Day — 9 March 2026 (Monday)');
    expect(SYSTEM_PROMPT).toContain('Good Friday — 3 April 2026 (Friday)');
    expect(SYSTEM_PROMPT).toContain('Saturday before Easter Sunday — 4 April 2026 (Saturday)');
    expect(SYSTEM_PROMPT).toContain('Easter Sunday — 5 April 2026 (Sunday)');
    expect(SYSTEM_PROMPT).toContain('Easter Monday — 6 April 2026 (Monday)');
    expect(SYSTEM_PROMPT).toContain('ANZAC Day — 25 April 2026 (Saturday)');
    expect(SYSTEM_PROMPT).toContain("King's Birthday — 8 June 2026 (Monday)");
    expect(SYSTEM_PROMPT).toContain('Friday before AFL Grand Final — 25 September 2026 (Friday)');
    expect(SYSTEM_PROMPT).toContain('Melbourne Cup Day — 3 November 2026 (Tuesday)');
    expect(SYSTEM_PROMPT).toContain('Christmas Day — 25 December 2026 (Friday)');
    expect(SYSTEM_PROMPT).toContain('Boxing Day — 26 December 2026 (Saturday)');
    expect(SYSTEM_PROMPT).toContain('Additional Boxing Day Public Holiday — 28 December 2026 (Monday)');
    expect(SYSTEM_PROMPT).toContain('No, we are closed due to [Holiday Name]');
  });
});
