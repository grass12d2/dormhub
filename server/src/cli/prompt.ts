/**
 * Ввод данных в интерактивной командной строке.
 *
 * Скрытый ввод (для паролей) не отображает символы на экране, поэтому пароль
 * не попадает в историю команд, список процессов и снимки экрана.
 */

export interface PromptOptions {
  /** Не показывать вводимые символы */
  hidden?: boolean;
}

/**
 * Запросить строку у пользователя. Требует интерактивный терминал.
 * Ctrl+C и Ctrl+D отменяют ввод.
 */
export function promptLine(question: string, options: PromptOptions = {}): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    return Promise.reject(new Error('Команда требует интерактивного терминала'));
  }

  return new Promise((resolve, reject) => {
    const chars: string[] = [];

    const finish = (action: () => void): void => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      action();
    };

    const onData = (chunk: Buffer): void => {
      const text = chunk.toString('utf8');
      // Управляющие последовательности (стрелки и т. п.) игнорируются
      if (text.startsWith('\u001b')) {
        return;
      }

      for (const char of text) {
        if (char === '\r' || char === '\n') {
          finish(() => resolve(chars.join('')));
          return;
        }
        if (char === '\u0003' || char === '\u0004') {
          finish(() => reject(new Error('Ввод отменён')));
          return;
        }
        if (char === '\u007f' || char === '\b') {
          if (chars.length > 0) {
            chars.pop();
            if (!options.hidden) {
              stdout.write('\b \b');
            }
          }
          continue;
        }
        if (char < ' ') {
          continue;
        }
        chars.push(char);
        if (!options.hidden) {
          stdout.write(char);
        }
      }
    };

    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}