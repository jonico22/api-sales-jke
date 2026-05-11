import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

const loadEnvsModule = async () => {
  vi.resetModules();
  return import('@/config/envs');
};

describe('envs config', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('parses a valid environment with defaults', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test_db';
    delete process.env.PORT;
    delete process.env.NODE_ENV;
    delete process.env.REDIS_ENABLED;

    const { envs } = await loadEnvsModule();

    expect(envs.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/test_db');
    expect(envs.PORT).toBe(3000);
    expect(envs.NODE_ENV).toBe('development');
    expect(envs.REDIS_ENABLED).toBe(false);
    expect(envs.REDIS_URL).toBe('redis://localhost:6379');
  });

  it('maps production mode to isProd', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test_db';
    process.env.NODE_ENV = 'production';
    process.env.REDIS_ENABLED = 'true';

    const { envs } = await loadEnvsModule();

    expect(envs.NODE_ENV).toBe('production');
    expect(envs.isProd).toBe(true);
    expect(envs.REDIS_ENABLED).toBe(true);
  });

  it('throws when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL;

    await expect(loadEnvsModule()).rejects.toThrow('DATABASE_URL');
  });

  it('throws when NODE_ENV is invalid', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test_db';
    process.env.NODE_ENV = 'staging';

    await expect(loadEnvsModule()).rejects.toThrow('Configuración de entorno inválida');
  });
});
