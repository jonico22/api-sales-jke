import { Router } from 'express';
import { BussinessPartnerController } from './bussinesspartner.controller';

const router = Router();

/**
 * @openapi
 * /bussinesspartners:
 *   get:
 *     summary: Obtener todos los socios de negocio
 *     tags: [BussinessPartner]
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
 *                 $ref: '#/components/schemas/BussinessPartner'
 */
router.get('/', BussinessPartnerController.getAll);

/**
 * @openapi
 * /bussinesspartners/select:
 *   get:
 *     summary: Obtener lista simplificada para selectores
 *     tags: [BussinessPartner]
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
router.get('/select', BussinessPartnerController.getForSelect);

/**
 * @openapi
 * /bussinesspartners/{id}:
 *   get:
 *     summary: Obtener un socio de negocio por ID
 *     tags: [BussinessPartner]
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
 *               $ref: '#/components/schemas/BussinessPartner'
 *       404:
 *         description: Socio de negocio no encontrado
 */
router.get('/:id', BussinessPartnerController.getById);

/**
 * @openapi
 * /bussinesspartners:
 *   post:
 *     summary: Crear un nuevo socio de negocio
 *     tags: [BussinessPartner]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBussinessPartner'
 *     responses:
 *       201:
 *         description: Socio de negocio creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BussinessPartner'
 *       400:
 *         description: Datos inválidos
 *       409:
 *         description: Email o documento ya registrado
 */
router.post('/', BussinessPartnerController.create);

/**
 * @openapi
 * /bussinesspartners/{id}:
 *   put:
 *     summary: Actualizar un socio de negocio
 *     tags: [BussinessPartner]
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
 *             $ref: '#/components/schemas/UpdateBussinessPartner'
 *     responses:
 *       200:
 *         description: Socio de negocio actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BussinessPartner'
 *       404:
 *         description: Socio de negocio no encontrado
 *       409:
 *         description: Email ya registrado
 */
router.put('/:id', BussinessPartnerController.update);

/**
 * @openapi
 * /bussinesspartners/{id}:
 *   delete:
 *     summary: Eliminar un socio de negocio (soft delete)
 *     tags: [BussinessPartner]
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
router.delete('/:id', BussinessPartnerController.delete);

export default router;
