import { Router } from 'express';
import societyRoutes from '@/module/customer/society/society.route';
import branchOfficeRoutes from '@/module/customer/branchOffice/branchoffice.route';
import branchOfficeProductRoutes from '@/module/customer/branchOfficeProduct/branchofficeproduct.route';
import purchaseDetailRoutes from '@/module/customer/purchaseDetail/purchaseDetail.routes';
import purchaseRoutes from '@/module/customer/purchase/purchase.route';
import orderRoutes from '@/module/customer/order/order.route';
import orderItemRoutes from '@/module/customer/orderItem/orderItem.route';
import orderPaymentRoutes from '@/module/customer/orderPayment/orderPayment.route';
import societyReceiptRoutes from '@/module/customer/societyReceipt/societyReceipt.routes';
import outgoingConsignmentAgreementRoutes from '@/module/customer/outgoingConsignmentAgreement/outgoingConsignmentAgreement.route';
import deliveredConsignmentAgreementRoutes from '@/module/customer/deliveredConsignmentAgreement/deliveredConsignmentAgreement.route';
import receivedConsignmentSettlementRoutes from '@/module/customer/receivedConsignmentSettlement/receivedConsignmentSettlement.route';
import bussinessPartnerRoutes from '@/module/customer/bussinesspartner/bussinesspartner.route';
import categoryRoutes from '@/module/customer/category/category.route';
import taxRoutes from '@/module/customer/tax/tax.routes';
import currencyRoutes from '@/module/customer/currency/currency.routes';
import ProductRoutes from '../module/customer/product/product.route';
import FileRoutes from '../module/customer/file/file.route';
import cashShiftRoutes from '@/module/customer/cashShift/cashShift.route';
import inventoryRoutes from '@/module/inventory/inventory.route';
import unitOfMeasureRoutes from '@/module/customer/unit-of-measure/unit-of-measure.route';

const router = Router();

// Modulo de Clientes (Customer Modules)
router.use('/societies', societyRoutes);
router.use('/products', ProductRoutes);
router.use('/files', FileRoutes);
router.use('/branch-offices', branchOfficeRoutes);
router.use('/branch-office-products', branchOfficeProductRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/purchase-details', purchaseDetailRoutes);
router.use('/orders', orderRoutes);
router.use('/order-items', orderItemRoutes);
router.use('/order-payments', orderPaymentRoutes);
router.use('/society-receipts', societyReceiptRoutes);
router.use('/outgoing-consignment-agreements', outgoingConsignmentAgreementRoutes);
router.use('/delivered-consignment-agreements', deliveredConsignmentAgreementRoutes);
router.use('/received-consignment-settlements', receivedConsignmentSettlementRoutes);
router.use('/bussinesspartners', bussinessPartnerRoutes);
router.use('/categories', categoryRoutes);
router.use('/cash-shifts', cashShiftRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/unit-of-measures', unitOfMeasureRoutes);

// Configuración Regional (New)
router.use('/taxes', taxRoutes);
router.use('/currencies', currencyRoutes);

export default router;