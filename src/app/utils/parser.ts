import * as XLSX from "xlsx";

export interface CaddisRow {
  "Factura Tipo"?: any;
  "Factura Nro"?: any;
  "Factura Fecha"?: any;
  "Total"?: any;
  "PDV"?: any;
  "rubro"?: any;
  "Rubro"?: any;
  "Empresa"?: any;
  [key: string]: any;
}

export interface MonitoringDetail {
  DescripcionItem: string;
  Cantidad: string;
  ImporteNeto: string;
  ImporteImpuestos: string;
  Alicuota?: string;
  rubro?: string;
}

export interface MonitoringPago {
  MedioPago: string;
  Importe: string;
}

export interface MonitoringComprobante {
  Fecha: string;
  Hora: string;
  IdComprobante: string;
  PtoVenta: string;
  NroComprobante: string;
  Detalles: MonitoringDetail[];
  Pagos: MonitoringPago[];
}

export interface ProcessedVoucher {
  id: string; // unique visual key
  originalRow: CaddisRow;
  status: "valid" | "ignored" | "invalid";
  errorReason?: string;
  mapped?: MonitoringComprobante;
}

// Map Caddis invoice type to SolutionsMalls IdComprobante
export const COMPROBANTE_MAP: Record<string, string> = {
  EA: "001",   // Factura A
  IA: "001",   // Factura A
  EB: "006",   // Factura B
  TK: "006",   // Factura B
  NCEA: "003", // Nota de Crédito A
  NCEB: "008", // Nota de Crédito B
  NCIB: "008", // Nota de Crédito B
  NCX: "008",  // Nota de Crédito B
  NDEB: "007", // Nota de Débito B
  X: "083",    // Ticket
};

// Types that should be ignored
export const IGNORE_TYPES = new Set(["PP", "R", "RC"]);

/**
 * Parses a Date value into the DD-MM-YYYY format required by SolutionsMalls.
 */
