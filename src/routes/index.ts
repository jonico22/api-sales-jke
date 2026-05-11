import { Router } from 'express';
import societyRoutes from '@/module/customer/society/society.route';
import branchOfficeRoutes from '@/module/customer/branchOffice/branchoffice.route';
import branchOfficeProductRoutes from '@/module/customer/branchOfficeProduct/branchofficeproduct.route';
import purchaseDetailRoutes from '@/module/customer/purchaseDetail/purchaseDetail.route';
import purchaseRoutes from '@/module/customer/purchase/purchase.route';
import orderRoutes from '../module/customer/order/order.route';
import orderItemRoutes from '@/module/customer/orderItem/orderItem.route';
import orderPaymentRoutes from '@/module/customer/orderPayment/orderPayment.route';
import societyReceiptRoutes from '@/module/customer/societyReceipt/societyReceipt.routes';
import outgoingConsignmentAgreementRoutes from '@/module/customer/outgoingConsignmentAgreement/outgoingConsignmentAgreement.route';
import deliveredConsignmentAgreementRoutes from '@/module/customer/deliveredConsignmentAgreement/deliveredConsignmentAgreement.route';
import externalConsignmentSaleRoutes from '@/module/customer/externalConsignmentSale/externalConsignmentSale.route';
import receivedConsignmentSettlementRoutes from '@/module/customer/receivedConsignmentSettlement/receivedConsignmentSettlement.route';
import businessPartnerRoutes from '@/module/customer/bussinesspartner/businessPartner.route';
import categoryRoutes from '@/module/customer/category/category.route';
import taxRoutes from '@/module/customer/tax/tax.routes';
import currencyRoutes from '@/module/customer/currency/currency.routes';
import productRoutes from '../module/customer/product/product.route';
import fileRoutes from '../module/customer/file/file.route';
import cashShiftRoutes from '@/module/customer/cashShift/cashShift.route';
import productBranchMovementRoutes from '@/module/customer/productBranchMovement/productBranchMovement.routes';
import inventoryRoutes from '@/module/inventory/inventory.route';
import favoriteRoutes from '@/module/customer/product/favorite.route';
import unitOfMeasureRoutes from '@/module/customer/unit-of-measure/unit-of-measure.route';
import analyticsRoutes from '@/module/customer/analytics/analytics.route';

const router = Router();

// Modulo de Clientes (Customer Modules)
router.use('/societies', societyRoutes);
router.use('/products', productRoutes);
router.use('/files', fileRoutes);
router.use('/branch-offices', branchOfficeRoutes);
router.use('/branch-office-products', branchOfficeProductRoutes);
router.use('/branch-movements', productBranchMovementRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/purchase-details', purchaseDetailRoutes);
router.use('/orders', orderRoutes);
router.use('/order-items', orderItemRoutes);
router.use('/order-payments', orderPaymentRoutes);
router.use('/society-receipts', societyReceiptRoutes);
router.use('/outgoing-consignment-agreements', outgoingConsignmentAgreementRoutes);
router.use('/delivered-consignment-agreements', deliveredConsignmentAgreementRoutes);
router.use('/external-consignment-sales', externalConsignmentSaleRoutes);
router.use('/received-consignment-settlements', receivedConsignmentSettlementRoutes);
router.use('/business-partners', businessPartnerRoutes);
router.use('/categories', categoryRoutes);
router.use('/favorites', favoriteRoutes);
router.use('/cash-shifts', cashShiftRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/unit-of-measures', unitOfMeasureRoutes);

// Configuración Regional (New)
router.use('/taxes', taxRoutes);
router.use('/currencies', currencyRoutes);
router.use('/dashboard', require('../module/customer/dashboard/dashboard.route').default);
router.use('/analytics', analyticsRoutes);

export default router;
