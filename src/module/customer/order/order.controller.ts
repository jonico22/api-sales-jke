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

    const { reportQueue } = await import('@/config/queue');
    const userId = (req as any).user?.id || 'system';
    const societyId = filtersParse.data.query.societyCode
      ? undefined
      : filtersParse.data.query.societyId;

    await reportQueue.add('generate-excel', {
      filters: filtersParse.data.query,
      userId,
      societyId: societyId || filtersParse.data.query.societyId
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
