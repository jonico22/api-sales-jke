import { Request, Response } from 'express';
import { SocietyService } from './society.service';
import { createSocietySchema, updateSocietySchema, societyIdSchema, societyFiltersSchema } from './society.validation';
import { paginationQuerySchema } from '@/schemas/pagination.schema';
import { asyncHandler } from '@/utils/asyncHandler';
import { formatSafeParseErrors } from '@/utils/controller-helpers';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const parse = createSocietySchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json(parse.error.format());

  const newSociety = await SocietyService.create(parse.data);
  res.status(201).json(newSociety);
});

export const findAll = asyncHandler(async (req: Request, res: Response) => {
  const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
  const filtersParse = societyFiltersSchema.safeParse({ query: req.query });

  if (!paginationParse.success || !filtersParse.success) {
    return res.status(400).json(formatSafeParseErrors(paginationParse, filtersParse));
  }

  const result = await SocietyService.getAll(
    paginationParse.data.query,
    filtersParse.data.query
  );
  res.json(result);
});

export const findOne = asyncHandler(async (req: Request, res: Response) => {

  const parse = societyIdSchema.safeParse(req.params);
  if (!parse.success) return res.status(400).json(parse.error.format());

  const society = await SocietyService.getByCode(parse.data.code);
  if (!society) return res.status(404).json({ message: 'Society not found' });
  res.json(society);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const idParse = societyIdSchema.safeParse(req.params);
  const bodyParse = updateSocietySchema.safeParse(req.body);
  if (!idParse.success || !bodyParse.success)
    return res.status(400).json(formatSafeParseErrors(idParse, bodyParse));

  const updated = await SocietyService.update(idParse.data.code, bodyParse.data);
  res.json(updated);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const parse = societyIdSchema.safeParse(req.params);
  if (!parse.success) return res.status(400).json(parse.error.format());

  await SocietyService.delete(parse.data.code);
  res.status(204).send();
});

export const current = asyncHandler(async (req: any, res: Response) => {
  const queryCode = req.query.societyCode as string;
  if (queryCode) {
    const society = await SocietyService.getByCode(queryCode);
    if (society) return res.json(society);
    return res.status(404).json({ message: 'Society not found by code' });
  }

  const societyId = req.user?.societyId;
  const societyCode = req.user?.societyCode;

  if (societyId) {
    const society = await SocietyService.getById(societyId);
    if (society) return res.json(society);
  }

  if (societyCode) {
    const society = await SocietyService.getByCode(societyCode);
    if (society) return res.json(society);
  }

  return res.status(404).json({ message: 'No current society context found' });
});
