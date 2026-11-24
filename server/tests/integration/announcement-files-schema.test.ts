import { afterAll, describe, expect, it } from 'vitest';
import { expectDbError } from '../setup/db-assert.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();

afterAll(async () => {
  await pool.end();
});

async function newAnnouncement() {
  const r = await pool.query<{ id: string }>(
    "INSERT INTO announcements (title, body) VALUES ('Т', 'Б') RETURNING id"
  );
  return r.rows[0].id;
}

const insert = (id: string, name: string, type: string, data: Buffer, size = data.length) =>
  pool.query(
    'INSERT INTO announcement_files (announcement_id, file_name, content_type, size_bytes, data) VALUES ($1, $2, $3, $4, $5)',
    [id, name, type, size, data]
  );

describe('announcement_files', () => {
  it('принимает допустимый файл', async () => {
    await insert(await newAnnouncement(), 'a.pdf', 'application/pdf', Buffer.from([1, 2, 3]));
  });

  it('отклоняет другой тип, пустое имя и неверный размер', async () => {
    const id = await newAnnouncement();
    await expectDbError(insert(id, 'a.exe', 'application/x-msdownload', Buffer.from([1])), {
      code: '23514',
      constraint: 'announcement_files_type_check',
    });
    await expectDbError(insert(id, '  ', 'text/plain', Buffer.from([1])), {
      code: '23514',
      constraint: 'announcement_files_name_check',
    });
    await expectDbError(insert(id, 'a.txt', 'text/plain', Buffer.from([1]), 5), {
      code: '23514',
      constraint: 'announcement_files_size_check',
    });
    await expectDbError(insert(id, 'a.txt', 'text/plain', Buffer.alloc(5242881)), {
      code: '23514',
      constraint: 'announcement_files_size_check',
    });
  });

  it('удаление объявления удаляет файлы', async () => {
    const id = await newAnnouncement();
    await insert(id, 'a.txt', 'text/plain', Buffer.from([1]));
    await pool.query('DELETE FROM announcements WHERE id = $1', [id]);
    expect((await pool.query('SELECT 1 FROM announcement_files WHERE announcement_id = $1', [id])).rowCount).toBe(0);
  });
});