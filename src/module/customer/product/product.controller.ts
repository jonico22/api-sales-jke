import { Request, Response } from 'express';
import { ProductService } from './product.service';
import { createProductSchema, updateProductSchema, productIdSchema, productFiltersSchema, productSelectFiltersSchema } from './product.schema';
import { paginationQuerySchema } from '@/schemas/pagination.schema';

export const ProductController = {
  /**
   * Obtener todos los productos con paginación
   */
  getAll: async (req: Request, res: Response) => {
    const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
    const filtersParse = productFiltersSchema.safeParse({ query: req.query });

    if (!paginationParse.success || !filtersParse.success) {
      return res.status(400).json({
        ...(paginationParse.error?.format?.() ?? {}),
        ...(filtersParse.error?.format?.() ?? {}),
      });
    }

    const result = await ProductService.getAll(
      paginationParse.data.query,
      filtersParse.data.query
    );
    res.json(result);
  },

  /**
   * Obtener producto por ID
   */
  getById: async (req: Request, res: Response) => {
    const parse = productIdSchema.safeParse({ params: req.params });
    if (!parse.success) {
      return res.status(400).json(parse.error.format());
    }

    const product = await ProductService.getById(parse.data.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    res.json(product);
  },

  getCreatedByUsers: async (req: Request, res: Response) => {
    const societyId = req.query.societyId as string | undefined;
    const result = await ProductService.getCreatedByUsers(societyId);
    res.json(result);
  },

  getUpdatedByUsers: async (req: Request, res: Response) => {
    const societyId = req.query.societyId as string | undefined;
    const result = await ProductService.getUpdatedByUsers(societyId);
    res.json(result);
  },

  getUniqueBrands: async (req: Request, res: Response) => {
    const societyId = req.query.societyCode as string || req.query.societyId as string;
    const result = await ProductService.getUniqueBrands(societyId);
    res.json(result);
  },

  getUniqueColors: async (req: Request, res: Response) => {
    const societyId = req.query.societyCode as string || req.query.societyId as string;
    const result = await ProductService.getUniqueColors(societyId);
    res.json(result);
  },

  /**
   * Crear un nuevo producto
   */
  create: async (req: Request, res: Response) => {
    const parse = createProductSchema.safeParse({ body: req.body });
    if (!parse.success) {
      return res.status(400).json(parse.error.format());
    }

    const result = await ProductService.create(parse.data.body);

    // Verificar si hubo error de validación
    if ('error' in result) {
      return res.status(400).json({ message: result.error });
    }

    res.status(201).json(result);
  },

  /**
   * Actualizar un producto
   */
  update: async (req: Request, res: Response) => {
    const idParse = productIdSchema.safeParse({ params: req.params });
    const bodyParse = updateProductSchema.safeParse({ body: req.body });

    if (!idParse.success || !bodyParse.success) {
      return res.status(400).json({
        ...(idParse.error?.format?.() ?? {}),
        ...(bodyParse.error?.format?.() ?? {}),
      });
    }

    const result = await ProductService.update(idParse.data.params.id, bodyParse.data.body);

    // Verificar si hubo error de validación
    if (result && 'error' in result) {
      return res.status(400).json({ message: result.error });
    }

    res.json(result);
  },

  /**
   * Eliminar un producto (soft delete)
   */
  delete: async (req: Request, res: Response) => {
    const { params } = productIdSchema.parse({ params: req.params });
    const result = await ProductService.delete(params.id, req.body?.updatedBy);
    res.json({ message: 'Product deleted', data: result });
  },

  getBestSellers: async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const societyId = req.query.societyCode as string || req.query.societyId as string;
    const result = await ProductService.getBestSellers(limit, societyId);
    res.json(result);
  },
  /**
   * Obtener productos para select/dropdown (sin paginación)
   */
  getForSelect: async (req: Request, res: Response) => {
    try {
      const { query } = productSelectFiltersSchema.parse({ query: req.query });
      const { societyCode, societyId, categoryCode, categoryId, branchId } = query;

      const result = await ProductService.getForSelect(
        societyCode || societyId,
        categoryCode || categoryId,
        branchId
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: 'Error en parámetros de consulta', error: error.message });
    }
  },
};
