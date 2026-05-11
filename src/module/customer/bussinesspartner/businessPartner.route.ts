import { Router } from 'express';
import { BusinessPartnerController } from './businessPartner.controller';

const router = Router();

/**
 * @openapi
 * /business-partners:
 *   get:
 *     summary: Obtener todos los socios de negocio
 *     tags: [BusinessPartner]
 *     parameters:
 *       - in: query
 *         name: societyId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filtrar por ID de sociedad
 *     responses:
 *       200:
 *         description: Lista de socios de negocio
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BusinessPartner'
 */
router.get('/', BusinessPartnerController.getAll);

/**
 * @openapi
 * /business-partners/select:
 *   get:
 *     summary: Obtener lista simplificada para selectores
 *     tags: [BusinessPartner]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [CUSTOMER, SUPPLIER, BOTH]
 *         description: Filtrar por tipo (CUSTOMER incluye BOTH)
 *     responses:
 *       200:
 *         description: Lista de socios simplificada
 */
router.get('/select', BusinessPartnerController.getForSelect);

/**
 * @openapi
 * /business-partners/{id}:
 *   get:
 *     summary: Obtener un socio de negocio por ID
 *     tags: [BusinessPartner]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Socio de negocio encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BusinessPartner'
 *       404:
 *         description: Socio de negocio no encontrado
 */
router.get('/:id', BusinessPartnerController.getById);

/**
 * @openapi
 * /business-partners:
 *   post:
 *     summary: Crear un nuevo socio de negocio
 *     tags: [BusinessPartner]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBusinessPartner'
 *     responses:
 *       201:
 *         description: Socio de negocio creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BusinessPartner'
 *       400:
 *         description: Datos inválidos
 *       409:
 *         description: Email o documento ya registrado
 */
router.post('/', BusinessPartnerController.create);

/**
 * @openapi
 * /business-partners/{id}:
 *   put:
 *     summary: Actualizar un socio de negocio
 *     tags: [BusinessPartner]
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
 *             $ref: '#/components/schemas/UpdateBusinessPartner'
 *     responses:
 *       200:
 *         description: Socio de negocio actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BusinessPartner'
 *       404:
 *         description: Socio de negocio no encontrado
 *       409:
 *         description: Email ya registrado
 */
router.put('/:id', BusinessPartnerController.update);

/**
 * @openapi
 * /business-partners/{id}:
 *   delete:
 *     summary: Eliminar un socio de negocio (soft delete)
 *     tags: [BusinessPartner]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Socio de negocio eliminado
 *       404:
 *         description: Socio de negocio no encontrado
 */
router.delete('/:id', BusinessPartnerController.delete);

export default router;
