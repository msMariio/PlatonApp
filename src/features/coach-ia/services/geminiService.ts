import { db, type MensajeChat, type SesionChat } from "../../../core/db";
import { SYSTEM_PROMPT_PERFORMANCE_OS } from "../../../core/ia-prompts";
import { TOOL_DECLARATIONS, type FunctionDeclaration } from "./toolDefinitions";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent";

// ── Tipos internos ───────────────────────────────────────────────────

interface GeminiTextPart {
  text: string;
}

interface GeminiFunctionCallPart {
  functionCall: {
    name: string;
    args: Record<string, unknown>;
  };
  /** Gemini API usa snake_case en peticiones. */
  thought_signature?: string;
  /** Gemini puede devolver camelCase en respuestas (estándar JSON de Google). */
  thoughtSignature?: string;
}

interface GeminiFunctionResponsePart {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
  };
}

type GeminiPart =
  | GeminiTextPart
  | GeminiFunctionCallPart
  | GeminiFunctionResponsePart;

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiTool {
  functionDeclarations: FunctionDeclaration[];
}

interface GeminiRequest {
  system_instruction: {
    parts: GeminiTextPart[];
  };
  contents: GeminiContent[];
  tools?: GeminiTool[];
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: (GeminiTextPart | GeminiFunctionCallPart)[];
    };
    finishReason?: string;
  }[];
  error?: {
    message: string;
  };
}

// ── Resultado de enviar mensaje ─────────────────────────────────────

export interface FunctionCallProposal {
  name: string;
  args: Record<string, unknown>;
  /** Firma de pensamiento requerida por Gemini para reenviar el functionCall en turnos posteriores. */
  thoughtSignature?: string;
}

