import { createClient, RedisClientType } from 'redis';

// 1. Configuración de variables de entorno (más limpio)
const REDIS_ENABLED = process.env.REDIS_ENABLED === 'true';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const getRedisHost = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname || 'localhost';
  } catch {
    return 'localhost';
  }
};

const redisHost = getRedisHost(redisUrl);
const useTls = redisUrl.startsWith('rediss');

const KEY_PREFIX = 'ventas:';

// Parse credentials from URL (same as queue.ts)
let redisConfig: any = {};

try {
  const url = new URL(redisUrl);

  // Debug logging (mask password)
  console.log('[Redis Config] Parsing URL...');
  console.log('[Redis Config] Host:', url.hostname);
  console.log('[Redis Config] Port:', url.port || '6379');
  console.log('[Redis Config] Username:', url.username || '(none)');
  console.log('[Redis Config] Has Password:', !!url.password);
  console.log('[Redis Config] Using TLS:', useTls);

  // Use URL directly - the redis package handles credentials properly
  console.log('[Redis Config] Using URL with socket options');
  redisConfig = {
    url: redisUrl, // This includes credentials
    socket: {
      connectTimeout: 10000,
      keepAlive: 5000,
      reconnectStrategy: (retries: number) => {
        const delay = Math.min(retries * 100, 3000);
        console.warn(`⚠️ Redis: Intentando reconectar en ${delay}ms... (Intento ${retries})`);
        return delay;
      },
      ...(useTls && {
        tls: true,
        rejectUnauthorized: false
      })
    }
  };
} catch (e) {
  console.warn('[Redis Config] Error parsing REDIS_URL, using default config:', e);
  redisConfig = {
    url: redisUrl
  };
}

const client: RedisClientType = createClient(redisConfig);

// Estado interno
let isReady = false;

// Manejadores de eventos
client.on('connect', () => console.log('⏳ Redis: Conectando...'));
client.on('ready', () => {
  isReady = true;
  console.log('✅ Redis: Listo y conectado');
});
client.on('error', (err) => {
  // Si es un error de socket cerrado, es un warning, no un error crítico
  if (err.message.includes('Socket closed unexpectedly')) {
    console.warn('ℹ️ Redis: Conexión cerrada por el servidor. Reconectando automáticamente...');
  } else {
    console.error('❌ Redis: Error de cliente', err);
  }
});
client.on('end', () => {
  isReady = false;
  console.warn('⚠️ Redis: Conexión cerrada');
});

/**
 * Inicializa la conexión. Se debe llamar en el arranque de la API.
 */
export const connectRedis = async () => {
  if (!REDIS_ENABLED) return;
  try {
    if (!client.isOpen) {
      await client.connect();
    }
  } catch (error) {
    console.error('❌ Redis: Error fatal en la conexión inicial:', error);
  }
};

/**
 * Interfaz de ayuda para la aplicación
 */
export const redis = {
  enabled: REDIS_ENABLED,
  prefix: KEY_PREFIX,

  /**
   * Verifica si Redis está operativo en este momento
   */
  get status() {
    return REDIS_ENABLED && isReady;
  },

  async ping(): Promise<boolean> {
    if (!this.status) return false;
    try {
      await client.ping();
      return true;
    } catch (error) {
      console.error('[Redis] Ping failed:', error);
      return false;
    }
  },

  async get<T>(key: string): Promise<T | null> {
    if (!this.status) return null;

    try {
      const rawValue = await client.get(KEY_PREFIX + key);
      if (typeof rawValue !== 'string') return null;

      try {
        return JSON.parse(rawValue) as T;
      } catch {
        return (rawValue as unknown) as T;
      }
    } catch (error) {
      console.error(`[Redis] Error getting key ${key}:`, error);
      return null;
    }
  },

  async set(key: string, value: any, ttl = 60): Promise<void> {
    if (!this.status) return;

    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await client.set(KEY_PREFIX + key, serialized, { EX: ttl });
    } catch (error) {
      console.error(`[Redis] Error guardando clave ${key}:`, error);
    }
  },

  async del(key: string): Promise<void> {
    if (!this.status) return;
    await client.del(KEY_PREFIX + key);
  },

  async deleteKeysByPrefix(prefix: string): Promise<void> {
    if (!this.status) return;

    let cursor = 0;
    try {
      let keysToDelete: string[] = [];

      do {
        const scanResult = await client.scan(cursor.toString(), {
          MATCH: `${KEY_PREFIX}${prefix}*`,
          COUNT: 100
        });

        keysToDelete = keysToDelete.concat(scanResult.keys);
        cursor = parseInt(scanResult.cursor, 10);

      } while (cursor !== 0);

      if (keysToDelete.length > 0) {
        await client.del(keysToDelete);
        console.log(`[Redis] 🗑️ Eliminadas ${keysToDelete.length} claves con prefijo '${prefix}' (redis-prefix: ${KEY_PREFIX})`);
      } else {
        console.log(`[Redis] ⚠️ No se encontraron claves para eliminar con prefijo '${prefix}'`);
      }
    } catch (error) {
      console.error(`[Redis] Error limpiando prefijo ${prefix}:`, error);
    }
  }
};

export default client;
