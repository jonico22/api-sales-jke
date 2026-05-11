import { Router } from 'express';
import { ProductController } from './product.controller';
import { ProductBulkController } from './product.bulk.controller';

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

router.get('/best-sellers', ProductController.getBestSellers);

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
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Búsqueda parcial por nombre, código, marca o código de barras
 *     responses:
 *       200:
 *         description: Lista de productos (id, name, price, stock, category)
 */
// Endpoint para obtener usuarios únicos que han creado productos
router.get('/created-by-users', ProductController.getCreatedByUsers);
// Endpoint para obtener usuarios únicos que han actualizado productos
router.get('/updated-by-users', ProductController.getUpdatedByUsers);

router.get('/brands', ProductController.getUniqueBrands);
router.get('/colors', ProductController.getUniqueColors);

// Force reload
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
 * /products/bulk-upload:
 *   post:
 *     summary: Carga masiva de productos vía CSV
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: query
 *         name: societyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Código de la sociedad
 *       - in: query
 *         name: createdBy
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID del usuario que realiza la carga masiva
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Carga procesada
 */
router.post('/bulk-upload', ProductBulkController.uploadMiddleware, ProductBulkController.bulkUpload);

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
