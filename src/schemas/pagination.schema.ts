import { z } from 'zod';
import { PAGINATION_DEFAULTS } from '@/utils/pagination';

/**
 * Schema para validar query parameters de paginación
 * Uso: paginationQuerySchema.parse({ query: req.query })
 */
export const paginationQuerySchema = z.object({
    query: z.object({
        // Página actual (acepta string o number)
        page: z.coerce
            .number()
            .int()
            .positive()
            .default(PAGINATION_DEFAULTS.PAGE),

        // Límite de items por página
        limit: z.coerce
            .number()
            .int()
            .positive()
            .max(PAGINATION_DEFAULTS.MAX_LIMIT, {
                message: `Límite máximo es ${PAGINATION_DEFAULTS.MAX_LIMIT}`,
            })
            .default(PAGINATION_DEFAULTS.LIMIT),

        // Campo por el cual ordenar (opcional)
        sortBy: z.string().optional(),

        // Orden ascendente o descendente
        sortOrder: z
            .enum(['asc', 'desc'])
            .optional(),
    }),
});

/**
 * Tipo inferido del schema de paginación
 */
export type PaginationQuery = z.infer<typeof paginationQuerySchema>['query'];
