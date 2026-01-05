// No importamos dotenv aquí. Node o Docker se encargan.

export const envs = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  DATABASE_URL: process.env.DATABASE_URL || '',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  // Agrega aquí una validación simple
  isProd: process.env.NODE_ENV === 'production',
};

// Validación: Si no hay DATABASE_URL, lanzamos error antes de que la app falle después
if (!envs.DATABASE_URL) {
  throw new Error('❌ Error: DATABASE_URL es obligatoria en las variables de entorno');
}