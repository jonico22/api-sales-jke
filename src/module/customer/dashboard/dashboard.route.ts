
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
router.get('/charts/sales-performance', DashboardController.getSalesPerformance);
router.get('/charts/revenue-by-category', DashboardController.getRevenueByCategory);
router.get('/charts/top-products', DashboardController.getTopProducts);
router.get('/charts/payment-methods', DashboardController.getPaymentMethods);
router.get('/charts/branch-performance', DashboardController.getBranchPerformance);
router.get('/charts/cash-flow', DashboardController.getCashFlow);

export default router;
