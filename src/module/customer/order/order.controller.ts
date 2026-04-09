import { Request, Response } from 'express';
import { OrderService } from './order.service';
import {
  createOrderSchema,
  updateOrderSchema,
  orderFiltersSchema,
  orderIdSchema
} from './order.schema';
import { paginationQuerySchema } from '@/schemas/pagination.schema';
import { formatSafeParseErrors } from '@/utils/controller-helpers';
import { asyncHandler } from '@/utils/asyncHandler';
import { formatToLimaTime, toLimaTimezone } from '@/utils/dateFormatter';

const REPORT_DEFAULT_DAYS = 30;
const REPORT_MAX_DETAILED_DAYS = 31;

const normalizeReportFilters = (filters: Record<string, any>) => {
  const normalized = { ...filters };
  const reportMode = normalized.reportMode || 'detailed';
  const limaToday = toLimaTimezone(new Date());

  const endDate = normalized.dateTo
    ? toLimaTimezone(normalized.dateTo)
    : limaToday;

  if (!normalized.dateFrom && !normalized.dateTo) {
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - REPORT_DEFAULT_DAYS);
    normalized.dateFrom = formatToLimaTime(startDate, 'yyyy-MM-dd');
    normalized.dateTo = formatToLimaTime(endDate, 'yyyy-MM-dd');
  } else if (!normalized.dateFrom && normalized.dateTo) {
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - REPORT_DEFAULT_DAYS);
    normalized.dateFrom = formatToLimaTime(startDate, 'yyyy-MM-dd');
  } else if (normalized.dateFrom && !normalized.dateTo) {
    normalized.dateTo = formatToLimaTime(endDate, 'yyyy-MM-dd');
  }

  if (!normalized.societyId && !normalized.societyCode) {
    return {
      ok: false,
      status: 400,
      body: { message: 'El reporte requiere societyId o societyCode.' }
    } as const;
  }

  if (reportMode === 'detailed' && normalized.dateFrom && normalized.dateTo) {
    const from = toLimaTimezone(normalized.dateFrom);
    const to = toLimaTimezone(normalized.dateTo);
    const diffMs = Math.abs(to.getTime() - from.getTime());
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

    if (diffDays > REPORT_MAX_DETAILED_DAYS) {
      return {
        ok: false,
        status: 422,
        body: {
          message: `El reporte detallado permite un rango maximo de ${REPORT_MAX_DETAILED_DAYS} dias.`
        }
      } as const;
    }
  }

  return {
    ok: true,
    filters: normalized,
  } as const;
};

export const OrderController = {
  /**
   * GET /api/orders/report
   */
  getReport: asyncHandler(async (req: Request, res: Response) => {
    // Reutilizamos el schema de filtros (sin paginación obligatoria)
    const filtersParse = orderFiltersSchema.safeParse({ query: req.query });

    if (!filtersParse.success) {
      return res.status(400).json(filtersParse.error.format());
    }

    const normalizedResult = normalizeReportFilters(filtersParse.data.query);
    if (!normalizedResult.ok) {
      return res.status(normalizedResult.status).json(normalizedResult.body);
    }

    const { reportQueue } = await import('@/config/queue');
    const userId = (req as any).user?.id || 'system';
    const societyId = normalizedResult.filters.societyCode
      ? undefined
      : normalizedResult.filters.societyId;

    await reportQueue.add('generate-excel', {
      filters: normalizedResult.filters,
      userId,
      societyId: societyId || normalizedResult.filters.societyId
    });

    res.status(202).json({
      message: 'La generación del reporte ha comenzado. Se le notificará cuando esté listo.'
    });
  }),

  /**
   * GET /api/orders
   */
  getAll: asyncHandler(async (req: Request, res: Response) => {
    const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
    const filtersParse = orderFiltersSchema.safeParse({ query: req.query });

    if (!paginationParse.success || !filtersParse.success) {
      return res.status(400).json(formatSafeParseErrors(paginationParse, filtersParse));
    }

    const result = await OrderService.getAll(
      paginationParse.data.query,
      filtersParse.data.query
    );
    res.json(result);
  }),

  /**
   * GET /api/orders/:id
   */
  getById: asyncHandler(async (req: Request, res: Response) => {
    const parse = orderIdSchema.safeParse({ params: req.params });
    if (!parse.success) return res.status(400).json(parse.error.format());

    const order = await OrderService.getById(parse.data.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  }),

  /**
   * POST /api/orders
   */
  create: asyncHandler(async (req: Request, res: Response) => {
    // Validate body
    const parse = createOrderSchema.safeParse({ body: req.body });
    if (!parse.success) {
      return res.status(400).json(parse.error.format());
    }

    const newOrder = await OrderService.create(parse.data.body);
    res.status(201).json(newOrder);
  }),

  /**
   * PUT /api/orders/:id
   */
  update: asyncHandler(async (req: Request, res: Response) => {
    const paramsParse = orderIdSchema.safeParse({ params: req.params });
    const bodyParse = updateOrderSchema.safeParse({ body: req.body });

    if (!paramsParse.success || !bodyParse.success) {
      return res.status(400).json(formatSafeParseErrors(paramsParse, bodyParse));
    }

    const updated = await OrderService.update(
      paramsParse.data.params.id,
      bodyParse.data.body
    );
    res.json(updated);
  }),

  /**
   * DELETE /api/orders/:id
   */
  delete: asyncHandler(async (req: Request, res: Response) => {
    const { params } = orderIdSchema.parse({ params: req.params });
    await OrderService.delete(params.id);
    res.status(204).send();
  })
};
