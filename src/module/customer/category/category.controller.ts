import { Request, Response } from 'express';
import { CategoryService } from './category.service';
import { categoryIdSchema, createCategorySchema, updateCategorySchema } from './category.schema';

export const CategoryController = {
  getAll: async (_req: Request, res: Response) => {
    const result = await CategoryService.getAll();
    res.json(result);
  },

  getById: async (req: Request, res: Response) => {
    const { params } = categoryIdSchema.parse({ params: req.params });
    const result = await CategoryService.getById(params.id);
    if (!result) return res.status(404).json({ message: 'Category not found' });
    res.json(result);
  },

  create: async (req: Request, res: Response) => {
    const parse = createCategorySchema.safeParse({ body: req.body });
    if (!parse.success) return res.status(400).json(parse.error.format());

    const result = await CategoryService.create(parse.data.body);
    res.status(201).json(result);
  },

  update: async (req: Request, res: Response) => {
    const idParse = categoryIdSchema.safeParse({ params: req.params });
    const bodyParse = updateCategorySchema.safeParse({ body: req.body });

    if (!idParse.success || !bodyParse.success) {
      return res.status(400).json({
        ...(idParse.error?.format?.() ?? {}),
        ...(bodyParse.error?.format?.() ?? {}),
      });
    }

    const result = await CategoryService.update(idParse.data.params.id, bodyParse.data.body);
    res.json(result);
  },

  delete: async (req: Request, res: Response) => {
    const { params } = categoryIdSchema.parse({ params: req.params });
    const result = await CategoryService.delete(params.id);
    res.json({ message: 'Category deleted', data: result });
  },
};
