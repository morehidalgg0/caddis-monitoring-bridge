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
  Rubro?: string;
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
  PP: "083",   // Ticket
  R: "083",    // Ticket
  RC: "083",   // Ticket
};

// Types that should be ignored
export const IGNORE_TYPES = new Set<string>();

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
        const isNewSchema = "Tipo" in sampleRow && "Nro" in sampleRow && "Fecha" in sampleRow;
        
        const requiredHeaders = isNewSchema
          ? ["Tipo", "Nro", "Fecha", "Precio Neto"]
          : ["Factura Tipo", "Factura Nro", "Factura Fecha", "Total"];
          
        const missingHeaders = requiredHeaders.filter(h => !(h in sampleRow));
        
        if (missingHeaders.length > 0) {
          reject(new Error(`El archivo Excel no contiene las columnas requeridas: ${missingHeaders.join(", ")}`));
          return;
        }

        const processed: ProcessedVoucher[] = rows.map((row, idx) => {
          const id = `row-${idx}`;

          // Si es el nuevo esquema, sobreescribimos Total con Precio Neto para la UI y la sumatoria
          if (isNewSchema && "Precio Neto" in row) {
            row["Total"] = row["Precio Neto"];
          }

          const typeRaw = String(row[isNewSchema ? "Tipo" : "Factura Tipo"] || "").trim().toUpperCase();
          const invoiceNo = String(row[isNewSchema ? "Nro" : "Factura Nro"] || "").trim();
          const dateRaw = row[isNewSchema ? "Fecha" : "Factura Fecha"];

          // Normalizar las propiedades de row para que la UI siempre las encuentre con sus nombres estándar
          row["Factura Tipo"] = typeRaw;
          row["Factura Nro"] = invoiceNo;
          row["Factura Fecha"] = dateRaw;

          // 1. Check if ignored type
          if (IGNORE_TYPES.has(typeRaw)) {
            return {
              id,
              originalRow: row,
              status: "ignored",
              errorReason: `Tipo de factura '${typeRaw}' configurado para ignorar.`,
            };
          }

          // Helper to normalize strings (remove accents/diacritics)
          const normalizeText = (text: string) => 
            text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

          const cleanTypeRaw = normalizeText(typeRaw);

          // 2. Validate type (fallback to Ticket "083" if unknown)
          let idComprobante = "083";
          const matchedKey = Object.keys(COMPROBANTE_MAP).find(key => {
            const cleanKey = normalizeText(key);
            return (
              cleanTypeRaw === cleanKey || 
              cleanTypeRaw.startsWith(cleanKey + " ") || 
              cleanTypeRaw.startsWith(cleanKey + "(") ||
              cleanTypeRaw.startsWith(cleanKey + "-")
            );
          });
          if (matchedKey) {
            idComprobante = COMPROBANTE_MAP[matchedKey];
          }

          // 3. Extract PtoVenta and NroComprobante from Factura Nro / Nro
          let ptoVenta = "";
          let nroComprobante = "";
          
          // Replace spaces with hyphens to support both formats (e.g. 0031 00002360)
          const cleanInvoiceNo = invoiceNo.replace(/\s+/g, "-").trim();
          
          if (cleanInvoiceNo.includes("-")) {
            const parts = cleanInvoiceNo.split("-");
            ptoVenta = parts[0].trim().padStart(4, "0");
            nroComprobante = parts[1].trim().padStart(9, "0");
          } else if (/^\d+$/.test(cleanInvoiceNo)) {
            // Reconstruct format from a pure numeric representation (e.g. "3100002774")
            const padded = cleanInvoiceNo.padStart(13, "0");
            ptoVenta = padded.slice(0, 4);
            nroComprobante = padded.slice(4);
          } else if (invoiceNo) {
            // Fallback: If no hyphen, look for "PDV" column
            const pdvRaw = String(row["PDV"] || "").trim();
            if (pdvRaw) {
              ptoVenta = pdvRaw.padStart(4, "0");
              nroComprobante = invoiceNo.padStart(9, "0");
            } else {
              // No PDV column, use first 4 characters as PtoVenta, rest as NroComprobante
              const padded = invoiceNo.trim().padStart(13, "0");
              ptoVenta = padded.slice(0, 4);
              nroComprobante = padded.slice(4);
            }
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

          // 4. Parse amounts
          let totalNum = 0;
          let importeNeto = 0;
          let importeImpuestos = 0;

          if (isNewSchema) {
            totalNum = Number(row["Total"]);
            if (isNaN(totalNum)) {
              return {
                id,
                originalRow: row,
                status: "invalid",
                errorReason: `Precio Neto inválido: '${row["Precio Neto"]}' (debe ser numérico).`,
              };
            }

            importeNeto = totalNum;
            importeImpuestos = 0.00;
          } else {
            const totalRaw = Number(row["Total"]);
            if (isNaN(totalRaw)) {
              return {
                id,
                originalRow: row,
                status: "invalid",
                errorReason: `Total inválido: '${row["Total"]}' (debe ser numérico).`,
              };
            }

            totalNum = totalRaw;
            importeNeto = Number((totalNum / 1.21).toFixed(2));
            importeImpuestos = Number((totalNum - importeNeto).toFixed(2));
          }

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
                Alicuota: isNewSchema ? "0.00" : (idComprobante === "083" ? "0.00" : "21.00"),
                Rubro: "1",
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
