import { afterEach, vi } from 'vitest';

process.env.TZ = 'America/Lima';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/api_sales_jke_test';
process.env.DIRECT_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
process.env.REDIS_ENABLED = process.env.REDIS_ENABLED || 'false';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