export function formatToMonitoringDate(val: any): string {
  if (!val) return "";
  
  if (val instanceof Date) {
    const d = val.getDate().toString().padStart(2, '0');
    const m = (val.getMonth() + 1).toString().padStart(2, '0');
    const y = val.getFullYear();
    return `${d}-${m}-${y}`;
  }

  // If it's a number (Excel serial date)
  if (typeof val === "number") {
    try {
      const dateObj = XLSX.SSF.parse_date_code(val);
      const d = dateObj.d.toString().padStart(2, '0');
      const m = dateObj.m.toString().padStart(2, '0');
      const y = dateObj.y;
      return `${d}-${m}-${y}`;
    } catch {
      // ignore parsing error and try normal string processing
    }
  }

  const str = String(val).trim();
  
  // YYYY-MM-DD or YYYY/MM/DD
  const yyyymmdd = /^(\d{4})[-/](\d{2})[-/](\d{2})/;
  if (yyyymmdd.test(str)) {
    const match = str.match(yyyymmdd);
    if (match) {
      return `${match[3]}-${match[2]}-${match[1]}`;
    }
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const ddmmyyyy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/;
  if (ddmmyyyy.test(str)) {
    const match = str.match(ddmmyyyy);
    if (match) {
      return `${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}-${match[3]}`;
    }
  }

  return str;
}

/**
 * Parses the Excel file and extracts Caddis sales data
 */
export async function parseCaddisExcel(file: File): Promise<ProcessedVoucher[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, {
          type: "array",
          cellDates: true, // Auto-parse dates
        });

        // Use the first sheet
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Parse rows as JSON objects
        const rows = XLSX.utils.sheet_to_json<CaddisRow>(sheet, { defval: "" });
        
        if (rows.length === 0) {
          resolve([]);
          return;
        }

        // Validate basic headers
        const sampleRow = rows[0];
        const requiredHeaders = ["Factura Tipo", "Factura Nro", "Factura Fecha", "Total"];
        const missingHeaders = requiredHeaders.filter(h => !(h in sampleRow));
        
        if (missingHeaders.length > 0) {
          reject(new Error(`El archivo Excel no contiene las columnas requeridas: ${missingHeaders.join(", ")}`));
          return;
        }

        const processed: ProcessedVoucher[] = rows.map((row, idx) => {
          const id = `row-${idx}`;
          const typeRaw = String(row["Factura Tipo"] || "").trim().toUpperCase();
          const invoiceNo = String(row["Factura Nro"] || "").trim();
          const dateRaw = row["Factura Fecha"];
          const totalRaw = row["Total"];

          // 1. Check if ignored type
          if (IGNORE_TYPES.has(typeRaw)) {
            return {
              id,
              originalRow: row,
              status: "ignored",
              errorReason: `Tipo de factura '${typeRaw}' configurado para ignorar.`,
            };
          }

          // 2. Validate type
          const idComprobante = COMPROBANTE_MAP[typeRaw];
          if (!idComprobante) {
            return {
              id,
              originalRow: row,
              status: "invalid",
              errorReason: `Tipo de factura '${typeRaw}' desconocido o no mapeado.`,
            };
          }

          // 3. Extract PtoVenta and NroComprobante from Factura Nro
          let ptoVenta = "";
          let nroComprobante = "";
          
          if (invoiceNo.includes("-")) {
            const parts = invoiceNo.split("-");
            ptoVenta = parts[0].trim().padStart(4, "0");
            nroComprobante = parts[1].trim().padStart(9, "0");
          } else if (invoiceNo) {
            // Fallback: If no hyphen, look for "PDV" column
            const pdvRaw = String(row["PDV"] || "").trim();
            ptoVenta = pdvRaw ? pdvRaw.padStart(4, "0") : "0001";
            nroComprobante = invoiceNo.padStart(9, "0");
          } else {
            return {
              id,
              originalRow: row,
              status: "invalid",
              errorReason: "Número de factura vacío.",
            };
          }

          // Validate numbers
          if (ptoVenta.length > 4 || isNaN(Number(ptoVenta))) {
            return {
              id,
              originalRow: row,
              status: "invalid",
              errorReason: `Punto de venta inválido: '${ptoVenta}' (debe ser numérico de hasta 4 dígitos).`,
            };
          }
          if (nroComprobante.length > 9 || isNaN(Number(nroComprobante))) {
            return {
              id,
              originalRow: row,
              status: "invalid",
              errorReason: `Número de comprobante inválido: '${nroComprobante}' (debe ser numérico de hasta 9 dígitos).`,
            };
          }

          // 4. Parse Total and calculate Net / Tax
          const totalNum = Number(totalRaw);
          if (isNaN(totalNum)) {
            return {
              id,
              originalRow: row,
              status: "invalid",
              errorReason: `Total inválido: '${totalRaw}' (debe ser numérico).`,
            };
          }

          const importeNeto = Number((totalNum / 1.21).toFixed(2));
          const importeImpuestos = Number((totalNum - importeNeto).toFixed(2));

          // 5. Parse Date
          const formattedDate = formatToMonitoringDate(dateRaw);
          if (!formattedDate) {
            return {
              id,
              originalRow: row,
              status: "invalid",
              errorReason: "Fecha de factura vacía o no válida.",
            };
          }

          // 6. Build the mapped Monitoring Comprobante object
          const mapped: MonitoringComprobante = {
            Fecha: formattedDate,
            Hora: "00:00:00",
            IdComprobante: idComprobante,
            PtoVenta: ptoVenta,
            NroComprobante: nroComprobante,
            Detalles: [
              {
                DescripcionItem: "Venta",
                Cantidad: "1",
                ImporteNeto: importeNeto.toFixed(2),
                ImporteImpuestos: importeImpuestos.toFixed(2),
                Alicuota: typeRaw === "X" ? "0" : "21",
                rubro: String(row["rubro"] || row["Rubro"] || row["Empresa"] || "1").trim(),
              },
            ],
            Pagos: [
              {
                MedioPago: "OTROS",
                Importe: totalNum.toFixed(2),
              },
            ],
          };

          return {
            id,
            originalRow: row,
            status: "valid",
            mapped,
          };
        });

        resolve(processed);
      } catch (err: any) {
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(new Error("Error al leer el archivo Excel."));
    };

    reader.readAsArrayBuffer(file);
  });
}
