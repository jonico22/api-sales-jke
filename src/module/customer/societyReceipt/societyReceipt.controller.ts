import { Request, Response } from 'express'
import * as societyReceiptService from './societyReceipt.service'

export const create = async (req: Request, res: Response) => {
  const data = await societyReceiptService.createSocietyReceipt(req.body)
  res.json(data)
}

export const getAll = async (_req: Request, res: Response) => {
  const data = await societyReceiptService.getAllSocietyReceipts()
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
