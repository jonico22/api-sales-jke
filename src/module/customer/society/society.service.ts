import prisma from '@/config/prisma';

import { createSocietySchema, updateSocietySchema } from './society.validation'
import z from 'zod';

import { v4 as uuidv4 } from 'uuid';

export const createSociety = async (data: z.infer<typeof createSocietySchema>) => {
  return prisma.society.create({
    data: {
      ...data,
      subscriptionId: uuidv4(),
    }
  });
};

export const getAllSocieties = async () => {
  return prisma.society.findMany();
};

export const getSocietyById = async (id: string) => {
  return prisma.society.findUnique({ where: { id } });
};

export const updateSociety = async (id: string, data: z.infer<typeof updateSocietySchema>) => {
  return prisma.society.update({ where: { id }, data });
};

export const deleteSociety = async (id: string) => {
  return prisma.society.delete({ where: { id } });
};
