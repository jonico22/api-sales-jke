import { Request, Response } from 'express';
import { OrderService } from './order.service';
import {
  createOrderSchema,
  updateOrderSchema,
  orderFiltersSchema,
  orderIdSchema
} from './order.schema';
import { paginationQuerySchema } from '@/schemas/pagination.schema';

export const OrderController = {
  /**
   * GET /api/orders/report
   */
  getReport: async (req: Request, res: Response) => {
    // Reutilizamos el schema de filtros (sin paginación obligatoria)
    const filtersParse = orderFiltersSchema.safeParse({ query: req.query });

    if (!filtersParse.success) {
      return res.status(400).json(filtersParse.error.format());
    }

    try {
      // En lugar de generar sincrónicamente, encolamos el trabajo
      // await OrderService.getReport(filtersParse.data.query);

      const { reportQueue } = await import('@/config/queue');
      const userId = (req as any).user?.id || 'system'; // Ajustar según tu auth middleware
      const societyId = filtersParse.data.query.societyCode
        ? undefined // Si es code, el worker lo resuelve, pero idealmente pasamos ID si lo tenemos
        : filtersParse.data.query.societyId;

      await reportQueue.add('generate-excel', {
        filters: filtersParse.data.query,
        userId,
        societyId: societyId || filtersParse.data.query.societyId // Fallback
      });

      res.status(202).json({
        message: 'La generación del reporte ha comenzado. Se le notificará cuando esté listo.'
      });

    } catch (error: any) {
      console.error(error);
      res.status(500).json({ message: 'Error iniciando reporte', error: error.message });
    }
  },

  /**
   * GET /api/orders
   */
  getAll: async (req: Request, res: Response) => {
    const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
    const filtersParse = orderFiltersSchema.safeParse({ query: req.query });

    if (!paginationParse.success || !filtersParse.success) {
      return res.status(400).json({
        ...(paginationParse.error?.format?.() ?? {}),
        ...(filtersParse.error?.format?.() ?? {})
      });
    }

    try {
      const result = await OrderService.getAll(
        paginationParse.data.query,
        filtersParse.data.query
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: 'Error retrieving orders', error: error.message });
    }
  },

  /**
   * GET /api/orders/:id
   */
  getById: async (req: Request, res: Response) => {
    const parse = orderIdSchema.safeParse({ params: req.params });
    if (!parse.success) return res.status(400).json(parse.error.format());

    try {
      const order = await OrderService.getById(parse.data.params.id);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      res.json(order);
    } catch (error: any) {
      res.status(500).json({ message: 'Error retrieving order', error: error.message });
    }
  },

  /**
   * POST /api/orders
   */
  create: async (req: Request, res: Response) => {
    // Validate body
    const parse = createOrderSchema.safeParse({ body: req.body });
    if (!parse.success) {
      return res.status(400).json(parse.error.format());
    }

    try {
      const newOrder = await OrderService.create(parse.data.body);
      res.status(201).json(newOrder);
    } catch (error: any) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: 'Error creating order', error: error.message });
    }
  },

  /**
   * PUT /api/orders/:id
   */
  update: async (req: Request, res: Response) => {
    const paramsParse = orderIdSchema.safeParse({ params: req.params });
    const bodyParse = updateOrderSchema.safeParse({ body: req.body });

    if (!paramsParse.success || !bodyParse.success) {
      return res.status(400).json({
        ...(paramsParse.error?.format?.() ?? {}),
        ...(bodyParse.error?.format?.() ?? {})
      });
    }

    try {
      const updated = await OrderService.update(
        paramsParse.data.params.id,
        bodyParse.data.body
      );
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: 'Error updating order', error: error.message });
    }
  },

  /**
   * DELETE /api/orders/:id
   */
  delete: async (req: Request, res: Response) => {
    try {
      const { params } = orderIdSchema.parse({ params: req.params });
      await OrderService.delete(params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: 'Error cancelling order', error: error.message });
    }
  }
};
