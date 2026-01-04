import { Request, Response } from 'express'
import * as service from './externalConsignmentSale.service'
import { createExternalConsignmentSaleSchema, updateExternalConsignmentSaleSchema } from './externalConsignmentSale.validation'

export const create = async (req: Request, res: Response) => {
  const parsed = createExternalConsignmentSaleSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const externalConsignmentSale = await service.createExternalConsignmentSale(parsed.data as any)
  return res.status(201).json(externalConsignmentSale)
}

export const getAll = async (_req: Request, res: Response) => {
  const data = await service.getAllExternalConsignmentSales()
  return res.json(data)
}

export const getById = async (req: Request, res: Response) => {
  const { id } = req.params
  const data = await service.getExternalConsignmentSaleById(id)
  if (!data) return res.status(404).json({ error: 'ExternalConsignmentSale not found' })
  return res.json(data)
}

export const update = async (req: Request, res: Response) => {
  const { id } = req.params
  const parsed = updateExternalConsignmentSaleSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const exists = await service.getExternalConsignmentSaleById(id)
  if (!exists) return res.status(404).json({ error: 'ExternalConsignmentSale not found' })

  const updated = await service.updateExternalConsignmentSale(id, parsed.data)
  return res.json(updated)
}

export const remove = async (req: Request, res: Response) => {
  const { id } = req.params
  const exists = await service.getExternalConsignmentSaleById(id)
  if (!exists) return res.status(404).json({ error: 'ExternalConsignmentSale not found' })

  await service.deleteExternalConsignmentSale(id)
  return res.status(204).send()
}
