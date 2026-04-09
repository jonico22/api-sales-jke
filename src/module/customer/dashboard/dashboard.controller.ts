
import { Request, Response } from 'express';
import { DashboardService } from './dashboard.service';
import { asyncHandler } from '@/utils/asyncHandler';
import { getQueryString } from '@/utils/controller-helpers';
import { DashboardFilters } from './dashboard.helpers';

const getSocietyCodeOrId = (req: Request) => {
    return getQueryString(req, 'societyCode', 'societyId');
};

const getDashboardFilters = (req: Request): DashboardFilters => {
    const month = typeof req.query.month === 'string' && req.query.month.length > 0
        ? Number.parseInt(req.query.month, 10)
        : undefined;
    const year = typeof req.query.year === 'string' && req.query.year.length > 0
        ? Number.parseInt(req.query.year, 10)
        : undefined;
    const branchId = getQueryString(req, 'branchId');

    return {
        ...(month !== undefined && !Number.isNaN(month) ? { month } : {}),
        ...(year !== undefined && !Number.isNaN(year) ? { year } : {}),
        ...(branchId ? { branchId } : {}),
    };
};

export const DashboardController = {
    getStats: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        const filters = getDashboardFilters(req);
        if (!societyCode) {
            return res.status(400).json({ message: 'Society Code/ID is required' });
        }

        const stats = await DashboardService.getStats(societyCode, filters);
        res.json(stats);
    }),

    getSalesPerformance: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        const filters = getDashboardFilters(req);
        if (!societyCode) {
            return res.status(400).json({ message: 'Society Code/ID is required' });
        }

        const chartData = await DashboardService.getSalesPerformance(societyCode, filters);
        res.json(chartData);
    }),

    getRevenueByCategory: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        const filters = getDashboardFilters(req);
        if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
        res.json(await DashboardService.getRevenueByCategory(societyCode, filters));
    }),

    getTopProducts: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        const filters = getDashboardFilters(req);
        if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
        res.json(await DashboardService.getTopProducts(societyCode, filters));
    }),

    getPaymentMethods: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        const filters = getDashboardFilters(req);
        if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
        res.json(await DashboardService.getPaymentMethods(societyCode, filters));
    }),

    getCashFlow: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        const filters = getDashboardFilters(req);
        if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
        res.json(await DashboardService.getCashFlow(societyCode, filters));
    }),

    getBranchPerformance: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        const filters = getDashboardFilters(req);
        if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
        res.json(await DashboardService.getBranchPerformance(societyCode, filters));
    })
};
