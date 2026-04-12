
import { Router } from 'express';
import { DashboardController } from './dashboard.controller';

const router = Router();

/**
 * @openapi
 * /dashboard/stats:
 *   get:
 *     summary: Get dashboard statistics
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: societyCode
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Dashboard stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalStockValue:
 *                   type: number
 *                 lowStockItems:
 *                   type: number
 *                 netSales:
 *                   type: number
 *                 newProducts:
 *                   type: number
 */
router.get('/stats', DashboardController.getStats);
router.get('/overview', DashboardController.getOverview);
router.get('/alerts/low-stock', DashboardController.getAlertsLowStock);
router.get('/catalog-summary', DashboardController.getCatalogSummary);

export default router;
