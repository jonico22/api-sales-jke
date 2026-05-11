import { Request, Response } from 'express'
import * as service from './purchase.service'
import {
  createPurchaseSchema,
  updatePurchaseSchema,
  purchaseIdSchema,
  purchaseFiltersSchema,
} from './purchase.schema' // [FIXED]
import { paginationQuerySchema } from '@/schemas/pagination.schema'
import { asyncHandler } from '@/utils/asyncHandler'
import { formatSafeParseErrors } from '@/utils/controller-helpers'

export const getAll = asyncHandler(async (req: Request, res: Response) => {
  const paginationParse = paginationQuerySchema.safeParse({ query: req.query })
  const filtersParse = purchaseFiltersSchema.safeParse({ query: req.query })

  if (!paginationParse.success || !filtersParse.success) {
    return res.status(400).json(formatSafeParseErrors(paginationParse, filtersParse))
  }

  const purchases = await service.getAllPurchases(
    paginationParse.data.query,
    filtersParse.data.query
  )
  res.json(purchases)
})

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { params } = purchaseIdSchema.parse({ params: req.params })
  const purchase = await service.getPurchaseById(params.id)
  if (!purchase) return res.status(404).json({ message: 'Purchase not found' })
  res.json(purchase)
})

export const create = asyncHandler(async (req: Request, res: Response) => {
  const { body } = createPurchaseSchema.parse({ body: req.body })
  const newPurchase = await service.createPurchase(body)
  res.status(201).json(newPurchase)
})

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { params } = purchaseIdSchema.parse({ params: req.params })
  const { body } = updatePurchaseSchema.parse({ body: req.body })
  const updated = await service.updatePurchase(params.id, body)
  res.json(updated)
})

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { params } = purchaseIdSchema.parse({ params: req.params })
  const deleted = await service.deletePurchase(params.id, req.body.updatedBy)
  res.json({ message: 'Deleted successfully', deleted })
})
