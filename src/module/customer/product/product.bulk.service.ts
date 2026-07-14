import fs from 'fs';
import csv from 'csv-parser';
import prisma from '@/config/prisma';
import { Product } from '@prisma/client';
import { redis } from '@/config/redis';
import { NotFoundAppError, ValidationAppError } from '@/utils/domain-errors';

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

const REQUIRED_PRODUCT_CSV_HEADERS = [
    'NombreProducto',
    'CodigoInterno',
    'CodigoCategoria',
    'PrecioVenta',
    'PrecioCosto',
    'StockInicial',
    'StockMinimo',
] as const;

const OPTIONAL_PRODUCT_CSV_HEADERS = [
    'CodigoBarras',
    'CodigoBarras(Opcional)',
    'Marca',
    'Marca(Opcional)',
    'Descripcion',
    'Descripcion(Opcional)',
    'Color',
    'Color(Opcional)',
    'ColorCode',
    'ColorCode(Opcional)',
] as const;

const PRODUCT_CSV_HEADER_ORDER = [
    ...REQUIRED_PRODUCT_CSV_HEADERS,
    'CodigoBarras',
    'Marca',
    'Descripcion',
    'Color',
    'ColorCode',
] as const;

const normalizeCsvHeader = (header?: string | null) => header?.replace(/^\uFEFF/, '').trim() ?? '';

const normalizeHeaderForOrder = (header: string) => header.replace('(Opcional)', '');

const validateProductCsvHeaders = (headers: string[]) => {
    const normalizedHeaders = headers.map(normalizeCsvHeader).filter(Boolean);

    const missingRequiredHeaders = REQUIRED_PRODUCT_CSV_HEADERS.filter(
        (header) => !normalizedHeaders.includes(header)
    );

    if (missingRequiredHeaders.length > 0) {
        throw new ValidationAppError(
            `Faltan columnas obligatorias en el CSV: ${missingRequiredHeaders.join(', ')}.`
        );
    }

    const allowedHeaders = new Set([...REQUIRED_PRODUCT_CSV_HEADERS, ...OPTIONAL_PRODUCT_CSV_HEADERS]);
    const invalidHeaders = normalizedHeaders.filter((header) => !allowedHeaders.has(header as any));

    if (invalidHeaders.length > 0) {
        throw new ValidationAppError(
            `Columnas no reconocidas en el CSV: ${invalidHeaders.join(', ')}.`
        );
    }

    const orderedHeaders = normalizedHeaders.map(normalizeHeaderForOrder);
    let lastHeaderIndex = -1;

    for (const header of orderedHeaders) {
        const currentHeaderIndex = PRODUCT_CSV_HEADER_ORDER.indexOf(header as typeof PRODUCT_CSV_HEADER_ORDER[number]);
        if (currentHeaderIndex < lastHeaderIndex) {
            throw new ValidationAppError(
                `Las columnas del CSV deben estar en este orden: ${PRODUCT_CSV_HEADER_ORDER.join(', ')}.`
            );
        }
        lastHeaderIndex = currentHeaderIndex;
    }
};

export class ProductBulkService {
    static async processBulkUpload(filePath: string, societyId: string, createdBy: string) {
        const results: ProductCsvRow[] = [];

        // 1. Read CSV
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv({
                    mapHeaders: ({ header }) => normalizeCsvHeader(header),
                }))
                .on('headers', (headers) => {
                    try {
                        validateProductCsvHeaders(headers);
                    } catch (error) {
                        reject(error);
                    }
                })
                .on('data', (data) => results.push(data))
                .on('end', resolve)
                .on('error', reject);
        });

        // Clean up file after reading
        fs.unlink(filePath, () => { });

        if (results.length === 0) {
            throw new ValidationAppError('El archivo CSV está vacío.');
        }

        // ─── 2. PARALLEL: Pre-fetch all needed data at once ─────────────
        const [society, mainBranch, categories, existingProducts] = await Promise.all([
            prisma.society.findUnique({
                where: { id: societyId },
                select: { id: true, code: true, maxProducts: true, totalProducts: true }
            }),
            prisma.branchOffice.findFirst({
                where: { societyId, isMain: true },
            }),
            prisma.category.findMany({
                where: { societyId },
            }),
            prisma.product.findMany({
                where: { societyId, isDeleted: false },
                select: { code: true }
            })
        ]);

        if (!society) throw new NotFoundAppError('Sociedad no encontrada.', { societyId });
        if (!mainBranch) {
            throw new NotFoundAppError('No se encontró una Sucursal Principal habilitada para esta sociedad.', { societyId });
        }
        // ─── 3. Validate limits ─────────────────────────────────────────
        const newProductsCount = results.length;
        if (society.totalProducts + newProductsCount > society.maxProducts) {
            throw new ValidationAppError(`Límite de productos excedido. Actualmente tienes ${society.totalProducts} productos y estás intentando subir ${newProductsCount}. El límite permitido es de ${society.maxProducts}.`);
        }

        const categoryMap = new Map(categories.map(c => [c.code, c.id]));
        const existingCodes = new Set(existingProducts.map(p => p.code));
        const seenInFile = new Set<string>();

        let processedCount = 0;
        let errors: string[] = [];

        // ─── 4. Process & Insert (Transaction) ─────────────────────────
        await prisma.$transaction(async (tx) => {
            for (const [index, row] of results.entries()) {
                const rowNum = index + 2;

                try {
                    if (!row.NombreProducto || !row.CodigoInterno || !row.CodigoCategoria) {
                        throw new Error(`Faltan datos obligatorios (Nombre, SKU, Categoría)`);
                    }

                    const sku = row.CodigoInterno.trim();

                    if (existingCodes.has(sku)) {
                        errors.push(`Fila ${rowNum}: El Código/SKU '${sku}' ya existe en el sistema.`);
                        continue;
                    }

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

                    const newProduct = await tx.product.create({
                        data: {
                            societyId,
                            name: row.NombreProducto,
                            code: row.CodigoInterno,
                            categoryId,
                            price: precioVenta,
                            priceCost: precioCosto,
                            stock: stockInicial,
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

            if (processedCount > 0) {
                await tx.society.update({
                    where: { id: societyId },
                    data: { totalProducts: { increment: processedCount } }
                });
            }
        }, {
            maxWait: 5000,
            timeout: 60000
        });

        // ─── 5. BACKGROUND: Cache Invalidation ───────────────────────────
        if (processedCount > 0) {
            const societyCode = society.code;
            setImmediate(async () => {
                try {
                    await Promise.all([
                        redis.deleteKeysByPrefix('products:'),
                        redis.deleteKeysByPrefix('branch_office_products:'),
                        redis.del(`societies:${societyId}`),
                        redis.del(`societies:${societyCode}`),
                        redis.del(`societies:code:${societyCode.toUpperCase()}`),
                        redis.deleteKeysByPrefix('societies:list:')
                    ]);
                } catch (e) {
                    console.error('[ProductBulkService] Error background cache:', e);
                }
            });
        }

        return {
            success: true,
            processed: processedCount,
            errors,
        };
    }
}
