import { Request, Response } from 'express'
import { orderService } from './order.service'
import { createOrderSchema, updateOrderSchema, orderFiltersSchema } from './order.validation'

export const orderController = {
  create: async (req: Request, res: Response) => {
    const parse = createOrderSchema.safeParse({ body: req.body });
    if (!parse.success) return res.status(400).json(parse.error.format());

    try {
      const order = await orderService.create(parse.data.body)
      res.status(201).json(order)
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: 'An unknown error occurred' });
      }
    }
  },

  findAll: async (req: Request, res: Response) => {
    const parse = orderFiltersSchema.safeParse({ query: req.query });
    if (!parse.success) return res.status(400).json(parse.error.format());

    try {
      const filters = parse.data.query;
      const orders = await orderService.findAll(filters as any) // Casting as internal type is clearer in service
      res.json(orders)
    } catch (error) {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
  },

  findById: async (req: Request, res: Response) => {
    try {
      const order = await orderService.findById(req.params.id)
      if (!order) return res.status(404).json({ error: 'Order not found' })
      res.json(order)
    } catch (error) {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
  },

  update: async (req: Request, res: Response) => {
    const parse = updateOrderSchema.safeParse({ body: req.body });
    if (!parse.success) return res.status(400).json(parse.error.format());

    try {
      const order = await orderService.update(req.params.id, parse.data.body)
      res.json(order)
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: 'An unknown error occurred' });
      }
    }
  },

  delete: async (req: Request, res: Response) => {
    try {
      await orderService.delete(req.params.id)
      res.status(204).send()
    } catch (error) {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
  },
}
