import prisma from '@/config/prisma';
import { z } from 'zod';
import { CreateBussinessPartnerInput, UpdateBussinessPartnerInput } from './bussinesspartner.schema';

export const BussinessPartnerService = {
    /**
     * Obtener todos los socios de negocio (sin eliminar)
     */
    async getAll(societyId?: string) {
        return prisma.bussinessPartner.findMany({
            where: {
                isDeleted: false,
                ...(societyId && { societyId }),
            },
            include: {
                documentType: true,
                society: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    },

    /**
     * Obtener un socio de negocio por ID
     */
    async getById(id: string) {
        return prisma.bussinessPartner.findFirst({
            where: { id, isDeleted: false },
            include: {
                documentType: true,
                society: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });
    },

    /**
     * Crear un nuevo socio de negocio
     */
    async create(data: CreateBussinessPartnerInput) {
        return prisma.bussinessPartner.create({
            data,
            include: {
                documentType: true,
                society: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });
    },

    /**
     * Actualizar un socio de negocio
     */
    async update(id: string, data: UpdateBussinessPartnerInput) {
        return prisma.bussinessPartner.update({
            where: { id },
            data,
            include: {
                documentType: true,
                society: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });
    },

    /**
     * Soft delete de un socio de negocio
     */
    async softDelete(id: string, updatedBy?: string) {
        return prisma.bussinessPartner.update({
            where: { id },
            data: {
                isDeleted: true,
                isActive: false,
                updatedBy,
            },
        });
    },

    /**
     * Hard delete de un socio de negocio (usar con precaución)
     */
    async hardDelete(id: string) {
        return prisma.bussinessPartner.delete({
            where: { id },
        });
    },

    /**
     * Buscar socios de negocio por email
     */
    async findByEmail(email: string) {
        return prisma.bussinessPartner.findUnique({
            where: { email },
            include: {
                documentType: true,
            },
        });
    },

    /**
     * Buscar socios de negocio por número de documento
     */
    async findByDocumentNumber(documentNumber: string) {
        return prisma.bussinessPartner.findUnique({
            where: { documentNumber },
            include: {
                documentType: true,
            },
        });
    },
};
