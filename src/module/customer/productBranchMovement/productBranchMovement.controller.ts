import { Request, Response } from 'express';
import { ProductBranchMovementService } from './productBranchMovement.service';
import {
  updateProductBranchMovementSchema,
  productBranchMovementFiltersSchema,
  paramsSchema,
} from './productBranchMovement.validation';
import { asyncHandler } from '@/utils/asyncHandler';

export class ProductBranchMovementController {
  static getAll = asyncHandler(async (req: Request, res: Response) => {
    const pagination = {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      sortBy: req.query.sortBy as string,
      sortOrder: req.query.sortOrder as 'asc' | 'desc'
    };
    const filters = productBranchMovementFiltersSchema.parse(req.query);

    const movements = await ProductBranchMovementService.getAll(pagination, filters);
    res.json(movements);
  })

  static getById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = paramsSchema.parse(req.params);
    const movement = await ProductBranchMovementService.getById(id);
    if (!movement) return res.status(404).json({ message: 'Movement not found' });
    res.json(movement);
  })

  static create = asyncHandler(async (req: Request, res: Response) => {
    // Service handles validation + logic
    const movement = await ProductBranchMovementService.create(req.body);
    res.status(201).json(movement);
  })

  static createBulk = asyncHandler(async (req: Request, res: Response) => {
    const result = await ProductBranchMovementService.createBulk(req.body);
    res.status(201).json(result);
  })

  static transferAll = asyncHandler(async (req: Request, res: Response) => {
    const result = await ProductBranchMovementService.transferAll(req.body);
    res.status(201).json(result);
  })

  static update = asyncHandler(async (req: Request, res: Response) => {
    const { id } = paramsSchema.parse(req.params);
    updateProductBranchMovementSchema.parse(req.body);

    const movement = await ProductBranchMovementService.update(id, req.body);
    res.json(movement);
  })

  static delete = asyncHandler(async (req: Request, res: Response) => {
    const { id } = paramsSchema.parse(req.params);
    await ProductBranchMovementService.delete(id);
    res.status(204).send();
  })
}
