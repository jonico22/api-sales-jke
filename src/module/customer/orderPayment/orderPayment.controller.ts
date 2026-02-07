import { Request, Response } from 'express'
import { orderPaymentService } from './orderPayment.service'
import {
  createOrderPaymentSchema,
  updateOrderPaymentSchema,
  paymentFiltersSchema,
  paymentIdSchema
} from './orderPayment.schema';

export const orderPaymentController = {
  create: async (req: Request, res: Response) => {
    try {
      const { body } = createOrderPaymentSchema.parse({ body: req.body }); // [NEW] Validation
      const payment = await orderPaymentService.create(body)
      res.status(201).json(payment)
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
      const filters = paymentFiltersSchema.parse({ query: req.query }).query // [NEW] Validation
      const payments = await orderPaymentService.findAll(filters)
      res.json(payments)
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
      const { params } = paymentIdSchema.parse({ params: req.params }); // [NEW] Validation
      const payment = await orderPaymentService.findById(params.id)
      if (!payment) return res.status(404).json({ error: 'Order payment not found' })
      res.json(payment)
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
      const { params } = paymentIdSchema.parse({ params: req.params });
      const { body } = updateOrderPaymentSchema.parse({ body: req.body }); // [NEW] Validation
      const payment = await orderPaymentService.update(params.id, body)
      res.json(payment)
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
      const { params } = paymentIdSchema.parse({ params: req.params });
      await orderPaymentService.delete(params.id)
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
