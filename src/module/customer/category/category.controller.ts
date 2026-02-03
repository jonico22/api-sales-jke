import { Request, Response } from 'express';
import { CategoryService } from './category.service';
import { categoryIdSchema, createCategorySchema, updateCategorySchema, categoryFiltersSchema } from './category.schema';
import { paginationQuerySchema } from '@/schemas/pagination.schema';

export const CategoryController = {
  getAll: async (req: Request, res: Response) => {
    const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
    const filtersParse = categoryFiltersSchema.safeParse({ query: req.query });

    if (!paginationParse.success || !filtersParse.success) {
      return res.status(400).json({
        ...(paginationParse.error?.format?.() ?? {}),
        ...(filtersParse.error?.format?.() ?? {}),
      });
    }

    const result = await CategoryService.getAll(
      paginationParse.data.query,
      filtersParse.data.query
    );
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
    if (!result) return res.status(400).json({ message: 'Código de sociedad inválido' });

    res.status(201).json(result);
  },

  getCreatedByUsers: async (req: Request, res: Response) => {
    const societyId = req.query.societyId as string | undefined;
    const result = await CategoryService.getCreatedByUsers(societyId);
    res.json(result);
  },

  getUpdatedByUsers: async (req: Request, res: Response) => {
    const societyId = req.query.societyId as string | undefined;
    const result = await CategoryService.getUpdatedByUsers(societyId);
    res.json(result);
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
    if (!result) return res.status(400).json({ message: 'No se pudo actualizar: Categoría o Código de sociedad no encontrado' });
    res.json(result);
  },

  delete: async (req: Request, res: Response) => {
    const { params } = categoryIdSchema.parse({ params: req.params });
    const result = await CategoryService.delete(params.id, req.body?.updatedBy);
    res.json({ message: 'Category deleted', data: result });
  },

  /**
   * Obtener categorías para select/dropdown (sin paginación)
   */
  getForSelect: async (req: Request, res: Response) => {
    const societyId = req.query.societyId as string | undefined;
    const result = await CategoryService.getForSelect(societyId);
    res.json(result);
  },
};
