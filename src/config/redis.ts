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

// Parse credentials from URL
let redisConfig: any = {};

try {
  const url = new URL(redisUrl);

  // Extract database number from pathname (e.g., /0, /1)
  const database = url.pathname ? parseInt(url.pathname.slice(1)) : 0;

  // Debug logging (mask password but show length)
  console.log('[Redis Config] Parsing URL...');
  console.log('[Redis Config] Host:', url.hostname);
  console.log('[Redis Config] Port:', url.port || '6379');
  console.log('[Redis Config] Username:', url.username || '(none)');
  console.log('[Redis Config] Password Length:', url.password?.length || 0);
  console.log('[Redis Config] Database:', database);
  console.log('[Redis Config] Using TLS:', useTls);

  // IMPORTANT: Use manual config instead of url to avoid parsing issues
  console.log('[Redis Config] Using manual config with explicit credentials');
  redisConfig = {
    socket: {
      host: url.hostname,
      port: parseInt(url.port || '6379'),
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
    },
    username: url.username || undefined,
    password: url.password || undefined,
    database: database
  };

  console.log('[Redis Config] Config created successfully');
} catch (e) {
  console.error('[Redis Config] Error parsing REDIS_URL:', e);
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
