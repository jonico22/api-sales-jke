
import { Request, Response } from 'express'
import { OrderPaymentService } from './orderPayment.service'
import {
  createOrderPaymentSchema,
  updateOrderPaymentSchema,
  paymentFiltersSchema,
  paymentIdSchema
} from './orderPayment.schema';
import { paginationQuerySchema } from '@/schemas/pagination.schema';
import { asyncHandler } from '@/utils/asyncHandler';
import { formatSafeParseErrors } from '@/utils/controller-helpers';

export const OrderPaymentController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const parse = createOrderPaymentSchema.safeParse({ body: req.body });
    if (!parse.success) return res.status(400).json(parse.error.format());

    const payment = await OrderPaymentService.create(parse.data.body)
    res.status(201).json(payment)
  }),

  getAll: asyncHandler(async (req: Request, res: Response) => {
    const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
    const filtersParse = paymentFiltersSchema.safeParse({ query: req.query });

    if (!paginationParse.success || !filtersParse.success) {
      return res.status(400).json(formatSafeParseErrors(paginationParse, filtersParse));
    }

    const payments = await OrderPaymentService.getAll(
      paginationParse.data.query,
      filtersParse.data.query
    );
    res.json(payments)
  }),

  findById: asyncHandler(async (req: Request, res: Response) => {
    const parse = paymentIdSchema.safeParse({ params: req.params });
    if (!parse.success) return res.status(400).json(parse.error.format());

    const payment = await OrderPaymentService.findById(parse.data.params.id)
    if (!payment) return res.status(404).json({ error: 'Order payment not found' })
    res.json(payment)
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const idParse = paymentIdSchema.safeParse({ params: req.params });
    const bodyParse = updateOrderPaymentSchema.safeParse({ body: req.body });

    if (!idParse.success || !bodyParse.success) {
      return res.status(400).json(formatSafeParseErrors(idParse, bodyParse));
    }

    const payment = await OrderPaymentService.update(idParse.data.params.id, bodyParse.data.body)
    res.json(payment)
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const parse = paymentIdSchema.safeParse({ params: req.params });
    if (!parse.success) return res.status(400).json(parse.error.format());

    await OrderPaymentService.delete(parse.data.params.id)
    res.status(204).send()
  }),
}
