import fs from 'fs';
import csv from 'csv-parser';
import prisma from '@/config/prisma';
import { Product } from '@prisma/client';

interface ProductCsvRow {
    NombreProducto: string;
    CodigoInterno: string; // SKU
    CodigoCategoria: string;
    PrecioVenta: string;
    PrecioCosto: string;
    StockInicial: string;
    StockMinimo: string;
    CodigoBarras?: string;
    Marca?: string;
    Descripcion?: string;
}

export class ProductBulkService {
    static async processBulkUpload(filePath: string, societyId: string) {
        const results: ProductCsvRow[] = [];

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

        // 2. Prepare Data (Get IDs)
        const mainBranch = await prisma.branchOffice.findFirst({
            where: { societyId, isMain: true },
        });

        if (!mainBranch) {
            throw new Error('No se encontró una Sucursal Principal habilitada para esta sociedad.');
        }

        const categories = await prisma.category.findMany({
            where: { societyId },
        });

        const categoryMap = new Map(categories.map(c => [c.code, c.id])); // Map Code -> ID

        let processedCount = 0;
        let errors: string[] = [];

        // 3. Process & Insert (Transaction)
        await prisma.$transaction(async (tx) => {
            for (const [index, row] of results.entries()) {
                const rowNum = index + 2; // Header is 1

                try {
                    // Validation
                    if (!row.NombreProducto || !row.CodigoInterno || !row.CodigoCategoria) {
                        throw new Error(`Faltan datos obligatorios (Nombre, SKU, Categoría)`);
                    }

                    const categoryId = categoryMap.get(row.CodigoCategoria);
                    if (!categoryId) {
                        throw new Error(`La categoría con código '${row.CodigoCategoria}' no existe.`);
                    }

                    const stockInicial = parseInt(row.StockInicial || '0', 10);
                    const stockMinimo = parseInt(row.StockMinimo || '0', 10);
                    const precioVenta = parseFloat(row.PrecioVenta || '0');
                    const precioCosto = parseFloat(row.PrecioCosto || '0');

                    // Create Product
                    const newProduct = await tx.product.create({
                        data: {
                            societyId,
                            name: row.NombreProducto,
                            code: row.CodigoInterno, // Using SKU as internal code
                            categoryId,
                            price: precioVenta,
                            priceCost: precioCosto,
                            stock: stockInicial, // Global stock
                            minStock: stockMinimo,
                            barcode: row.CodigoBarras,
                            brand: row.Marca,
                            description: row.Descripcion,
                            isActive: true,
                        },
                    });

                    // Create Stock in Main Branch
                    await tx.branchOfficeProduct.create({
                        data: {
                            productId: newProduct.id,
                            branchOfficeId: mainBranch.id,
                            physicalStock: stockInicial,
                            availableStock: stockInicial,
                            minStock: stockMinimo,
                            isActive: true,
                        },
                    });

                    processedCount++;
                } catch (error: any) {
                    errors.push(`Fila ${rowNum}: ${error.message}`);
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
