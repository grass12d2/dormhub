import { describe, expect, it } from 'vitest';
import { coverCrop, validateAvatarFile } from '../src/lib/avatar';

describe('validateAvatarFile', () => {
  it('допускает PNG, JPEG, WebP', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(validateAvatarFile({ type, size: 1000 })).toBeNull();
    }
  });

  it('отклоняет другой тип, пустой и слишком большой файл', () => {
    expect(validateAvatarFile({ type: 'image/gif', size: 1000 })).not.toBeNull();
    expect(validateAvatarFile({ type: 'image/png', size: 0 })).not.toBeNull();
    expect(validateAvatarFile({ type: 'image/png', size: 10 * 1024 * 1024 + 1 })).not.toBeNull();
    expect(validateAvatarFile({ type: 'image/png', size: 10 * 1024 * 1024 })).toBeNull();
  });
});

describe('coverCrop', () => {
  it('квадрат по центру для широкого и высокого изображения', () => {
    expect(coverCrop(400, 200)).toEqual({ sx: 100, sy: 0, size: 200 });
    expect(coverCrop(200, 500)).toEqual({ sx: 0, sy: 150, size: 200 });
    expect(coverCrop(300, 300)).toEqual({ sx: 0, sy: 0, size: 300 });
  });
});