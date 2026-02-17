
import { Queue } from 'bullmq';


const redisUrl = process.env.REDIS_URL;
const useTls = redisUrl?.startsWith('rediss');

let connectionOptions: any = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
};

if (redisUrl) {
    try {
        const url = new URL(redisUrl);

        console.log('[BullMQ Config] Parsing REDIS_URL...');
        console.log('[BullMQ Config] Host:', url.hostname);
        console.log('[BullMQ Config] Port:', url.port || '6379');
        console.log('[BullMQ Config] Username:', url.username || '(none)');
        console.log('[BullMQ Config] Password Length:', url.password?.length || 0);
        console.log('[BullMQ Config] Using TLS:', useTls);

        connectionOptions = {
            host: url.hostname,
            port: parseInt(url.port || '6379'),
            password: url.password || undefined,
            username: url.username || undefined,
            maxRetriesPerRequest: null,
            ...(useTls && {
                tls: {
                    rejectUnauthorized: false
                }
            })
        };

        console.log('[BullMQ Config] Connection config created');
    } catch (e) {
        console.error('[BullMQ Config] Error parsing REDIS_URL:', e);
    }
}

export const connection = connectionOptions;

export const reportQueue = new Queue('reports', { connection });

// Exportamos también la conexión si se necesita para workers
export const redisConnection = connection;
