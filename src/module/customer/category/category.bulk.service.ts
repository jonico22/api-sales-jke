import fs from 'fs';
import csv from 'csv-parser';
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { NotFoundAppError, ValidationAppError } from '@/utils/domain-errors';

interface CategoryCsvRow {
    NombreCategoria: string;
    CodigoCategoria: string;
    Descripcion?: string;
}

export class CategoryBulkService {
    static async processBulkUpload(filePath: string, societyId: string, createdBy: string) {
        const results: CategoryCsvRow[] = [];

        // 1. Read CSV
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', resolve)
                .on('error', reject);
        });

        // Clean up file (async, non-blocking)
        fs.unlink(filePath, () => { });

        if (results.length === 0) {
            throw new ValidationAppError('El archivo CSV está vacío.');
        }

        // ─── 2. PARALLEL: Pre-fetch society + current count ──────────────
        const [society, currentCategoriesCount] = await Promise.all([
            prisma.society.findUnique({
                where: { id: societyId },
                select: { maxProducts: true }
            }),
            prisma.category.count({
                where: { societyId, isDeleted: false }
            })
        ]);

        if (!society) throw new NotFoundAppError('Sociedad no encontrada.', { societyId });

        const newCategoriesCount = results.length;
        if (currentCategoriesCount + newCategoriesCount > society.maxProducts) {
            throw new ValidationAppError(`Límite de categorías excedido. Actualmente tienes ${currentCategoriesCount} categorías y estás intentando subir ${newCategoriesCount}. El límite permitido (basado en el plan de productos) es de ${society.maxProducts}.`);
        }

        let processedCount = 0;
        let errors: string[] = [];

        // ─── 3. Process & Insert (Transaction) ───────────────────────────
        await prisma.$transaction(async (tx) => {
            for (const [index, row] of results.entries()) {
                const rowNum = index + 2;

                try {
                    if (!row.NombreCategoria || !row.CodigoCategoria) {
                        throw new Error(`Faltan datos obligatorios (Nombre, Código) en fila ${rowNum}`);
                    }

                    await tx.category.create({
                        data: {
                            societyId,
                            name: row.NombreCategoria,
                            code: row.CodigoCategoria,
                            description: row.Descripcion,
                            isActive: true,
                            createdBy,
                        },
                    });

                    processedCount++;
                } catch (error: any) {
                    if (error.code === 'P2002') {
                        const duplicateField = error.meta?.target?.includes('code') ? 'código' : 'campo';
                        throw new Error(`Fila ${rowNum}: El ${duplicateField} '${row.CodigoCategoria}' ya existe en la base de datos.`);
                    } else {
                        throw new Error(`Fila ${rowNum}: ${error.message}`);
                    }
                }
            }
        });

        // ─── 4. BACKGROUND: Cache Invalidation ───────────────────────────
        if (processedCount > 0) {
            setImmediate(async () => {
                try {
                    await redis.deleteKeysByPrefix('categories:');
                } catch (e) {
                    console.error('[CategoryBulkService] Error background cache:', e);
                }
            });
        }

        return {
            success: true,
            processed: processedCount,
        };
    }
}
