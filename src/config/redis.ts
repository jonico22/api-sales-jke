import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});

redisClient.on('error', (err) => console.error('❌ Redis Client Error', err));

// Conectar inmediatamente al crear el cliente
// Esto asegura que esté listo cuando el rate limiter lo necesite
redisClient.connect().catch((err) => {
  console.error('❌ No se pudo conectar a Redis:', err);
  // No hacemos exit aquí para permitir que la app funcione sin Redis en desarrollo
});

export const connectRedis = async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log('✅ Conectado a Redis');
    } else {
      console.log('✅ Redis ya está conectado');
    }
  } catch (error) {
    console.error('❌ No se pudo conectar a Redis:', error);
    // Opcional: process.exit(1) si Redis es crítico para tu app
  }
};

export default redisClient;