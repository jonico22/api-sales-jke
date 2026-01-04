import { Request, Response } from 'express'
import { orderItemService } from './orderItem.service'

export const orderItemController = {
  create: async (req: Request, res: Response) => {
    try {
      const orderItem = await orderItemService.create(req.body)
      res.status(201).json(orderItem)
    } catch (error) {
      if (error instanceof Error) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(400).json({ error: 'An unknown error occurred' });
    }
    }
  },

  findAll: async (req: Request, res: Response) => {
    try {
      const filters = req.query
      const items = await orderItemService.findAll(filters)
      res.json(items)
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
      const item = await orderItemService.findById(req.params.id)
      if (!item) return res.status(404).json({ error: 'Order item not found' })
      res.json(item)
    } catch (error) {
      if (error instanceof Error) {
      res.status(500).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'An unknown error occurred' });
    }
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const item = await orderItemService.update(req.params.id, req.body)
      res.json(item)
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
      await orderItemService.delete(req.params.id)
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
