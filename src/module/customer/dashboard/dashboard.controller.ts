
import { Request, Response } from 'express';
import { DashboardService } from './dashboard.service';
import { asyncHandler } from '@/utils/asyncHandler';
import { getQueryString } from '@/utils/controller-helpers';
import { DashboardFilters } from './dashboard.helpers';
import { AnalyticsFilters } from '../analytics/analytics.helpers';

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
    const dateFrom = getQueryString(req, 'dateFrom');
    const dateTo = getQueryString(req, 'dateTo');

    return {
        ...(month !== undefined && !Number.isNaN(month) ? { month } : {}),
        ...(year !== undefined && !Number.isNaN(year) ? { year } : {}),
        ...(branchId ? { branchId } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
    };
};

const getDashboardOverviewFilters = (req: Request): AnalyticsFilters => {
    const branchId = getQueryString(req, 'branchId');
    const dateFrom = getQueryString(req, 'dateFrom');
    const dateTo = getQueryString(req, 'dateTo');
    const granularity = getQueryString(req, 'granularity') as AnalyticsFilters['granularity'];
    const limitRaw = getQueryString(req, 'limit');
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

    return {
        ...(branchId ? { branchId } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
        ...(granularity ? { granularity } : {}),
        ...(limit !== undefined && !Number.isNaN(limit) ? { limit } : {}),
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

    getOverview: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
        res.json(await DashboardService.getOverview(societyCode, getDashboardOverviewFilters(req)));
    }),

    getAlertsLowStock: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
        res.json(await DashboardService.getAlertsLowStock(societyCode, getDashboardOverviewFilters(req)));
    }),

    getCatalogSummary: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getSocietyCodeOrId(req);
        if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
        res.json(await DashboardService.getCatalogSummary(societyCode, getDashboardOverviewFilters(req)));
    })
};
