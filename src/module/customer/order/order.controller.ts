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
    const { params } = orderIdSchema.parse({ params: req.params });

    try {
      const order = await OrderService.getById(params.id);
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
    try {
      // Validate body
      const { body } = createOrderSchema.parse({ body: req.body });

      const newOrder = await OrderService.create(body);
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
    try {
      const { params } = orderIdSchema.parse({ params: req.params });
      const { body } = updateOrderSchema.parse({ body: req.body });

      const updated = await OrderService.update(params.id, body);
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
