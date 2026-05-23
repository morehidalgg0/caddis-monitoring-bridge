"use client";

import React, { useState, useRef, useTransition } from "react";
import { parseCaddisExcel, ProcessedVoucher, COMPROBANTE_MAP, IGNORE_TYPES, formatToMonitoringDate } from "./utils/parser";

export default function Home() {
  // Credentials & Config State
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [idCliente, setIdCliente] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // File & Parsing State
  const [file, setFile] = useState<File | null>(null);
  const [vouchers, setVouchers] = useState<ProcessedVoucher[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // UI States
  const [filter, setFilter] = useState<"all" | "valid" | "ignored" | "invalid">("all");
  const [expandedVoucherId, setExpandedVoucherId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // API Call States
  const [isPending, startTransition] = useTransition();
  const [apiResult, setApiResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stats
  const totalCount = vouchers.length;
  const validCount = vouchers.filter((v) => v.status === "valid").length;
  const ignoredCount = vouchers.filter((v) => v.status === "ignored").length;
  const invalidCount = vouchers.filter((v) => v.status === "invalid").length;

  const totalAmount = vouchers
    .filter((v) => v.status === "valid")
    .reduce((sum, v) => sum + Number(v.originalRow["Total"] || 0), 0);

  // Handle Drag Events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Handle Drop Event
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (
        droppedFile.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        droppedFile.name.endsWith(".xlsx")
      ) {
        await processFile(droppedFile);
      } else {
        setParseError("Por favor, suba únicamente archivos Excel (.xlsx)");
      }
    }
  };

  // Handle File Input Change
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  // Trigger File Input Click
  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Process the Excel file
  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsParsing(true);
    setParseError(null);
    setApiResult(null);
    setVouchers([]);

    try {
      const result = await parseCaddisExcel(selectedFile);
      setVouchers(result);
    } catch (err: any) {
      setParseError(err.message || "Error al procesar el archivo Excel.");
    } finally {
      setIsParsing(false);
    }
  };

  // Reset file upload state
  const handleReset = () => {
    setFile(null);
    setVouchers([]);
    setParseError(null);
    setApiResult(null);
    setFilter("all");
    setExpandedVoucherId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Submit to proxy API Route
  const handleSubmitSales = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validCount === 0) return;

    // Filter valid vouchers and map them to the proper Monitoring payload format
    const payloadComprobantes = vouchers
      .filter((v) => v.status === "valid" && v.mapped)
      .map((v) => v.mapped);

    setApiResult(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/monitoring", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            usuario,
            clave,
            idCliente: idCliente.padStart(6, "0"), // Ensure 6-digit padding
            comprobantes: payloadComprobantes,
            customBaseUrl: customBaseUrl.trim() || undefined,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          setApiResult({
            success: true,
            message: data.message || "Ventas reportadas con éxito.",
            details: data.data,
          });
        } else {
          setApiResult({
            success: false,
            message: data.error || "Ocurrió un error al procesar el envío.",
            details: data.details,
          });
        }
      } catch (err: any) {
        setApiResult({
          success: false,
          message: "No se pudo establecer comunicación con el servidor proxy.",
          details: err.message || String(err),
        });
      }
    });
  };

  // Filtered Vouchers
  const filteredVouchers = vouchers.filter((v) => {
    if (filter === "all") return true;
    return v.status === filter;
  });

  return (
    <div className="flex-1 bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      {/* Top Header */}
      <header className="border-b border-slate-900 bg-slate-900/30 backdrop-blur-md sticky top-0 z-10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-violet-400 via-indigo-200 to-cyan-400 bg-clip-text text-transparent">
                SolutionsMalls Monitoring Bridge
              </h1>
              <p className="text-xs text-slate-400">Intermediario de reportes de venta: Caddis a SolutionsMalls</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-800/80 self-start sm:self-auto">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Listo para reportar
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row gap-6">
        
        {/* Left Column: Config Form & File Upload */}
        <div className="w-full lg:w-96 flex flex-col gap-6 shrink-0">
          
          {/* Section 1: Credentials Form */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
            <div className="absolute -right-16 -top-16 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors duration-500" />
            <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Credenciales de API
            </h2>

            <form onSubmit={handleSubmitSales} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1" htmlFor="usuario">
                  Usuario Monitoring
                </label>
                <input
                  id="usuario"
                  type="text"
                  required
                  placeholder="Ingrese el usuario"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition duration-200"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1" htmlFor="clave">
                  Clave Monitoring
                </label>
                <input
                  id="clave"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition duration-200"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1" htmlFor="idCliente">
                  IdCliente (Nro. Identificador)
                </label>
                <div className="relative">
                  <input
                    id="idCliente"
                    type="text"
                    required
                    maxLength={6}
                    placeholder="Ej: 000055"
                    value={idCliente}
                    onChange={(e) => setIdCliente(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition duration-200 tracking-wider"
                  />
                   {idCliente && idCliente.length < 6 && (
                    <span className="absolute right-3 top-3 text-[10px] text-slate-400 italic">
                      Se enviará como: {idCliente.padStart(6, "0")}
                    </span>
                  )}
                </div>
              </div>

              {/* Advanced settings collapsed */}
              <div className="pt-2 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition"
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${showAdvanced ? "rotate-90" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                  Configuración Avanzada (URL API)
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-2 animate-fadeIn">
                    <label className="block text-[10px] font-medium text-slate-400" htmlFor="customBaseUrl">
                      URL Base de Monitoreo (Opcional)
                    </label>
                    <input
                      id="customBaseUrl"
                      type="url"
                      placeholder="https://app-argentina.solutionsmalls.com:22472/..."
                      value={customBaseUrl}
                      onChange={(e) => setCustomBaseUrl(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition duration-200"
                    />
                    <p className="text-[10px] text-slate-500 italic">
                      Dejar en blanco para usar el valor predeterminado del servidor.
                    </p>
                  </div>
                )}
              </div>
            </form>
          </div>

          {/* Section 2: Drag & Drop File Upload */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl flex-1 flex flex-col justify-between min-h-[220px]">
            <h2 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Cargar Facturas
            </h2>

            {!file ? (
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={onButtonClick}
                className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center cursor-pointer transition duration-300 ${
                  dragActive
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-950/80"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileChange}
                  className="hidden"
                />
                
                <div className={`p-3 rounded-full mb-3 bg-slate-900/80 border border-slate-800 text-indigo-400 group-hover:text-indigo-300 transition duration-300 ${isParsing ? "animate-pulse" : ""}`}>
                  {isParsing ? (
                    <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  )}
                </div>

                <p className="text-sm font-medium text-slate-300">
                  {isParsing ? "Procesando Excel..." : "Arrastrá tu Excel aquí"}
                </p>
                <p className="text-xs text-slate-500 mt-1">o hacé clic para buscar en tu equipo</p>
                <span className="inline-block mt-3 text-[10px] bg-slate-900 text-slate-400 border border-slate-800 px-2 py-0.5 rounded">
                  Soporta .xlsx
                </span>
              </div>
            ) : (
              <div className="flex-1 bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-200 truncate" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-900 transition"
                    title="Eliminar archivo"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Total detectado:</span>
                  <span className="text-xs font-semibold bg-indigo-500/10 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
                    {totalCount} filas
                  </span>
                </div>
              </div>
            )}

            {parseError && (
              <div className="mt-3 bg-red-950/40 border border-red-900/60 rounded-xl p-3 text-xs text-red-300 flex items-start gap-2">
                <svg className="w-4 h-4 shrink-0 text-red-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="min-w-0">
                  <p className="font-semibold">Error al leer archivo</p>
                  <p className="text-[11px] text-red-400/90">{parseError}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Preview & Submissions */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          
          {/* Main Dashboard Preview Card */}
          {vouchers.length > 0 ? (
            <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl shadow-xl flex-1 flex flex-col overflow-hidden">
              
              {/* Card Header & Statistics */}
              <div className="p-6 border-b border-slate-800 bg-slate-900/20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-100">Vista Previa de Comprobantes</h2>
                    <p className="text-xs text-slate-400">Verificá los comprobantes parseados antes de subirlos a la API</p>
                  </div>
                  {validCount > 0 && (
                    <div className="flex items-baseline gap-2 bg-slate-950/80 px-4 py-2 rounded-xl border border-slate-800 self-start md:self-auto">
                      <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Monto Válido Total:</span>
                      <span className="text-lg font-black text-indigo-400">${totalAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>

                {/* Dashboard Stats Panel */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Total */}
                  <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl flex flex-col">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total</span>
                    <span className="text-2xl font-extrabold text-indigo-200 mt-1">{totalCount}</span>
                    <span className="text-[10px] text-slate-500 mt-0.5">Leídos del Excel</span>
                  </div>

                  {/* Valid */}
                  <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl flex flex-col">
                    <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">A enviar</span>
                    <span className="text-2xl font-extrabold text-emerald-400 mt-1">{validCount}</span>
                    <span className="text-[10px] text-slate-500 mt-0.5">Mapeo correcto</span>
                  </div>

                  {/* Ignored */}
                  <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl flex flex-col">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ignorados</span>
                    <span className="text-2xl font-extrabold text-slate-300 mt-1">{ignoredCount}</span>
                    <span className="text-[10px] text-slate-500 mt-0.5">PP, R o RC</span>
                  </div>

                  {/* Invalid */}
                  <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl flex flex-col">
                    <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Errores</span>
                    <span className="text-2xl font-extrabold text-red-400 mt-1">{invalidCount}</span>
                    <span className="text-[10px] text-slate-500 mt-0.5">Formato o tipo inválido</span>
                  </div>
                </div>

                {/* Filter and Confirm Block */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mt-6 pt-4 border-t border-slate-800/60">
                  {/* Tabs */}
                  <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs self-start">
                    <button
                      type="button"
                      onClick={() => setFilter("all")}
                      className={`px-3 py-1.5 rounded font-medium transition ${
                        filter === "all" ? "bg-indigo-600 text-white font-semibold" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Todos ({totalCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilter("valid")}
                      className={`px-3 py-1.5 rounded font-medium transition ${
                        filter === "valid" ? "bg-emerald-600 text-white font-semibold" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Válidos ({validCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilter("ignored")}
                      className={`px-3 py-1.5 rounded font-medium transition ${
                        filter === "ignored" ? "bg-slate-700 text-white font-semibold" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Ignorados ({ignoredCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilter("invalid")}
                      className={`px-3 py-1.5 rounded font-medium transition ${
                        filter === "invalid" ? "bg-red-900/60 text-red-200 font-semibold" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Errores ({invalidCount})
                    </button>
                  </div>

                  {/* Submission Form trigger */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-850 rounded-xl border border-slate-800 transition duration-200"
                    >
                      Limpiar
                    </button>
                    <button
                      onClick={handleSubmitSales}
                      disabled={validCount === 0 || !usuario || !clave || !idCliente || isPending}
                      className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.98] transition flex items-center gap-2"
                    >
                      {isPending ? (
                        <>
                          <svg className="w-3.5 h-3.5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Enviando...
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          Enviar a Monitoring ({validCount})
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {(!usuario || !clave || !idCliente) && validCount > 0 && (
                  <p className="text-[11px] text-amber-500 mt-2 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Por favor complete el Usuario, Clave e IdCliente en el panel izquierdo para habilitar el envío.
                  </p>
                )}
              </div>

              {/* Table Container */}
              <div className="flex-1 overflow-x-auto min-h-[300px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-semibold tracking-wider">
                      <th className="py-3 px-4 w-28">Estado</th>
                      <th className="py-3 px-4">Tipo</th>
                      <th className="py-3 px-4">Nro Factura</th>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4 text-right">Monto Total</th>
                      <th className="py-3 px-4 text-center w-24">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filteredVouchers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500 italic">
                          No hay comprobantes que coincidan con el filtro seleccionado.
                        </td>
                      </tr>
                    ) : (
                      filteredVouchers.map((voucher) => {
                        const isExpanded = expandedVoucherId === voucher.id;
                        return (
                          <React.Fragment key={voucher.id}>
                            <tr
                              className={`hover:bg-slate-900/30 transition group ${
                                isExpanded ? "bg-slate-900/10" : ""
                              }`}
                            >
                              <td className="py-3.5 px-4">
                                {voucher.status === "valid" && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    Válido
                                  </span>
                                )}
                                {voucher.status === "ignored" && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                    Ignorado
                                  </span>
                                )}
                                {voucher.status === "invalid" && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                    Error
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 font-semibold text-slate-300">
                                {voucher.originalRow["Factura Tipo"] || "N/A"}
                              </td>
                              <td className="py-3.5 px-4 font-mono text-slate-300">
                                {voucher.originalRow["Factura Nro"] || "N/A"}
                              </td>
                              <td className="py-3.5 px-4 text-slate-400">
                                {voucher.mapped?.Fecha || formatToMonitoringDate(voucher.originalRow["Factura Fecha"])}
                              </td>
                              <td className="py-3.5 px-4 text-right font-semibold text-slate-200">
                                ${Number(voucher.originalRow["Total"] || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => setExpandedVoucherId(isExpanded ? null : voucher.id)}
                                  className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline inline-flex items-center gap-0.5 font-medium transition"
                                >
                                  {isExpanded ? "Ocultar" : "Ver JSON"}
                                  <svg
                                    className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                              </td>
                            </tr>

                            {/* Detail Panel */}
                            {isExpanded && (
                              <tr className="bg-slate-950/70">
                                <td colSpan={6} className="py-4 px-6 border-l-2 border-indigo-500">
                                  <div className="space-y-3">
                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                      Detalles de Mapeo
                                    </h4>

                                    {voucher.status === "valid" && voucher.mapped ? (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                                          <p className="text-[10px] text-slate-500 font-bold uppercase">JSON Mapeado (Comprobante)</p>
                                          <pre className="mt-2 text-[10.5px] font-mono text-indigo-300 overflow-x-auto whitespace-pre-wrap max-h-48">
                                            {JSON.stringify(voucher.mapped, null, 2)}
                                          </pre>
                                        </div>
                                        <div className="space-y-2 text-xs">
                                          <div className="flex justify-between border-b border-slate-900 py-1">
                                            <span className="text-slate-500">IdComprobante:</span>
                                            <span className="font-semibold text-slate-300">
                                              {voucher.mapped.IdComprobante} ({COMPROBANTE_MAP[String(voucher.originalRow["Factura Tipo"]).toUpperCase()] === "001" ? "Factura A" : COMPROBANTE_MAP[String(voucher.originalRow["Factura Tipo"]).toUpperCase()] === "006" ? "Factura B" : "Otro"})
                                            </span>
                                          </div>
                                          <div className="flex justify-between border-b border-slate-900 py-1">
                                            <span className="text-slate-500">Punto de Venta:</span>
                                            <span className="font-mono font-semibold text-slate-300">{voucher.mapped.PtoVenta}</span>
                                          </div>
                                          <div className="flex justify-between border-b border-slate-900 py-1">
                                            <span className="text-slate-500">Nro Comprobante:</span>
                                            <span className="font-mono font-semibold text-slate-300">{voucher.mapped.NroComprobante}</span>
                                          </div>
                                          <div className="flex justify-between border-b border-slate-900 py-1">
                                            <span className="text-slate-500">Importe Neto (IVA 21%):</span>
                                            <span className="font-semibold text-slate-300">${voucher.mapped.Detalles[0].ImporteNeto}</span>
                                          </div>
                                          <div className="flex justify-between border-b border-slate-900 py-1">
                                            <span className="text-slate-500">Importe Impuestos (21%):</span>
                                            <span className="font-semibold text-slate-300">${voucher.mapped.Detalles[0].ImporteImpuestos}</span>
                                          </div>
                                          <div className="flex justify-between border-b border-slate-900 py-1">
                                            <span className="text-slate-500">Importe Total (Pagos):</span>
                                            <span className="font-semibold text-emerald-400">${voucher.mapped.Pagos[0].Importe}</span>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-800">
                                        <div className="flex gap-2 text-amber-500 items-start">
                                          <svg className="w-4.5 h-4.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                          </svg>
                                          <div>
                                            <p className="font-semibold text-xs">Razón de Exclusión / Error:</p>
                                            <p className="text-slate-400 mt-1">{voucher.errorReason || "Sin detalles específicos del error."}</p>
                                          </div>
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-slate-800">
                                          <p className="text-[10px] text-slate-500 font-bold uppercase">Fila Original en Excel</p>
                                          <pre className="mt-2 text-[10px] font-mono text-slate-400 overflow-x-auto whitespace-pre-wrap max-h-32">
                                            {JSON.stringify(voucher.originalRow, null, 2)}
                                          </pre>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            // Placeholder Dashboard State
            <div className="flex-1 bg-slate-900/10 border-2 border-dashed border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 bg-slate-900/60 border border-slate-800 text-indigo-400 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-300">No hay datos para mostrar</h3>
              <p className="text-sm text-slate-500 max-w-md mt-2">
                Por favor complete las credenciales y suba el archivo de exportación de Caddis (.xlsx) en el panel izquierdo para ver la vista previa y mapeo de los comprobantes.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 w-full max-w-lg text-left">
                <div className="p-4 bg-slate-900/30 border border-slate-800 rounded-xl">
                  <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 bg-indigo-500 rounded-full" />
                    Columnas Requeridas
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    El Excel debe incluir: Factura Tipo, Factura Nro, Factura Fecha, Total. Opcionales: PDV, Empresa.
                  </p>
                </div>
                <div className="p-4 bg-slate-900/30 border border-slate-800 rounded-xl">
                  <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 bg-indigo-500 rounded-full" />
                    Mapeo Automático
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Se discriminan importes neto e impuestos al 21% y se mapean tipos (como EB, TK, EA, etc.) a códigos SolutionsMalls.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Results Summary Modal / Feedback Overlay */}
          {apiResult && (
            <div className={`p-5 rounded-2xl border transition duration-300 animate-slideUp ${
              apiResult.success 
                ? "bg-emerald-950/20 border-emerald-900/60 text-emerald-100" 
                : "bg-red-950/20 border-red-900/60 text-red-100"
            }`}>
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-xl shrink-0 ${
                  apiResult.success ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                }`}>
                  {apiResult.success ? (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold">
                    {apiResult.success ? "¡Ventas Informadas con Éxito!" : "Error al informar ventas"}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">{apiResult.message}</p>
                  
                  {apiResult.success && (
                    <div className="mt-3 flex items-center gap-4 text-xs">
                      <div className="bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
                        <span className="text-slate-500">Reportados:</span>{" "}
                        <span className="font-semibold text-emerald-400">{validCount} comprobantes</span>
                      </div>
                      <div className="bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
                        <span className="text-slate-500">Monto total:</span>{" "}
                        <span className="font-semibold text-indigo-300">${totalAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )}

                  {apiResult.details && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => {
                          const detailEl = document.getElementById("api-detail-json");
                          if (detailEl) {
                            detailEl.classList.toggle("hidden");
                          }
                        }}
                        className={`text-xs font-semibold hover:underline ${
                          apiResult.success ? "text-emerald-400 hover:text-emerald-300" : "text-red-400 hover:text-red-300"
                        }`}
                      >
                        Ver detalles de respuesta
                      </button>
                      <pre
                        id="api-detail-json"
                        className="hidden mt-2 p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400 overflow-x-auto whitespace-pre-wrap max-h-48"
                      >
                        {JSON.stringify(apiResult.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setApiResult(null)}
                  className="p-1 rounded-md text-slate-500 hover:text-slate-300 transition"
                  title="Cerrar mensaje"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-600 bg-slate-950">
        <p>SolutionsMalls Monitoring Bridge &copy; {new Date().getFullYear()} - Conector de Reporte de Ventas Caddis</p>
      </footer>
    </div>
  );
}
