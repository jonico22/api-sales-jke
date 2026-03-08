import { Request, Response } from 'express';
import { BranchOfficeProductService } from './branchofficeproduct.service';
import { branchOfficeProductIdSchema, branchOfficeProductFiltersSchema } from './branchofficeproduct.validation';
import { paginationQuerySchema } from '@/schemas/pagination.schema';

export const BranchOfficeProductController = {
  getAll: async (req: Request, res: Response) => {
    const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
    const filtersParse = branchOfficeProductFiltersSchema.safeParse({ query: req.query });

    if (!paginationParse.success || !filtersParse.success) {
      return res.status(400).json({
        ...(paginationParse.error?.format?.() ?? {}),
        ...(filtersParse.error?.format?.() ?? {}),
      });
    }

    const societyId = req.query.societyId as string | undefined;

    const data = await BranchOfficeProductService.getAll(
      paginationParse.data.query,
      societyId,
      filtersParse.data.query
    );
    res.json(data);
  },

  getById: async (req: Request, res: Response) => {
    const id = branchOfficeProductIdSchema.parse(req.params.id);
    const result = await BranchOfficeProductService.getById(id);
    if (!result) return res.status(404).json({ message: 'BranchOfficeProduct not found' });
    res.json(result);
  },

  create: async (req: Request, res: Response) => {
    const result = await BranchOfficeProductService.create(req.body);
    res.status(201).json(result);
  },

  update: async (req: Request, res: Response) => {
    const id = branchOfficeProductIdSchema.parse(req.params.id);
    const result = await BranchOfficeProductService.update(id, req.body);
    res.json(result);
  },

  delete: async (req: Request, res: Response) => {
    const id = branchOfficeProductIdSchema.parse(req.params.id);
    await BranchOfficeProductService.delete(id);
    res.json({ message: 'BranchOfficeProduct deleted successfully' });
  },
};
