import { Request, Response } from 'express'
import * as service from './purchase.service'
import {
  createPurchaseSchema,
  updatePurchaseSchema,
  purchaseIdSchema,
} from './purchase.validation'

export const getAll = async (req: Request, res: Response) => {
  const purchases = await service.getAllPurchases()
  res.json(purchases)
}

export const getById = async (req: Request, res: Response) => {
  const { id } = purchaseIdSchema.parse(req.params)
  const purchase = await service.getPurchaseById(id)
  if (!purchase) return res.status(404).json({ message: 'Purchase not found' })
  res.json(purchase)
}

export const create = async (req: Request, res: Response) => {
  const data = createPurchaseSchema.parse(req.body)
  const newPurchase = await service.createPurchase(data)
  res.status(201).json(newPurchase)
}

export const update = async (req: Request, res: Response) => {
  const { id } = purchaseIdSchema.parse(req.params)
  const data = updatePurchaseSchema.parse(req.body)
  const updated = await service.updatePurchase(id, data)
  res.json(updated)
}

export const remove = async (req: Request, res: Response) => {
  const { id } = purchaseIdSchema.parse(req.params)
  const deleted = await service.deletePurchase(id, req.body.updatedBy)
  res.json({ message: 'Deleted successfully', deleted })
}
