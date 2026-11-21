import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        // Модульные тесты: без базы данных
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // Интеграционные тесты: только проверенная база dormhub_test
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 15000,
          globalSetup: [path.resolve(import.meta.dirname, 'tests/setup/global-setup.ts')],
        },
      },
    ],
  },
});