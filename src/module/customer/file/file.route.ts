import { Router } from 'express';
import { FileController } from './file.controller';

const router = Router();

/**
 * @openapi
 * /files:
 *   get:
 *     summary: Obtener todos los archivos
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
 *         description: ID de la sociedad
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Búsqueda por nombre
 *     responses:
 *       200:
 *         description: Lista de archivos paginada
 */
router.get('/', FileController.getAll);

/**
 * @openapi
 * /files/{id}:
 *   get:
 *     summary: Obtener archivo por ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Archivo encontrado
 *       404:
 *         description: Archivo no encontrado
 */
router.get('/:id', FileController.getById);

/**
 * @openapi
 * /files:
 *   post:
 *     summary: Crear metadatos de archivo
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateFile'
 *     responses:
 *       201:
 *         description: Archivo creado exitosamente
 *       400:
 *         description: Error de validación
 */
router.post('/', FileController.create);

/**
 * @openapi
 * /files/{id}:
 *   put:
 *     summary: Actualizar metadatos de archivo
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
 *             $ref: '#/components/schemas/UpdateFile'
 *     responses:
 *       200:
 *         description: Archivo actualizado
 *       400:
 *         description: Error de validación
 */
router.put('/:id', FileController.update);

/**
 * @openapi
 * /files/{id}:
 *   delete:
 *     summary: Eliminar un archivo permanentemente
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Archivo eliminado
 */
router.delete('/:id', FileController.delete);

/**
 * @openapi
 * /files/upload:
 *   post:
 *     summary: Subir archivo a almacenamiento (R2/S3)
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: query
 *         name: societyId
 *         required: true
 *         schema:
 *           type: string
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
 *       201:
 *         description: Archivo subido y registrado
 */
router.post('/upload', FileController.uploadMiddleware, FileController.upload);

export default router;
