import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// Use localhost if 'redis' host is not reachable (common for local runs outside docker)
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl.replace('://redis:', '://localhost:'));

// We rely on DATABASE_URL in .env being correct for the local environment or overridden via env var

async function syncSocietyMetrics() {
    console.log('--- Iniciando Sincronización de Métricas de Sociedades ---');

    try {
        const societies = await prisma.society.findMany({
            where: { isDeleted: false }
        });

        for (const society of societies) {
            console.log(`Procesando sociedad: ${society.name} (${society.code})`);

            // 1. Recalcular Almacenamiento Usado (Solo archivos GENERAL)
            const fileUsage = await prisma.file.aggregate({
                where: {
                    societyId: society.id,
                    category: 'GENERAL'
                },
                _sum: { size: true }
            });
            const actualUsedStorage = BigInt(fileUsage._sum.size || 0);

            // 2. Recalcular Total de Productos
            const actualTotalProducts = await prisma.product.count({
                where: {
                    societyId: society.id,
                    isDeleted: false
                }
            });

            // 3. Actualizar en Base de Datos
            await prisma.society.update({
                where: { id: society.id },
                data: {
                    usedStorage: actualUsedStorage,
                    totalProducts: actualTotalProducts
                }
            });

            console.log(`  -> usedStorage: ${actualUsedStorage} bytes`);
            console.log(`  -> totalProducts: ${actualTotalProducts}`);

            /* 4. Invalidar Caché de Redis
            try {
                await redis.del(`societies:${society.id}`);
                await redis.del(`societies:${society.code}`);
                
                const listKeys = await redis.keys('societies:list:*');
                if (listKeys.length > 0) await redis.del(...listKeys);
                
                const selectKeys = await redis.keys('societies:select:*');
                if (selectKeys.length > 0) await redis.del(...selectKeys);
                console.log(`  -> Caché invalidada.`);
            } catch (redisError) {
                console.warn(`  -> Error invalidando caché (será ignorado):`, redisError.message);
            } */
        }

        console.log('\n--- Sincronización completada con éxito ---');
    } catch (error) {
        console.error('Error durante la sincronización:', error);
    } finally {
        await prisma.$disconnect();
        await redis.quit();
    }
}

syncSocietyMetrics();
