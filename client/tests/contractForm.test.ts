import { describe, expect, it } from 'vitest';
import { EMPTY_CONTRACT_FORM, rateOrUndefined, validateContractForm } from '../src/lib/contractForm';

const valid = { ...EMPTY_CONTRACT_FORM, studentId: 's1', bedId: 'b1', startDate: '2030-09-01', endDate: '2030-12-01' };

describe('validateContractForm', () => {
  it('корректная форма без ошибок', () => {
    expect(validateContractForm(valid)).toEqual({});
  });

  it('пустая форма: студент, койка, даты', () => {
    expect(Object.keys(validateContractForm(EMPTY_CONTRACT_FORM)).sort()).toEqual(['bedId', 'endDate', 'startDate', 'studentId']);
  });

  it('окончание не позже начала отклоняется', () => {
    expect(validateContractForm({ ...valid, endDate: '2030-09-01' })).toHaveProperty('endDate');
    expect(validateContractForm({ ...valid, endDate: '2030-08-01' })).toHaveProperty('endDate');
  });

  it.each(['10.123', '-5', 'abc', '1000001'])('ставка «%s» отклоняется', (monthlyRate) => {
    expect(validateContractForm({ ...valid, monthlyRate })).toHaveProperty('monthlyRate');
  });

  it('пустая ставка допустима и даёт undefined', () => {
    expect(validateContractForm({ ...valid, monthlyRate: '' })).toEqual({});
    expect(rateOrUndefined('')).toBeUndefined();
    expect(rateOrUndefined('750,5')).toBe(750.5);
  });
});