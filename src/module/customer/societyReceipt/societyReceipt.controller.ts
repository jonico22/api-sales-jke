import { Request, Response } from 'express'
import * as societyReceiptService from './societyReceipt.service'
import { societyReceiptFiltersSchema } from './societyReceipt.validation'

export const create = async (req: Request, res: Response) => {
  const data = await societyReceiptService.createSocietyReceipt(req.body)
  res.json(data)
}

export const getAll = async (req: Request, res: Response) => {
  const pagination = {
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 10,
    sortBy: req.query.sortBy as string,
    sortOrder: req.query.sortOrder as 'asc' | 'desc'
  };
  const filters = societyReceiptFiltersSchema.parse(req.query);

  const data = await societyReceiptService.getAllSocietyReceipts(pagination, filters)
  res.json(data)
}

export const getById = async (req: Request, res: Response) => {
  const data = await societyReceiptService.getSocietyReceiptById(req.params.id)
  if (!data) return res.status(404).json({ message: 'SocietyReceipt not found' })
  res.json(data)
}

export const update = async (req: Request, res: Response) => {
  const data = await societyReceiptService.updateSocietyReceipt(req.params.id, req.body)
  res.json(data)
}

export const remove = async (req: Request, res: Response) => {
  await societyReceiptService.deleteSocietyReceipt(req.params.id)
  res.status(204).send()
}
