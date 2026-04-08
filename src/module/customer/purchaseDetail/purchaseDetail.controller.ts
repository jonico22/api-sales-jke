import { Request, Response } from 'express'
import * as service from './purchaseDetail.service'
import {
  createPurchaseDetailSchema,
  updatePurchaseDetailSchema,
  purchaseDetailIdSchema,
  purchaseDetailFiltersSchema,
} from './purchaseDetail.schema'

import { paginationQuerySchema } from '@/schemas/pagination.schema'
import { asyncHandler } from '@/utils/asyncHandler'
import { formatSafeParseErrors } from '@/utils/controller-helpers'

export const getAll = asyncHandler(async (req: Request, res: Response) => {
  const paginationParse = paginationQuerySchema.safeParse({ query: req.query })
  const filtersParse = purchaseDetailFiltersSchema.safeParse({ query: req.query })

  if (!paginationParse.success || !filtersParse.success) {
    return res.status(400).json(formatSafeParseErrors(paginationParse, filtersParse))
  }

  const purchaseDetails = await service.getAllPurchaseDetails(
    paginationParse.data.query,
    filtersParse.data.query
  )
  res.json(purchaseDetails)
})

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = purchaseDetailIdSchema.parse(req.params)
  const detail = await service.getPurchaseDetailById(id)
  if (!detail) return res.status(404).json({ message: 'PurchaseDetail not found' })
  res.json(detail)
})

export const create = asyncHandler(async (req: Request, res: Response) => {
  const data = createPurchaseDetailSchema.parse(req.body)
  const newDetail = await service.createPurchaseDetail(data)
  res.status(201).json(newDetail)
})

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = purchaseDetailIdSchema.parse(req.params)
  const data = updatePurchaseDetailSchema.parse(req.body)
  const updated = await service.updatePurchaseDetail(id, data)
  res.json(updated)
})

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { id } = purchaseDetailIdSchema.parse(req.params)
  await service.deletePurchaseDetail(id)
  res.json({ message: 'Deleted successfully' })
})
