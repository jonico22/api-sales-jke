
import { Request, Response } from 'express';
import { DashboardService } from './dashboard.service';
import { asyncHandler } from '@/utils/asyncHandler';
import { getQueryString } from '@/utils/controller-helpers';

const getSocietyCodeOrId = (req: Request) => {
    return getQueryString(req, 'societyCode', 'societyId');
};

export const DashboardController = {
    getStats: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        if (!societyCode) {
            return res.status(400).json({ message: 'Society Code/ID is required' });
        }

        const stats = await DashboardService.getStats(societyCode);
        res.json(stats);
    }),

    getSalesPerformance: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        if (!societyCode) {
            return res.status(400).json({ message: 'Society Code/ID is required' });
        }

        const chartData = await DashboardService.getSalesPerformance(societyCode);
        res.json(chartData);
    }),

    getRevenueByCategory: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
        res.json(await DashboardService.getRevenueByCategory(societyCode));
    }),

    getTopProducts: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
        res.json(await DashboardService.getTopProducts(societyCode));
    }),

    getPaymentMethods: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
        res.json(await DashboardService.getPaymentMethods(societyCode));
    }),

    getCashFlow: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
        res.json(await DashboardService.getCashFlow(societyCode));
    }),

    getBranchPerformance: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
        res.json(await DashboardService.getBranchPerformance(societyCode));
    })
};
