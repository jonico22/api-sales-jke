import fs from 'fs';
import csv from 'csv-parser';
import prisma from '@/config/prisma';
import { Product } from '@prisma/client';
import { redis } from '@/config/redis';

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
    Color?: string;
    ColorCode?: string;
    [key: string]: string | undefined;
}

export class ProductBulkService {
    static async processBulkUpload(filePath: string, societyId: string, createdBy: string) {
        const results: ProductCsvRow[] = [];

        // 1. Read CSV
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', resolve)
                .on('error', reject);
        });

        // 2. Prepare Data (Get IDs & Validate Limits)
        const society = await prisma.society.findUnique({
            where: { id: societyId },
            select: { id: true, code: true, maxProducts: true, totalProducts: true }
        });

        if (!society) {
            throw new Error('Sociedad no encontrada.');
        }

        const newProductsCount = results.length;
        if (society.totalProducts + newProductsCount > society.maxProducts) {
            throw new Error(`Límite de productos excedido. Actualmente tienes ${society.totalProducts} productos y estás intentando subir ${newProductsCount}. El límite permitido es de ${society.maxProducts}.`);
        }

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

        // 2.1 Pre-fetch existing product codes for this society to avoid duplicates
        const existingProducts = await prisma.product.findMany({
            where: { societyId, isDeleted: false },
            select: { code: true }
        });
        const existingCodes = new Set(existingProducts.map(p => p.code));
        const seenInFile = new Set<string>();

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

                    const sku = row.CodigoInterno.trim();

                    // Check duplicate in DB
                    if (existingCodes.has(sku)) {
                        errors.push(`Fila ${rowNum}: El Código/SKU '${sku}' ya existe en el sistema.`);
                        continue;
                    }

                    // Check duplicate in current file
                    if (seenInFile.has(sku)) {
                        errors.push(`Fila ${rowNum}: El Código/SKU '${sku}' está duplicado en este archivo.`);
                        continue;
                    }
                    seenInFile.add(sku);

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
                            barcode: row.CodigoBarras || row['CodigoBarras(Opcional)'],
                            brand: row.Marca || row['Marca(Opcional)'],
                            description: row.Descripcion || row['Descripcion(Opcional)'],
                            isActive: true,
                            color: row.Color || row['Color(Opcional)'],
                            colorCode: row.ColorCode || row['ColorCode(Opcional)'],
                            createdBy,
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
                            createdBy,
                        },
                    });

                    processedCount++;
                } catch (error: any) {
                    if (error.code === 'P2002') {
                        const target = error.meta?.target;
                        let field = 'campo único';
                        if (Array.isArray(target)) {
                            if (target.includes('code')) field = 'Código Interno (SKU)';
                            if (target.includes('barcode')) field = 'Código de Barras';
                            if (target.includes('name')) field = 'Nombre del Producto';
                            if (target.includes('societyId') && target.includes('code')) field = 'Codigo Interno (SKU) en esta Sociedad';
                        }
                        errors.push(`Fila ${rowNum}: El ${field} '${row.CodigoInterno}' (o similar) ya existe.`);
                    } else {
                        errors.push(`Fila ${rowNum}: ${error.message}`);
                    }
                }
            }

            // 3.1 Update totalProducts in Society
            if (processedCount > 0) {
                await tx.society.update({
                    where: { id: societyId },
                    data: { totalProducts: { increment: processedCount } }
                });
            }
        }, {
            maxWait: 5000,
            timeout: 60000 // Increased timeout for potentially large bulk updates
        });

        // 4. Cache Invalidation (Aggressive)
        if (processedCount > 0) {
            await redis.deleteKeysByPrefix('products:');
            // Also invalidate branch office products if stock changed
            await redis.deleteKeysByPrefix('branch_office_products:');

            // Invalidate Society Cache (for totalProducts update)
            await redis.del(`societies:${society.id}`);
            await redis.del(`societies:${society.code}`);
            await redis.deleteKeysByPrefix(`societies:list:`);

            console.log('[ProductBulkService] All related cache invalidated after bulk upload');
        }

        return {
            success: true,
            processed: processedCount,
            errors,
        };
    }
}
