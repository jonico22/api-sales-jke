import { Request, Response } from 'express';
import { ProductService } from './product.service';
import { createProductSchema, updateProductSchema, productIdSchema } from './product.schema';
import { paginationQuerySchema } from '@/schemas/pagination.schema';

export const ProductController = {
  /**
   * Obtener todos los productos con paginación
   */
  getAll: async (req: Request, res: Response) => {
    const parse = paginationQuerySchema.safeParse({ query: req.query });
    if (!parse.success) {
      return res.status(400).json(parse.error.format());
    }

    const societyId = req.query.societyId as string | undefined;
    const categoryId = req.query.categoryId as string | undefined;

    const result = await ProductService.getAll(parse.data.query, societyId, categoryId);
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
    const parse = productIdSchema.safeParse({ params: req.params });
    if (!parse.success) {
      return res.status(400).json(parse.error.format());
    }

    const result = await ProductService.delete(parse.data.params.id, req.body?.updatedBy);
    res.json({ message: 'Producto eliminado', data: result });
  },

  /**
   * Obtener productos para select/dropdown (sin paginación)
   */
  getForSelect: async (req: Request, res: Response) => {
    const societyId = req.query.societyId as string | undefined;
    const categoryId = req.query.categoryId as string | undefined;
    const result = await ProductService.getForSelect(societyId, categoryId);
    res.json(result);
  },
};
