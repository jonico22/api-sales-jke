import { Router } from 'express';
import { AnalyticsController } from './analytics.controller';

const router = Router();

router.get('/summary', AnalyticsController.getSummary);
router.get('/sales/trend', AnalyticsController.getSalesTrend);
router.get('/cash-flow/trend', AnalyticsController.getCashFlowTrend);
router.get('/sales/by-category', AnalyticsController.getSalesByCategory);
router.get('/sales/by-branch', AnalyticsController.getSalesByBranch);
router.get('/payments/distribution', AnalyticsController.getPaymentsDistribution);
router.get('/products/top', AnalyticsController.getProductsTop);
router.get('/inventory/low-stock', AnalyticsController.getInventoryLowStock);
router.get('/inventory/low-stock/trend', AnalyticsController.getInventoryLowStockTrend);

export default router;
