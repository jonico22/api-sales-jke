import { Router } from 'express';
import { ProductController } from './product.controller';

const router = Router();

/**
 * @openapi
 * /products:
 *   get:
 *     summary: Obtener todos los productos
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items por página
 *       - in: query
 *         name: societyId
 *         schema:
 *           type: string
 *         description: Código de la sociedad
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *         description: Código de la categoría
 *     responses:
 *       200:
 *         description: Lista de productos paginada
 */
router.get('/', ProductController.getAll);

/**
 * @openapi
 * /products/select:
 *   get:
 *     summary: Obtener productos para select/dropdown (sin paginación)
 *     parameters:
 *       - in: query
 *         name: societyId
 *         schema:
 *           type: string
 *         description: Código de la sociedad (opcional)
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *         description: Código de la categoría (opcional)
 *     responses:
 *       200:
 *         description: Lista de productos (id, name, price, stock, category)
 */
router.get('/select', ProductController.getForSelect);

/**
 * @openapi
 * /products/{id}:
 *   get:
 *     summary: Obtener producto por ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Producto encontrado
 *       404:
 *         description: Producto no encontrado
 */
router.get('/:id', ProductController.getById);

/**
 * @openapi
 * /products:
 *   post:
 *     summary: Crear un nuevo producto
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProduct'
 *     responses:
 *       201:
 *         description: Producto creado exitosamente
 *       400:
 *         description: Error de validación
 */
router.post('/', ProductController.create);

/**
 * @openapi
 * /products/{id}:
 *   put:
 *     summary: Actualizar un producto
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProduct'
 *     responses:
 *       200:
 *         description: Producto actualizado
 *       400:
 *         description: Error de validación
 */
router.put('/:id', ProductController.update);

/**
 * @openapi
 * /products/{id}:
 *   delete:
 *     summary: Eliminar un producto (soft delete)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Producto eliminado
 */
router.delete('/:id', ProductController.delete);

export default router;
