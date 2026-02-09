import fs from 'fs';
import csv from 'csv-parser';
import prisma from '@/config/prisma';

interface CategoryCsvRow {
    NombreCategoria: string;
    CodigoCategoria: string;
    Descripcion?: string;
}

export class CategoryBulkService {
    static async processBulkUpload(filePath: string, societyId: string) {
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

                    // Check for existence code (optional, or let Prisma throw unique constraint error and catch it)
                    // For bulk, let's catch standard errors to allow partial success if needed, OR fail all.
                    // Requirement usually implies "Upload All or Nothing" OR "Report Errors".
                    // We are doing ONE transaction, so it's All or Nothing by default here unless we catch inside loop 
                    // BUT catching unique error inside transaction loop doesn't abort transaction but allows continuing? 
                    // NO, in Prisma transaction, if one fails, all rollback unless handled carefully?
                    // Actually, let's strictly fail if duplicate code to keep integrity clean.

                    await tx.category.create({
                        data: {
                            societyId,
                            name: row.NombreCategoria,
                            code: row.CodigoCategoria,
                            description: row.Descripcion,
                            isActive: true,
                        },
                    });

                    processedCount++;
                } catch (error: any) {
                    if (error.code === 'P2002') {
                        errors.push(`Fila ${rowNum}: El código '${row.CodigoCategoria}' ya existe.`);
                    } else {
                        errors.push(`Fila ${rowNum}: ${error.message}`);
                    }
                    // If we want partial success, we shouldn't use one big transaction for everything if we want to commit good ones.
                    // BUT for bulk data usually All-Or-Nothing is safer. 
                    // However, user often prefers "Import what you can".
                    // The current code throws inside transaction loop -> will rollback everything.
                    // To allow "Partial Success", we should NOT use a single transaction wrapper around the loop, 
                    // OR verify first. 
                    // Let's stick to ALL OR NOTHING for data integrity in this simple version, 
                    // but if error, we throw to rollback.
                    throw error;
                }
            }
        });

        return {
            success: true,
            processed: processedCount,
            errors,
        };
    }
}
