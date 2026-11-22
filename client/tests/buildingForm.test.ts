import { describe, expect, it } from 'vitest';
import { EMPTY_BUILDING_FORM, toBuildingInput, validateBuildingForm } from '../src/lib/buildingForm';

const valid = {
  ...EMPTY_BUILDING_FORM,
  buildingNumber: '7',
  address: ' ул. Тестовая, 1 ',
  floorsCount: '12',
  monthlyRate: '750,5',
};

describe('validateBuildingForm', () => {
  it('корректная форма без ошибок', () => {
    expect(validateBuildingForm(valid)).toEqual({});
  });

  it('пустая форма даёт ошибки по обязательным полям', () => {
    expect(Object.keys(validateBuildingForm(EMPTY_BUILDING_FORM)).sort()).toEqual([
      'address',
      'buildingNumber',
      'floorsCount',
      'monthlyRate',
    ]);
  });

  it.each([
    ['buildingNumber', '0'],
    ['buildingNumber', '1.5'],
    ['floorsCount', '101'],
    ['monthlyRate', '10.123'],
    ['monthlyRate', '-5'],
    ['monthlyRate', '1000001'],
  ])('поле %s со значением «%s» отклоняется', (field, value) => {
    expect(Object.keys(validateBuildingForm({ ...valid, [field]: value }))).toContain(field);
  });
});

describe('toBuildingInput', () => {
  it('обрезает пробелы, запятую заменяет точкой, пустая станция становится null', () => {
    expect(toBuildingInput(valid)).toEqual({
      buildingNumber: 7,
      address: 'ул. Тестовая, 1',
      metroStation: null,
      buildingType: 'corridor',
      floorsCount: 12,
      monthlyRate: 750.5,
    });
  });
});