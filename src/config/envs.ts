import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  DIRECT_URL: z.string().optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform(value => value ?? 'false'),
  CORS_ORIGIN: z.string().default('*'),
  R2_ACCESS_KEY_ID: z.string().optional().default(''),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(''),
  R2_ENDPOINT: z.string().optional().default(''),
  R2_BUCKET_NAME: z.string().optional().default(''),
  R2_PUBLIC_URL: z.string().optional().default(''),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const message = parsedEnv.error.issues
    .map(issue => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('; ');

  throw new Error(`Configuración de entorno inválida: ${message}`);
}

export const envs = {
  ...parsedEnv.data,
  isProd: parsedEnv.data.NODE_ENV === 'production',
  REDIS_ENABLED: parsedEnv.data.REDIS_ENABLED === 'true',
};
