import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'unit',
    // Модульные тесты не обращаются к базе данных
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});