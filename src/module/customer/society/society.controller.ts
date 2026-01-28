import { Request, Response } from 'express';
import * as service from './society.service';
import { createSocietySchema, updateSocietySchema, societyIdSchema } from './society.validation';

export const create = async (req: Request, res: Response) => {
  const parse = createSocietySchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json(parse.error.format());

  const newSociety = await service.createSociety(parse.data);
  res.status(201).json(newSociety);
};

export const findAll = async (_: Request, res: Response) => {
  const societies = await service.getAllSocieties();
  res.json(societies);
};

export const findOne = async (req: Request, res: Response) => {
  const parse = societyIdSchema.safeParse(req.params);
  if (!parse.success) return res.status(400).json(parse.error.format());

  const society = await service.getSocietyById(parse.data.id);
  if (!society) return res.status(404).json({ message: 'Society not found' });
  console.log(society,'creo')
  res.json(society);
};

export const update = async (req: Request, res: Response) => {
  const idParse = societyIdSchema.safeParse(req.params);
  const bodyParse = updateSocietySchema.safeParse(req.body);
  if (!idParse.success || !bodyParse.success)
    return res.status(400).json({ ...(idParse.error?.format?.() ?? {}), ...(bodyParse.error?.format?.() ?? {}) });

  const updated = await service.updateSociety(idParse.data.id, bodyParse.data);
  res.json(updated);
};

export const remove = async (req: Request, res: Response) => {
  const parse = societyIdSchema.safeParse(req.params);
  if (!parse.success) return res.status(400).json(parse.error.format());

  await service.deleteSociety(parse.data.id);
  res.status(204).send();
};
