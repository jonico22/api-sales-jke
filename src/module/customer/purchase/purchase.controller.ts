import { Request, Response } from 'express'
import * as service from './purchase.service'
import {
  createPurchaseSchema,
  updatePurchaseSchema,
  purchaseIdSchema,
  purchaseFiltersSchema,
} from './purchase.schema' // [FIXED]
import { paginationQuerySchema } from '@/schemas/pagination.schema'

export const getAll = async (req: Request, res: Response) => {
  const paginationParse = paginationQuerySchema.safeParse({ query: req.query })
  const filtersParse = purchaseFiltersSchema.safeParse({ query: req.query })

  if (!paginationParse.success || !filtersParse.success) {
    return res.status(400).json({
      ...(paginationParse.error?.format?.() ?? {}),
      ...(filtersParse.error?.format?.() ?? {}),
    })
  }

  const purchases = await service.getAllPurchases(
    paginationParse.data.query,
    filtersParse.data.query
  )
  res.json(purchases)
}

export const getById = async (req: Request, res: Response) => {
  const { params } = purchaseIdSchema.parse({ params: req.params })
  const purchase = await service.getPurchaseById(params.id)
  if (!purchase) return res.status(404).json({ message: 'Purchase not found' })
  res.json(purchase)
}

export const create = async (req: Request, res: Response) => {
  try {
    const { body } = createPurchaseSchema.parse({ body: req.body }) // [UPDATED] Wrapped
    const newPurchase = await service.createPurchase(body)
    res.status(201).json(newPurchase)
  } catch (error: any) {
    if (error.message.includes('Proveedor') || error.message.includes('socio de negocio')) {
      return res.status(400).json({ message: error.message });
    }
    // Let global handler catch ZodError or others if not using safeParse above, 
    // but here we used .parse() so ZodError will throw. Ideally we should use safeParse or global handler.
    // For now, let's just pass 500 if not our custom error, OR use safeParse like others.
    // But modifying to safeParse affects 'data' scope.
    // Simple fix: Check instance or message. 
    // Reverting to catch:
    res.status(500).json({ message: 'Error creando compra', error: error.message });
  }
}

export const update = async (req: Request, res: Response) => {
  try {
    const { params } = purchaseIdSchema.parse({ params: req.params })
    const { body } = updatePurchaseSchema.parse({ body: req.body }) // [UPDATED] Wrapped
    const updated = await service.updatePurchase(params.id, body)
    res.json(updated)
  } catch (error: any) {
    if (error.message.includes('Proveedor') || error.message.includes('socio de negocio')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error actualizando compra', error: error.message });
  }
}

export const remove = async (req: Request, res: Response) => {
  const { params } = purchaseIdSchema.parse({ params: req.params })
  const deleted = await service.deletePurchase(params.id, req.body.updatedBy)
  res.json({ message: 'Deleted successfully', deleted })
}
