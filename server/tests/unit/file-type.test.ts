import { describe, expect, it } from 'vitest';
import { detectFileType, safeFileName } from '../../src/utils/file-type.js';

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]);

describe('detectFileType', () => {
  it('распознаёт форматы по сигнатуре и расширению', () => {
    expect(detectFileType(png, 'a.png')).toBe('image/png');
    expect(detectFileType(Buffer.from('%PDF-1.4'), 'a.pdf')).toBe('application/pdf');
    expect(detectFileType(zip, 'a.docx')).toContain('wordprocessingml');
    expect(detectFileType(zip, 'a.xlsx')).toContain('spreadsheetml');
    expect(detectFileType(ole, 'a.doc')).toBe('application/msword');
    expect(detectFileType(ole, 'a.xls')).toBe('application/vnd.ms-excel');
    expect(detectFileType(Buffer.from('Привет'), 'a.txt')).toBe('text/plain');
  });

  it('отклоняет подмену расширения и неподдерживаемое содержимое', () => {
    expect(detectFileType(png, 'a.pdf')).toBeNull();
    expect(detectFileType(zip, 'a.exe')).toBeNull();
    expect(detectFileType(Buffer.from('MZ\u0090\u0000'), 'a.txt')).toBeNull();
    expect(detectFileType(Buffer.from([0xff, 0xfe, 0xfa]), 'a.txt')).toBeNull();
    expect(detectFileType(Buffer.from('<script>'), 'a.html')).toBeNull();
  });
});

describe('safeFileName', () => {
  it('убирает путь, кавычки и управляющие символы', () => {
    expect(safeFileName('..\\..\\evil"\n.txt')).toBe('evil.txt');
    expect(safeFileName('/etc/passwd')).toBe('passwd');
  });
});