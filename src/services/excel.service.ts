
import * as XLSX from 'xlsx';

export const ExcelService = {
    /**
     * Genera un buffer de Excel a partir de un array de objetos JSON.
     * @param data Array de objetos con los datos a exportar.
     * @param sheetName Nombre de la hoja de cálculo.
     * @returns Buffer del archivo Excel (.xlsx).
     */
    generateExcelBuffer: (data: any[], sheetName: string = 'Sheet1'): Buffer => {
        // 1. Crear una hoja de trabajo (WorkSheet) desde el JSON
        const worksheet = XLSX.utils.json_to_sheet(data);

        // 2. Crear un libro de trabajo (WorkBook) y añadir la hoja
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        // 3. Escribir el libro a un buffer
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        return buffer;
    },

    /**
     * Genera un buffer de Excel agregando filas JSON por lotes para reducir
     * el pico de memoria cuando el dataset es grande.
     */
    generateExcelBufferFromBatches: async (
        batches: AsyncIterable<any[]> | Iterable<any[]>,
        sheetName: string = 'Sheet1'
    ): Promise<Buffer> => {
        const workbook = XLSX.utils.book_new();
        let worksheet = XLSX.utils.aoa_to_sheet([]);
        let hasRows = false;

        for await (const batch of batches) {
            if (!batch || batch.length === 0) continue;

            if (!hasRows) {
                worksheet = XLSX.utils.json_to_sheet(batch);
                hasRows = true;
                continue;
            }

            XLSX.utils.sheet_add_json(worksheet, batch, {
                skipHeader: true,
                origin: -1,
            });
        }

        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    }
};
