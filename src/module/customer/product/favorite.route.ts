
import { Router } from 'express';
import { FavoriteController } from './favorite.controller';

const router = Router();

/**
 * @openapi
 * /favorites:
 *   get:
 *     summary: List user favorites
 *     parameters:
 *       - in: query
 *         name: societyCode
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of favorite products
 */
router.get('/', FavoriteController.getMyFavorites);

/**
 * @openapi
 * /favorites/toggle:
 *   post:
 *     summary: Toggle favorite status
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               productId:
 *                 type: string
 *               societyId:
 *                 type: string
 *     responses:
 *       200:
 *         description: { isFavorite: boolean }
 */
router.post('/toggle', FavoriteController.toggle);

export default router;
