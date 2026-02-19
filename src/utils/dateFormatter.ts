import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const LIMA_TIMEZONE = 'America/Lima';

/**
 * Formatea una fecha a la zona horaria de Lima, Perú
 * @param date - Fecha a formatear (Date, string, o number)
 * @param formatStr - Formato deseado (por defecto: 'dd/MM/yyyy HH:mm:ss')
 * @returns Fecha formateada como string
 */
export const formatToLimaTime = (
    date: Date | string | number,
    formatStr: string = 'dd/MM/yyyy HH:mm:ss'
): string => {
    const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    const zonedDate = toZonedTime(dateObj, LIMA_TIMEZONE);
    return format(zonedDate, formatStr);
};

/**
 * Convierte una fecha a la zona horaria de Lima, Perú
 * @param date - Fecha a convertir
 * @returns Fecha en zona horaria de Lima
 */
export const toLimaTimezone = (date: Date | string | number): Date => {
    const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    return toZonedTime(dateObj, LIMA_TIMEZONE);
};

/**
 * Convierte una fecha de hora de Lima (UTC-5) a UTC
 * Útil para filtros de fecha donde el usuario envía fechas en hora local
 * @param dateString - Fecha en formato ISO 8601 (se asume hora de Lima si no tiene timezone)
 * @returns Date en UTC
 * 
 * Ejemplo:
 * - Input: "2026-02-01T00:00:00" (00:00 hora Lima)
 * - Output: Date("2026-02-01T05:00:00.000Z") (05:00 UTC)
 */
export const convertLimaTimeToUTC = (dateString: string): Date => {
    // Si la fecha ya tiene timezone (Z o +/-), usar directamente
    if (dateString.includes('Z') || dateString.match(/[+-]\d{2}:\d{2}$/)) {
        return new Date(dateString);
    }

    let normalizedDate = dateString;
    // Si es formato YYYY-MM-DD simple, agregar hora inicio de día 00:00:00
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        normalizedDate += 'T00:00:00';
    }
    // Si tiene espacio y hora pero no T (ej: "2026-02-01 10:00:00"), reemplazar
    else if (dateString.match(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/)) {
        normalizedDate = dateString.replace(' ', 'T');
    }

    // Si no tiene timezone, asumimos que es hora de Lima (UTC-5)
    // Nota: Agregamos -05:00. Si normalizamos antes, ahora tenemos YYYY-MM-DDTHH:mm:ss-05:00
    const dateWithOffset = normalizedDate + '-05:00';
    return new Date(dateWithOffset);
};

/**
 * Convierte un rango de fechas de Lima a UTC
 * Si solo se pasa fecha sin hora, automáticamente cubre el día completo
 * @param from - Fecha inicial en hora de Lima
 * @param to - Fecha final en hora de Lima (opcional)
 * @returns Objeto con fechas from/to en UTC
 * 
 * Ejemplos:
 * - Input: from="2026-02-01", to="2026-02-01"
 * - Output: { from: Date("2026-02-01T05:00:00.000Z"), to: Date("2026-02-02T04:59:59.999Z") }
 */
export const convertLimaDateRangeToUTC = (from?: string, to?: string) => {
    if (!from && !to) return {};

    const result: { from?: Date; to?: Date } = {};

    if (from) {
        // Si es solo fecha (YYYY-MM-DD), iniciar desde las 00:00:00 de Lima
        if (from.match(/^\d{4}-\d{2}-\d{2}$/)) {
            result.from = convertLimaTimeToUTC(from + 'T00:00:00');
        } else {
            result.from = convertLimaTimeToUTC(from);
        }
    }

    if (to) {
        // Si es solo fecha (YYYY-MM-DD), terminar a las 23:59:59.999 de Lima
        if (to.match(/^\d{4}-\d{2}-\d{2}$/)) {
            result.to = convertLimaTimeToUTC(to + 'T23:59:59.999');
        } else {
            result.to = convertLimaTimeToUTC(to);
        }
    }

    return result;
};

/**
 * Obtiene el primer día del mes actual en hora de Lima
 */
export const getFirstDayOfCurrentMonthLima = (): Date => {
    const now = new Date();
    // Crear fecha en UTC que corresponde a la hora actual en Lima
    const limaDate = toZonedTime(now, LIMA_TIMEZONE);
    return new Date(limaDate.getFullYear(), limaDate.getMonth(), 1, 0, 0, 0, 0);
};

/**
 * Obtiene el último día del mes actual en hora de Lima
 */
export const getLastDayOfCurrentMonthLima = (): Date => {
    const now = new Date();
    const limaDate = toZonedTime(now, LIMA_TIMEZONE);
    // Día 0 del siguiente mes = último día del actual
    return new Date(limaDate.getFullYear(), limaDate.getMonth() + 1, 0, 23, 59, 59, 999);
};