export interface GeminiResult {
  texto: string | null;
  functionCalls: FunctionCallProposal[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function partIsText(
  p: GeminiTextPart | GeminiFunctionCallPart,
): p is GeminiTextPart {
  return "text" in p;
}

function partIsFunctionCall(
  p: GeminiTextPart | GeminiFunctionCallPart,
): p is GeminiFunctionCallPart {
  return "functionCall" in p;
}

// ── Snapshot ─────────────────────────────────────────────────────────

/**
 * Construye el LOCAL_SNAPSHOT con datos del atleta (perfil, peso,
 * ejercicios, rutinas, planificación e historial de entrenamiento).
 */
async function buildLocalSnapshot(): Promise<string> {
  const perfil = await db.perfil_usuario.get(1);

  // Historial completo de pesos (no solo el último)
  const pesosOrdenados = await db.pesos.orderBy("fecha").toArray();
  const ultimoPeso = pesosOrdenados.length > 0
    ? pesosOrdenados[pesosOrdenados.length - 1]
    : null;

  // ── Métricas de tendencia de peso ──────────────────────────────────
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const hace7Dias = new Date(hoy);
  hace7Dias.setDate(hace7Dias.getDate() - 7);
  const hace30Dias = new Date(hoy);
  hace30Dias.setDate(hace30Dias.getDate() - 30);

  const pesoEnRango = (inicio: Date, fin: Date) => {
    const enRango = pesosOrdenados.filter((p) => {
      const f = new Date(p.fecha);
      return f >= inicio && f <= fin;
    });
    return enRango.length > 0 ? enRango : null;
  };

  const pesoHace7Dias = pesoEnRango(hace7Dias, hoy);
  const pesoHace30Dias = pesoEnRango(hace30Dias, hoy);

  const cambio7Dias =
    ultimoPeso && pesoHace7Dias && pesoHace7Dias.length > 0
      ? +(ultimoPeso.valor - pesoHace7Dias[0].valor).toFixed(1)
      : null;
  const cambio30Dias =
    ultimoPeso && pesoHace30Dias && pesoHace30Dias.length > 0
      ? +(ultimoPeso.valor - pesoHace30Dias[0].valor).toFixed(1)
      : null;

  const tasaSemanal =
    cambio30Dias != null && pesosOrdenados.length >= 2
      ? +(cambio30Dias / 4.29).toFixed(2)
      : cambio7Dias != null
        ? +cambio7Dias.toFixed(2)
        : null;

  const tendenciaPeso =
    tasaSemanal == null
      ? "SIN_DATOS"
      : tasaSemanal > 0.3
        ? "SUBIDA_SIGNIFICATIVA"
        : tasaSemanal > 0.1
          ? "LIGERA_SUBIDA"
          : tasaSemanal < -0.3
            ? "BAJADA_SIGNIFICATIVA"
            : tasaSemanal < -0.1
              ? "LIGERA_BAJADA"
              : "ESTABLE";

  const hace28Dias = new Date();
  hace28Dias.setDate(hace28Dias.getDate() - 28);
  const fechaCorte = hace28Dias.toISOString().slice(0, 10);

  const logsRecientes = await db.logsEntrenamientos
    .where("fecha")
    .aboveOrEqual(fechaCorte)
    .toArray();

  // Calcular edad si hay fecha de nacimiento
  let edad: number | null = null;
  if (perfil?.fechaNacimiento) {
    const nacimiento = new Date(perfil.fechaNacimiento);
    edad = hoy.getFullYear() - nacimiento.getFullYear();
    const mes = hoy.getMonth() - nacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
      edad--;
    }
  }

  // Catálogos completos para que la IA los conozca
  const ejercicios = await db.ejercicios.toArray();
  const ejercicioMap = new Map(ejercicios.map((e) => [e.id, e]));
  const rutinas = await db.rutinas.toArray();
  const rutinaMap = new Map(rutinas.map((r) => [r.id, r]));
  const carpetas = await db.carpetas.toArray();

  // Planificación semanal
  const planificacion = await db.planificacionSemanal.get("default");
  const planSemanal: Record<string, string | null> = {};
  if (planificacion) {
    for (const [dia, config] of Object.entries(planificacion.dias)) {
      if (!config.activo || !config.rutinaId) {
        planSemanal[dia] = null;
      } else {
        planSemanal[dia] =
          rutinaMap.get(config.rutinaId)?.nombre ?? config.rutinaId;
      }
    }
  }

  const snapshot = {
    PERFIL: {
      nombre: perfil?.nombre ?? "NO_CONFIGURADO",
      alturaCm: perfil?.alturaCm ?? "NO_CONFIGURADO",
      edad: edad ?? "NO_CONFIGURADA",
      sexo: perfil?.sexoBio ?? "NO_CONFIGURADO",
      objetivo: perfil?.objetivo ?? "NO_CONFIGURADO",
    },
    HISTORIAL_PESO: {
      ultimo:
        ultimoPeso != null
          ? `${ultimoPeso.valor} kg (${ultimoPeso.fecha})`
          : "NO_REGISTRADO",
      totalRegistros: pesosOrdenados.length,
      cambio7Dias_kg: cambio7Dias,
      cambio30Dias_kg: cambio30Dias,
      tasaSemanal_kg: tasaSemanal,
      tendencia: tendenciaPeso,
      registros: pesosOrdenados.map((p) => ({
        fecha: p.fecha,
        hora: p.hora,
        valor: p.valor,
      })),
    },
    CATALOGO_EJERCICIOS: ejercicios.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      grupoMuscular: e.grupoMuscular,
      tipo: e.tipo,
      descripcion: e.descripcion ?? "",
    })),
    CATALOGO_CARPETAS: carpetas.map((c) => ({
      id: c.id,
      nombre: c.nombre,
    })),
    CATALOGO_RUTINAS: rutinas.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      descripcion: r.descripcion ?? "",
      carpetaId: r.carpetaId ?? null,
      carpetaNombre: carpetas.find((c) => c.id === r.carpetaId)?.nombre ?? null,
      ejercicios: r.ejercicios.map((ej) => {
        const ejercicio = ejercicioMap.get(ej.ejercicioId);
        return {
          ejercicioId: ej.ejercicioId,
          nombre: ejercicio?.nombre ?? ej.ejercicioId,
          tipo: ejercicio?.tipo ?? "fuerza",
          series: ej.series.map((s) => ({
            repsObjetivo: s.repsObjetivo,
            pesoObjetivo: s.pesoObjetivo,
            duracionObjetivoMinutos: s.duracionObjetivoMinutos,
            distanciaObjetivoKm: s.distanciaObjetivoKm,
          })),
        };
      }),
    })),
    PLANIFICACION_SEMANAL:
      planificacion != null ? planSemanal : "NO_CONFIGURADA",
    ENTRENAMIENTOS_ULTIMOS_28_DIAS: logsRecientes.map((log) => ({
      fecha: log.fecha,
      rutina: log.rutinaSnapshot ?? log.rutinaId,
      completado: log.completado,
      ejercicios: log.ejercicios.map((ej) => {
        const ejercicio = ejercicioMap.get(ej.ejercicioId);
        return {
          nombre: ejercicio?.nombre ?? ej.ejercicioId,
          tipo: ejercicio?.tipo ?? "fuerza",
          grupoMuscular: ejercicio?.grupoMuscular ?? "desconocido",
          series: ej.series.map((s) => ({
            peso: s.peso,
            reps: s.reps,
            completado: s.completado,
            rpe: s.rpe,
            duracionMinutos: s.duracionMinutos,
            distanciaKm: s.distanciaKm,
            nivelInclinacion: s.nivelInclinacion,
          })),
        };
      }),
    })),
  };

  return JSON.stringify(snapshot, null, 2);
}

