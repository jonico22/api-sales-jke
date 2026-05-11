import { Request, Response } from 'express';
import { BranchOfficeProductService } from './branchofficeproduct.service';
import { branchOfficeProductIdSchema, branchOfficeProductFiltersSchema } from './branchOfficeProduct.schema';
import { paginationQuerySchema } from '@/schemas/pagination.schema';
import { formatSafeParseErrors } from '@/utils/controller-helpers';
import { asyncHandler } from '@/utils/asyncHandler';

export const BranchOfficeProductController = {
  getAll: asyncHandler(async (req: Request, res: Response) => {
    const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
    const filtersParse = branchOfficeProductFiltersSchema.safeParse({ query: req.query });

    if (!paginationParse.success || !filtersParse.success) {
      return res.status(400).json(formatSafeParseErrors(paginationParse, filtersParse));
    }

    const data = await BranchOfficeProductService.getAll(
      paginationParse.data.query,
      filtersParse.data.query
    );
    res.json(data);
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const parse = branchOfficeProductIdSchema.safeParse(req.params.id);
    if (!parse.success) return res.status(400).json(parse.error.format());

    const result = await BranchOfficeProductService.getById(parse.data);
    if (!result) return res.status(404).json({ message: 'BranchOfficeProduct not found' });
    res.json(result);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const result = await BranchOfficeProductService.create(req.body);
    res.status(201).json(result);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const parse = branchOfficeProductIdSchema.safeParse(req.params.id);
    if (!parse.success) return res.status(400).json(parse.error.format());

    const result = await BranchOfficeProductService.update(parse.data, req.body);
    res.json(result);
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const parse = branchOfficeProductIdSchema.safeParse(req.params.id);
    if (!parse.success) return res.status(400).json(parse.error.format());

    await BranchOfficeProductService.delete(parse.data);
    res.json({ message: 'BranchOfficeProduct deleted successfully' });
  }),

  getForSelect: asyncHandler(async (req: Request, res: Response) => {
    const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
    if (!paginationParse.success) {
      return res.status(400).json(paginationParse.error.format());
    }

    const branchOfficeId = req.query.branchOfficeId as string;
    const societyCode = req.query.societyCode as string | undefined;
    const search = req.query.search as string | undefined;

    if (!branchOfficeId) {
      return res.status(400).json({ message: 'branchOfficeId is required' });
    }

    const result = await BranchOfficeProductService.getForSelect(
      branchOfficeId,
      societyCode,
      paginationParse.data.query,
      search
    );
    res.json(result);
  }),
};
