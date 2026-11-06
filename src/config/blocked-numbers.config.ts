export const INTERNAL_BLOCKED_NUMBERS = new Set([
  '0405434292',
  '61405434292',
  '+61405434292',
  '0406500312',
  '61406500312',
  '+61406500312',
]);

export function getPhoneNumberVariations(phone: string): string[] {
  if (!phone) return [];
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  const variations = new Set<string>();
  variations.add(trimmed);
  variations.add(digits);

  if (digits.startsWith('61') && digits.length === 11) {
    variations.add(`+${digits}`);
    variations.add(digits);
    variations.add(`0${digits.slice(2)}`);
  } else if (digits.startsWith('04') && digits.length === 10) {
    variations.add(digits);
    variations.add(`61${digits.slice(1)}`);
    variations.add(`+61${digits.slice(1)}`);
  } else if (digits.startsWith('4') && digits.length === 9) {
    variations.add(`0${digits}`);
    variations.add(`61${digits}`);
    variations.add(`+61${digits}`);
  }

  return Array.from(variations);
}

export function getAllBlockedPhoneVariations(): string[] {
  const variations = new Set<string>();
  for (const num of INTERNAL_BLOCKED_NUMBERS) {
    const raw = num.replace(/\D/g, '');
    variations.add(num);
    variations.add(raw);
    for (const v of getPhoneNumberVariations(num)) {
      variations.add(v);
    }
    if (raw.length === 10 && raw.startsWith('04')) {
      variations.add(`${raw.slice(0, 4)} ${raw.slice(4, 7)} ${raw.slice(7)}`);
      variations.add(raw.slice(1));
    }
  }
  return Array.from(variations);
}