// ── Conversión de mensajes al formato Gemini ─────────────────────────

/**
 * Convierte MensajeChat[] al formato contents[] de Gemini,
 * incluyendo functionCall y functionResponse cuando corresponda.
 */
function mensajesToGeminiContents(mensajes: MensajeChat[]): GeminiContent[] {
  return mensajes.map((m) => {
    const parts: GeminiPart[] = [];

    // Si el mensaje tiene functionCall, va como model con functionCall part
    if (m.functionCall) {
      const fcPart: GeminiPart = {
        functionCall: {
          name: m.functionCall.name,
          args: m.functionCall.args,
        },
      };
      // Incluir thought_signature si está presente (requerido por Gemini)
      if (m.functionCall.thoughtSignature) {
        (fcPart as GeminiFunctionCallPart).thought_signature =
          m.functionCall.thoughtSignature;
      }
      parts.push(fcPart);
      // También puede tener texto (la explicación previa del modelo)
      if (m.texto && m.texto.trim().length > 0) {
        parts.push({ text: m.texto });
      }
    } else if (m.functionResponse) {
      parts.push({ functionResponse: m.functionResponse });
    } else if (m.texto && m.texto.trim().length > 0) {
      parts.push({ text: m.texto });
    }

    return {
      role: m.role,
      parts,
    };
  });
}

// ── Llamada a la API ─────────────────────────────────────────────────

async function callGeminiAPI(
  apiKey: string,
  systemInstruction: string,
  contents: GeminiContent[],
  includeTools: boolean,
): Promise<GeminiResponse> {
  const requestBody: GeminiRequest = {
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    contents,
  };

  if (includeTools) {
    requestBody.tools = [{ functionDeclarations: TOOL_DECLARATIONS }];
  }

  const response = await fetch(
    `${GEMINI_API_BASE}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    },
  );

  if (!response.ok) {
    const errorData = (await response
      .json()
      .catch(() => null)) as GeminiResponse | null;
    const errorMsg =
      errorData?.error?.message ??
      `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(`[!] ERROR GEMINI API: ${errorMsg}`);
  }

  const data = (await response.json()) as GeminiResponse;

  if (data.error) {
    throw new Error(`[!] ERROR GEMINI API: ${data.error.message}`);
  }

  return data;
}

/**
 * Parsea la respuesta de Gemini extrayendo texto y functionCalls.
 */
function parseGeminiResponse(data: GeminiResponse): GeminiResult {
  const parts = data.candidates?.[0]?.content?.parts ?? [];

  const textos: string[] = [];
  const functionCalls: FunctionCallProposal[] = [];

  for (const part of parts) {
    if (partIsText(part)) {
      textos.push(part.text);
    } else if (partIsFunctionCall(part)) {
      functionCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args,
        thoughtSignature: part.thoughtSignature ?? part.thought_signature,
      });
    }
  }

  const texto = textos.length > 0 ? textos.join("\n").trim() : null;

  if (!texto && functionCalls.length === 0) {
    throw new Error(
      "[!] EL MODELO NO GENERÓ RESPUESTA. Revisa los datos e inténtalo de nuevo.",
    );
  }

  return { texto, functionCalls };
}

// ── API pública ──────────────────────────────────────────────────────

/**
 * Envía un mensaje del usuario a Gemini y devuelve la respuesta del modelo,
 * que puede incluir texto y/o llamadas a función (tools).
 */
