import { Request, Response } from 'express'
import * as service from './purchaseDetail.service'
import {
  createPurchaseDetailSchema,
  updatePurchaseDetailSchema,
  purchaseDetailIdSchema,
  purchaseDetailFiltersSchema,
} from './purchaseDetail.validation'

import { paginationQuerySchema } from '@/schemas/pagination.schema'

export const getAll = async (req: Request, res: Response) => {
  const paginationParse = paginationQuerySchema.safeParse({ query: req.query })
  const filtersParse = purchaseDetailFiltersSchema.safeParse({ query: req.query })

  if (!paginationParse.success || !filtersParse.success) {
    return res.status(400).json({
      ...(paginationParse.error?.format?.() ?? {}),
      ...(filtersParse.error?.format?.() ?? {}),
    })
  }

  const purchaseDetails = await service.getAllPurchaseDetails(
    paginationParse.data.query,
    filtersParse.data.query
  )
  res.json(purchaseDetails)
}

export const getById = async (req: Request, res: Response) => {
  const { id } = purchaseDetailIdSchema.parse(req.params)
  const detail = await service.getPurchaseDetailById(id)
  if (!detail) return res.status(404).json({ message: 'PurchaseDetail not found' })
  res.json(detail)
}

export const create = async (req: Request, res: Response) => {
  try {
    const data = createPurchaseDetailSchema.parse(req.body)
    const newDetail = await service.createPurchaseDetail(data)
    res.status(201).json(newDetail)
  } catch (error: any) {
    res.status(500).json({ message: 'Error creando detalle de compra', error: error.message })
  }
}

export const update = async (req: Request, res: Response) => {
  try {
    const { id } = purchaseDetailIdSchema.parse(req.params)
    const data = updatePurchaseDetailSchema.parse(req.body)
    const updated = await service.updatePurchaseDetail(id, data)
    res.json(updated)
  } catch (error: any) {
    res.status(500).json({ message: 'Error actualizando detalle', error: error.message })
  }
}

export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = purchaseDetailIdSchema.parse(req.params)
    await service.deletePurchaseDetail(id)
    res.json({ message: 'Deleted successfully' })
  } catch (error: any) {
    res.status(500).json({ message: 'Error eliminando detalle', error: error.message })
  }
}
