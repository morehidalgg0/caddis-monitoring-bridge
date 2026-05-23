import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
        const { usuario, clave, idCliente, comprobantes, customBaseUrl } = await request.json();

    // Validate request inputs
    if (!usuario || !clave) {
      return NextResponse.json(
        { error: "Usuario y clave son requeridos para la autenticación." },
        { status: 400 }
      );
    }
    if (!idCliente) {
      return NextResponse.json(
        { error: "IdCliente es requerido." },
        { status: 400 }
      );
    }
    if (!comprobantes || !Array.isArray(comprobantes) || comprobantes.length === 0) {
      return NextResponse.json(
        { error: "No hay comprobantes válidos para enviar." },
        { status: 400 }
      );
    }

    const baseUrl =
      customBaseUrl ||
      process.env.MONITORING_BASE_URL ||
      "https://app-argentina.solutionsmalls.com:22472/SolutionsREMultiespacioBendu_BackEnd";

    // 1. Authenticate with SolutionsMalls API
    const authUrl = `${baseUrl.replace(/\/$/, "")}/api/autenticacion/obtenerTokenAcceso`;
    
    let token: string;
    try {
      const authResponse = await fetch(authUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ usuario, clave }),
      });

      if (!authResponse.ok) {
        const errorText = await authResponse.text();
        console.error("Auth API failure response:", errorText);
        return NextResponse.json(
          {
            error: "Error de autenticación con SolutionsMalls. Verifique usuario y clave.",
            details: errorText,
          },
          { status: authResponse.status }
        );
      }

      const authData = await authResponse.json();
      if (!authData.token) {
        return NextResponse.json(
          { error: "La API de autenticación no retornó un token válido.", details: authData },
          { status: 500 }
        );
      }
      token = authData.token;
    } catch (authErr: any) {
      console.error("Auth fetch exception:", authErr);
      return NextResponse.json(
        {
          error: "No se pudo conectar con el servidor de autenticación de SolutionsMalls.",
          details: authErr.message || String(authErr),
        },
        { status: 502 }
      );
    }

    // 2. Inform sales with SolutionsMalls API
    const salesUrl = `${baseUrl.replace(/\/$/, "")}/api/monitoring/informarVentas`;
    const salesBody = {
      IdCliente: idCliente,
      Comprobantes: comprobantes,
    };

    try {
      const salesResponse = await fetch(salesUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(salesBody),
      });

      const responseText = await salesResponse.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { message: responseText };
      }

      if (!salesResponse.ok) {
        return NextResponse.json(
          {
            error: `Error al informar ventas (Código ${salesResponse.status})`,
            details: responseData,
          },
          { status: salesResponse.status }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Ventas informadas con éxito.",
        data: responseData,
      });
    } catch (salesErr: any) {
      console.error("Sales fetch exception:", salesErr);
      return NextResponse.json(
        {
          error: "No se pudo conectar con el servidor de monitoreo al enviar las ventas.",
          details: salesErr.message || String(salesErr),
        },
        { status: 502 }
      );
    }
  } catch (err: any) {
    console.error("Route exception handler:", err);
    return NextResponse.json(
      { error: "Error interno del servidor.", details: err.message || String(err) },
      { status: 500 }
    );
  }
}