export async function enviarMensajeAGemini(
  mensajeUsuario: string,
  mensajesPrevios: MensajeChat[],
): Promise<GeminiResult> {
  const perfil = await db.perfil_usuario.get(1);
  const apiKey = perfil?.apiKeyGemini;

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "[!] API KEY NO CONFIGURADA. Ve a AJUSTES > CONFIGURACIÓN IA y añade tu Gemini API Key.",
    );
  }

  const snapshot = await buildLocalSnapshot();

  const coachName = perfil?.nombreCoach?.trim() || "PERFORMANCE_OS";
  const systemPrompt = SYSTEM_PROMPT_PERFORMANCE_OS.replace(
    "PERFORMANCE_OS",
    coachName,
  );

  const systemInstruction = `${systemPrompt}

================================================================
LOCAL_SNAPSHOT — DATOS DEL ATLETA (Actualizado: ${new Date().toISOString().slice(0, 10)})
================================================================
${snapshot}

[//] UTILIZA ESTOS DATOS COMO REFERENCIA EXCLUSIVA. NO INVENTES INFORMACIÓN ADICIONAL.`;

  // Convertir mensajes previos
  const contents: GeminiContent[] = mensajesToGeminiContents(mensajesPrevios);

  // Añadir el nuevo mensaje del usuario
  contents.push({
    role: "user",
    parts: [{ text: mensajeUsuario }],
  });

  const data = await callGeminiAPI(apiKey, systemInstruction, contents, true);

  return parseGeminiResponse(data);
}

/**
 * Re-envía la conversación completa a Gemini después de que se haya ejecutado
 * (o cancelado) una función, para que el modelo dé una respuesta final.
 */
export async function enviarRespuestaFuncionAGemini(
  mensajesCompletos: MensajeChat[],
): Promise<GeminiResult> {
  const perfil = await db.perfil_usuario.get(1);
  const apiKey = perfil?.apiKeyGemini;

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "[!] API KEY NO CONFIGURADA. Ve a AJUSTES > CONFIGURACIÓN IA y añade tu Gemini API Key.",
    );
  }

  const snapshot = await buildLocalSnapshot();

  const coachName = perfil?.nombreCoach?.trim() || "PERFORMANCE_OS";
  const systemPrompt = SYSTEM_PROMPT_PERFORMANCE_OS.replace(
    "PERFORMANCE_OS",
    coachName,
  );

  const systemInstruction = `${systemPrompt}

================================================================
LOCAL_SNAPSHOT — DATOS DEL ATLETA (Actualizado: ${new Date().toISOString().slice(0, 10)})
================================================================
${snapshot}

[//] UTILIZA ESTOS DATOS COMO REFERENCIA EXCLUSIVA. NO INVENTES INFORMACIÓN ADICIONAL.`;

  const contents = mensajesToGeminiContents(mensajesCompletos);

  const data = await callGeminiAPI(apiKey, systemInstruction, contents, true);

  return parseGeminiResponse(data);
}

// ── Gestión de sesiones ──────────────────────────────────────────────

/**
 * Crea una nueva sesión de chat con un título placeholder.
 * El título se actualizará automáticamente con el primer mensaje del usuario.
 */
export async function crearSesionChat(): Promise<number> {
  const ahora = new Date().toISOString();

  const sesion: SesionChat = {
    titulo: "Nueva sesión",
    fechaCreacion: ahora,
    fechaActualizacion: ahora,
    mensajes: [],
  };

  return db.sesiones_chat.add(sesion);
}

/**
 * Añade un mensaje a una sesión y actualiza la fecha de actualización.
 */
export async function agregarMensajeASesion(
  sesionId: number,
  mensaje: MensajeChat,
): Promise<void> {
  const sesion = await db.sesiones_chat.get(sesionId);
  if (!sesion) {
    throw new Error(`[!] SESIÓN ${sesionId} NO ENCONTRADA`);
  }

  sesion.mensajes.push(mensaje);
  sesion.fechaActualizacion = new Date().toISOString();

  await db.sesiones_chat.put(sesion);
}

/**
 * Actualiza el título de una sesión de chat.
 */
export async function actualizarTituloSesion(
  sesionId: number,
  titulo: string,
): Promise<void> {
  await db.sesiones_chat.update(sesionId, { titulo });
}

/**
 * Elimina una sesión de chat y todos sus mensajes.
 */
export async function eliminarSesionChat(sesionId: number): Promise<void> {
  await db.sesiones_chat.delete(sesionId);
}
