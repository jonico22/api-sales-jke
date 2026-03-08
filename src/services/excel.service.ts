
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
    }
};
