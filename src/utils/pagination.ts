/**
 * Utilidades de paginación reutilizables para Prisma
 */

// ============================================================================
// TIPOS
// ============================================================================

/**
 * Parámetros de entrada para paginación
 */
export interface PaginationParams {
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

/**
 * Query parameters parseados (después de validación Zod)
 */
export interface PaginationQuery {
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

/**
 * Parámetros calculados para Prisma
 */
export interface PrismaPaginationParams {
    skip: number;
    take: number;
    orderBy?: Record<string, 'asc' | 'desc'>;
}

/**
 * Metadata de paginación en la respuesta
 */
export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}

/**
 * Resultado paginado genérico
 */
export interface PaginatedResult<T> {
    data: T[];
    pagination: PaginationMeta;
}

// ============================================================================
// CONSTANTES
// ============================================================================

export const PAGINATION_DEFAULTS = {
    PAGE: 1,
    LIMIT: 10,
    MAX_LIMIT: 100,
    SORT_ORDER: 'asc' as const,
} as const;

// ============================================================================
// FUNCIONES
// ============================================================================

/**
 * Calcula los parámetros skip y take para Prisma
 * @param page - Número de página (1-indexed)
 * @param limit - Items por página
 * @returns Objeto con skip, take y orderBy para Prisma
 */
export const getPrismaPaginationParams = (
    page: number,
    limit: number,
    sortBy?: string,
    sortOrder: 'asc' | 'desc' = PAGINATION_DEFAULTS.SORT_ORDER
): PrismaPaginationParams => {
    // Validar y normalizar valores
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), PAGINATION_DEFAULTS.MAX_LIMIT);

    const skip = (safePage - 1) * safeLimit;
    const take = safeLimit;

    const params: PrismaPaginationParams = {
        skip,
        take,
    };

    // Agregar ordenamiento si se especifica
    if (sortBy) {
        params.orderBy = { [sortBy]: sortOrder };
    }

    return params;
};

/**
 * Construye la metadata de paginación para la respuesta
 * @param page - Página actual
 * @param limit - Items por página
 * @param total - Total de items en BD
 * @returns Metadata de paginación
 */
export const buildPaginationMeta = (
    page: number,
    limit: number,
    total: number
): PaginationMeta => {
    const totalPages = Math.ceil(total / limit);

    return {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
    };
};

/**
 * Construye un resultado paginado completo
 * @param data - Array de datos
 * @param page - Página actual
 * @param limit - Items por página
 * @param total - Total de items
 * @returns Resultado con data y metadata de paginación
 */
export const buildPaginatedResult = <T>(
    data: T[],
    page: number,
    limit: number,
    total: number
): PaginatedResult<T> => {
    return {
        data,
        pagination: buildPaginationMeta(page, limit, total),
    };
};
