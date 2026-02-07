
import { Request, Response } from 'express';
import { OrderItemService } from './orderItem.service';
import {
  createOrderItemSchema,
  updateOrderItemSchema,
  orderItemFiltersSchema,
  orderItemIdSchema
} from './orderItem.schema';
import { paginationQuerySchema } from '@/schemas/pagination.schema';

export const OrderItemController = {
  create: async (req: Request, res: Response) => {
    const parse = createOrderItemSchema.safeParse({ body: req.body });
    if (!parse.success) return res.status(400).json(parse.error.format());

    try {
      const orderItem = await OrderItemService.create(parse.data.body);
      res.status(201).json(orderItem);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  },

  getAll: async (req: Request, res: Response) => {
    const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
    const filtersParse = orderItemFiltersSchema.safeParse({ query: req.query });

    if (!paginationParse.success || !filtersParse.success) {
      return res.status(400).json({
        ...(paginationParse.error?.format?.() ?? {}),
        ...(filtersParse.error?.format?.() ?? {})
      });
    }

    try {
      const result = await OrderItemService.getAll(
        paginationParse.data.query,
        filtersParse.data.query
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  },

  getById: async (req: Request, res: Response) => {
    const parse = orderItemIdSchema.safeParse({ params: req.params });
    if (!parse.success) return res.status(400).json(parse.error.format());

    try {
      const item = await OrderItemService.getById(parse.data.params.id);
      if (!item) return res.status(404).json({ message: 'Order item not found' });
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  },

  update: async (req: Request, res: Response) => {
    const idParse = orderItemIdSchema.safeParse({ params: req.params });
    const bodyParse = updateOrderItemSchema.safeParse({ body: req.body });

    if (!idParse.success || !bodyParse.success) {
      return res.status(400).json({
        ...(idParse.error?.format?.() ?? {}),
        ...(bodyParse.error?.format?.() ?? {})
      });
    }

    try {
      const item = await OrderItemService.update(idParse.data.params.id, bodyParse.data.body);
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  },

  delete: async (req: Request, res: Response) => {
    const parse = orderItemIdSchema.safeParse({ params: req.params });
    if (!parse.success) return res.status(400).json(parse.error.format());

    try {
      await OrderItemService.delete(parse.data.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  },
};
