# SolutionsMalls Monitoring Bridge

Este es un puente intermediario web moderno construido con **Next.js 15 (App Router)**, **TypeScript** y **Tailwind CSS v4** para procesar las exportaciones de ventas del sistema POS **Caddis** y reportarlas de forma automatizada y validada a la API REST de **SolutionsMalls Monitoring**.

## Características

- 📊 **Carga de Archivo Excel (.xlsx):** Subida drag-and-drop del reporte diario de Caddis.
- ⚡ **Procesamiento del Lado del Cliente:** El archivo Excel se lee y parsea localmente en el navegador usando [SheetJS (xlsx)](https://sheetjs.com/).
- 🛡️ **Seguridad y Evasión de CORS:** El envío de ventas y autenticación se realiza mediante una API proxy (`/api/monitoring`), previniendo errores de CORS en el navegador y ocultando credenciales de terceros.
- 🔍 **Vista Previa de Comprobantes:** Permite revisar cada comprobante con su mapeo final a JSON y muestra un resumen estadístico (comprobantes válidos, ignorados, erróneos).
- 🏷️ **Mapeo Automático de Comprobantes:** Conversión exacta de códigos de facturación Caddis a los códigos ID de SolutionsMalls.

---

## Mapeos y Reglas de Negocio

La aplicación implementa las siguientes transformaciones del Excel:

### 1. Tipos de Comprobante (Caddis → SolutionsMalls `IdComprobante`)
*   `EA` / `IA` ➔ `001` (Factura A)
*   `EB` / `TK` ➔ `006` (Factura B)
*   `NCEA` ➔ `003` (Nota de Crédito A)
*   `NCEB` / `NCIB` / `NCX` ➔ `008` (Nota de Crédito B)
*   `NDEB` ➔ `007` (Nota de Débito B)
*   `X` ➔ `083` (Ticket)
*   `PP`, `R`, `RC` ➔ **Ignorar** (no reportados, marcados como "Ignorados" en la vista previa)

### 2. Formato de Factura (`Factura Nro`)
El formato esperado es `XXXX-XXXXXXXX` (ej: `0031-000002537`).
*   **Punto de Venta (`PtoVenta`):** Se extrae de la parte izquierda antes del guión (se autocompleta con ceros a la izquierda hasta 4 dígitos).
*   **Número de Comprobante (`NroComprobante`):** Se extrae de la parte derecha (se autocompleta con ceros a la izquierda hasta 9 dígitos).
*   *Nota:* Si no hay guión, la aplicación intentará usar la columna `PDV` como Punto de Venta y el valor de `Factura Nro` completo como número de comprobante.

### 3. Cálculos de IVA (Impuestos)
El Excel exporta el `Total` (importe con IVA incluido). El mapeo de la API requiere Neto e Impuestos (21%):
*   `ImporteNeto = Total / 1.21` (Redondeado a 2 decimales).
*   `ImporteImpuestos = Total - ImporteNeto` (Redondeado a 2 decimales).
*   Esto asegura que matemáticamente `ImporteNeto + ImporteImpuestos = Total` sin desajustes decimales.

### 4. Fecha y Hora
*   La fecha se convierte del formato de Excel o `YYYY-MM-DD` a `DD-MM-YYYY`.
*   La hora se reporta por defecto como `00:00:00`.

---

## Cómo Correr Localmente

### Requisitos Previos
*   Node.js (versión 18 o superior)
*   npm

### Pasos
1.  **Instalar dependencias:**
    ```bash
    npm install
    ```
2.  **Configurar Variables de Entorno:**
    Copia el archivo de ejemplo para crear tu `.env.local`:
    ```bash
    cp .env.local.example .env.local
    ```
    El archivo contiene:
    `MONITORING_BASE_URL=https://app-argentina.solutionsmalls.com:22472/SolutionsREMultiespacioBendu_BackEnd`
    *(Puedes modificar este valor si cambia la URL base).*

3.  **Iniciar Servidor de Desarrollo:**
    ```bash
    npm run dev
    ```
    Abre [http://localhost:3000](http://localhost:3000) en tu navegador para usar la aplicación.

4.  **Generar Compilación de Producción:**
    ```bash
    npm run build
    npm run start
    ```

---

## Despliegue en Vercel

Esta aplicación está lista para ser desplegada en **Vercel** con un solo clic.

### Pasos de Despliegue:
1.  Sube el código a tu repositorio de GitHub, GitLab o Bitbucket.
2.  Inicia sesión en [Vercel](https://vercel.com/) y crea un **Nuevo Proyecto**.
3.  Importa el repositorio de la aplicación.
4.  **Configura las Variables de Entorno (Environment Variables):**
    Agrega la siguiente variable en la sección de configuración del proyecto en Vercel:
    *   **Nombre:** `MONITORING_BASE_URL`
    *   **Valor:** `https://app-argentina.solutionsmalls.com:22472/SolutionsREMultiespacioBendu_BackEnd`
5.  Haz clic en **Deploy**. ¡Listo! Vercel aprovisionará las Serverless Functions para el API handler y el frontend estático automáticamente.
