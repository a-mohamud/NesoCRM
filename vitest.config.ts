import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['tests/**/*.test.ts'], setupFiles: ['tests/setup-locale.ts'], testTimeout: 20000 } });
