import { Request, Response } from 'express';
import { BranchOfficeService } from './branchoffice.service';
import { branchOfficeFiltersSchema, branchOfficeIdSchema } from './branchOffice.schema';
import { paginationQuerySchema } from '@/schemas/pagination.schema';
import { asyncHandler } from '@/utils/asyncHandler';
import { formatSafeParseErrors, getQueryString } from '@/utils/controller-helpers';

export const BranchOfficeController = {
  getAll: asyncHandler(async (req: Request, res: Response) => {
    const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
    const filtersParse = branchOfficeFiltersSchema.safeParse({ query: req.query });

    if (!paginationParse.success || !filtersParse.success) {
      return res.status(400).json(formatSafeParseErrors(paginationParse, filtersParse));
    }

    const data = await BranchOfficeService.getAll(
      paginationParse.data.query,
      filtersParse.data.query
    );
    res.json(data);
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const parse = branchOfficeIdSchema.safeParse(req.params.id);
    if (!parse.success) return res.status(400).json(parse.error.format());

    const result = await BranchOfficeService.getById(parse.data);
    if (!result) return res.status(404).json({ message: 'BranchOffice not found' });
    res.json(result);
  }),

  getForSelect: asyncHandler(async (req: Request, res: Response) => {
    const societyCode = getQueryString(req, 'societyCode', 'societyId');
    const result = await BranchOfficeService.getForSelect(societyCode);
    res.json(result);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const result = await BranchOfficeService.create(req.body);
    if (!result) return res.status(400).json({ message: 'Invalid society code' });
    res.status(201).json(result);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const parse = branchOfficeIdSchema.safeParse(req.params.id);
    if (!parse.success) return res.status(400).json(parse.error.format());

    const result = await BranchOfficeService.update(parse.data, req.body);
    if (!result) return res.status(400).json({ message: 'Invalid society code or branch office not found' });
    res.json(result);
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const parse = branchOfficeIdSchema.safeParse(req.params.id);
    if (!parse.success) return res.status(400).json(parse.error.format());

    await BranchOfficeService.delete(parse.data);
    res.json({ message: 'BranchOffice deleted successfully' });
  }),
};
