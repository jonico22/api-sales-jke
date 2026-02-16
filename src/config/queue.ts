
import { Queue } from 'bullmq';


const redisUrl = process.env.REDIS_URL;
let connectionOptions: any = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
};

if (redisUrl) {
    try {
        const url = new URL(redisUrl);
        connectionOptions = {
            host: url.hostname,
            port: parseInt(url.port || '6379'),
            password: url.password || undefined,
            username: url.username || undefined,
            maxRetriesPerRequest: null,
        };
    } catch (e) {
        console.warn('Invalid REDIS_URL, falling back to individual env vars');
    }
}

export const connection = connectionOptions;

export const reportQueue = new Queue('reports', { connection });

// Exportamos también la conexión si se necesita para workers
export const redisConnection = connection;
