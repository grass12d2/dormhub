/**
 * Ограничитель неудачных попыток в памяти процесса.
 *
 * Ключ (email или IP) блокируется, когда число неудач в текущем окне
 * достигло лимита. Просроченные записи удаляются, а общее число записей
 * ограничено, чтобы память не росла бесконечно.
 */

interface FailureRecord {
  count: number;
  resetAt: number;
}

export class FailureLimiter {
  private readonly records = new Map<string, FailureRecord>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 10_000
  ) {}

  /** Достиг ли ключ лимита неудач в текущем окне */
  isBlocked(key: string): boolean {
    const record = this.records.get(key);
    if (!record) {
      return false;
    }
    if (this.now() >= record.resetAt) {
      this.records.delete(key);
      return false;
    }
    return record.count >= this.limit;
  }

  /** Записать неудачную попытку */
  recordFailure(key: string): void {
    const now = this.now();
    const record = this.records.get(key);
    if (record && now < record.resetAt) {
      record.count += 1;
      return;
    }
    this.makeRoom(now);
    this.records.set(key, { count: 1, resetAt: now + this.windowMs });
  }

  /** Сбросить счётчик ключа (например, после успешного входа) */
  reset(key: string): void {
    this.records.delete(key);
  }

  /** Число отслеживаемых ключей */
  get size(): number {
    return this.records.size;
  }

  private makeRoom(now: number): void {
    if (this.records.size < this.maxEntries) {
      return;
    }
    for (const [key, record] of this.records) {
      if (now >= record.resetAt) {
        this.records.delete(key);
      }
    }
    while (this.records.size >= this.maxEntries) {
      const oldest = this.records.keys().next();
      if (oldest.done) {
        break;
      }
      this.records.delete(oldest.value);
    }
  }
}