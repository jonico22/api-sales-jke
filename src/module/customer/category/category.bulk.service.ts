import fs from 'fs';
import csv from 'csv-parser';
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';

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

        // Clean up file
        fs.unlinkSync(filePath);

        if (results.length === 0) {
            throw new Error('El archivo CSV está vacío.');
        }

        let processedCount = 0;
        let errors: string[] = [];

        // 2. Process & Insert (Transaction)
        await prisma.$transaction(async (tx) => {
            for (const [index, row] of results.entries()) {
                const rowNum = index + 2; // Header is 1

                try {
                    // Validation
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
                    // Handle duplicate code error
                    if (error.code === 'P2002') {
                        const duplicateField = error.meta?.target?.includes('code') ? 'código' : 'campo';
                        throw new Error(`Fila ${rowNum}: El ${duplicateField} '${row.CodigoCategoria}' ya existe en la base de datos.`);
                    } else {
                        throw new Error(`Fila ${rowNum}: ${error.message}`);
                    }
                }
            }
        });

        // 3. Invalidate Cache
        await redis.deleteKeysByPrefix('categories:');
        console.log('[CategoryBulkService] Cache invalidado tras carga masiva');

        return {
            success: true,
            processed: processedCount,
        };
    }
}
