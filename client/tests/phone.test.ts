import { describe, expect, it } from 'vitest';
import { formatPhone, isCompletePhone, phoneDigits, phoneFromApi, phoneToApi } from '../src/lib/phone';

describe('formatPhone', () => {
  it.each([
    ['', '+7 '],
    ['9', '+7 9'],
    ['900', '+7 900'],
    ['9001', '+7 900 1'],
    ['900123', '+7 900 123'],
    ['9001234', '+7 900 123-4'],
    ['9001234567', '+7 900 123-45-67'],
  ])('«%s» даёт «%s»', (input, expected) => {
    expect(formatPhone(input)).toBe(expected);
  });

  it('игнорирует нецифры и лишние цифры', () => {
    expect(formatPhone('abc90-0(123)45 67 89 00')).toBe('+7 900 123-45-67');
  });

  it('отбрасывает ведущие 7 и 8 у полного номера', () => {
    expect(phoneDigits('+7 900 123-45-67')).toBe('9001234567');
    expect(phoneDigits('89001234567')).toBe('9001234567');
    expect(phoneDigits('79001234567')).toBe('9001234567');
  });
});

describe('полнота и обмен с сервером', () => {
  it('полный номер — десять цифр', () => {
    expect(isCompletePhone('+7 900 123-45-67')).toBe(true);
    expect(isCompletePhone('+7 900 123')).toBe(false);
  });

  it('пустой ввод превращается в null, непустой — в отформатированную строку', () => {
    expect(phoneToApi('+7 ')).toBeNull();
    expect(phoneToApi('9001234567')).toBe('+7 900 123-45-67');
    expect(phoneFromApi(null)).toBe('+7 ');
    expect(phoneFromApi('+7 900 100-00-01')).toBe('+7 900 100-00-01');
  });
});