import { Request, Response } from 'express'
import * as service from './purchaseDetail.service'
import {
  createPurchaseDetailSchema,
  updatePurchaseDetailSchema,
  purchaseDetailIdSchema,
} from './purchaseDetail.validation'

export const getAll = async (req: Request, res: Response) => {
  const details = await service.getAllPurchaseDetails()
  res.json(details)
}

export const getById = async (req: Request, res: Response) => {
  const { id } = purchaseDetailIdSchema.parse(req.params)
  const detail = await service.getPurchaseDetailById(id)
  if (!detail) return res.status(404).json({ message: 'PurchaseDetail not found' })
  res.json(detail)
}

export const create = async (req: Request, res: Response) => {
  const data = createPurchaseDetailSchema.parse(req.body)
  const newDetail = await service.createPurchaseDetail(data)
  res.status(201).json(newDetail)
}

export const update = async (req: Request, res: Response) => {
  const { id } = purchaseDetailIdSchema.parse(req.params)
  const data = updatePurchaseDetailSchema.parse(req.body)
  const updated = await service.updatePurchaseDetail(id, data)
  res.json(updated)
}

export const remove = async (req: Request, res: Response) => {
  const { id } = purchaseDetailIdSchema.parse(req.params)
  await service.deletePurchaseDetail(id)
  res.json({ message: 'Deleted successfully' })
}
