import { db, type MensajeChat, type SesionChat } from "../../../core/db";
import { SYSTEM_PROMPT_PERFORMANCE_OS } from "../../../core/ia-prompts";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent";

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiRequest {
  system_instruction: {
    parts: GeminiPart[];
  };
  contents: GeminiContent[];
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: GeminiPart[];
    };
  }[];
  error?: {
    message: string;
  };
}

/**
 * Construye el LOCAL_SNAPSHOT con datos del atleta (perfil, último peso,
 * historial de entrenamiento de los últimos 28 días) en formato texto.
 */
async function buildLocalSnapshot(): Promise<string> {
  const perfil = await db.perfil_usuario.get(1);

  const ultimoPeso = await db.pesos.orderBy("fecha").reverse().first();

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
    const hoy = new Date();
    edad = hoy.getFullYear() - nacimiento.getFullYear();
    const mes = hoy.getMonth() - nacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
      edad--;
    }
  }

  // Obtener nombres de ejercicios y rutinas para enriquecer el snapshot
  const ejercicios = await db.ejercicios.toArray();
  const ejercicioMap = new Map(ejercicios.map((e) => [e.id, e]));
  const rutinas = await db.rutinas.toArray();
  const rutinaMap = new Map(rutinas.map((r) => [r.id, r]));

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
    PESO_ACTUAL:
      ultimoPeso != null
        ? `${ultimoPeso.valor} kg (${ultimoPeso.fecha})`
        : "NO_REGISTRADO",
    PLANIFICACION_SEMANAL:
      planificacion != null
        ? planSemanal
        : "NO_CONFIGURADA",
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

/**
 * Envía un mensaje a Gemini y devuelve la respuesta del modelo.
 * Lanza un error descriptivo si no hay API Key configurada o si la API falla.
 */
export async function enviarMensajeAGemini(
  mensajeUsuario: string,
  mensajesPrevios: MensajeChat[],
): Promise<string> {
  const perfil = await db.perfil_usuario.get(1);
  const apiKey = perfil?.apiKeyGemini;

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "[!] API KEY NO CONFIGURADA. Ve a AJUSTES > CONFIGURACIÓN IA y añade tu Gemini API Key.",
    );
  }

  // Construir el LOCAL_SNAPSHOT para inyectar en el system prompt
  const snapshot = await buildLocalSnapshot();

  const systemInstruction = `${SYSTEM_PROMPT_PERFORMANCE_OS}

================================================================
LOCAL_SNAPSHOT — DATOS DEL ATLETA (Actualizado: ${new Date().toISOString().slice(0, 10)})
================================================================
${snapshot}

[//] UTILIZA ESTOS DATOS COMO REFERENCIA EXCLUSIVA. NO INVENTES INFORMACIÓN ADICIONAL.`;

  // Mapear mensajes previos al formato Gemini
  const contents: GeminiContent[] = mensajesPrevios.map((m) => ({
    role: m.role,
    parts: [{ text: m.texto }],
  }));

  // Añadir el nuevo mensaje del usuario
  contents.push({
    role: "user",
    parts: [{ text: mensajeUsuario }],
  });

  const requestBody: GeminiRequest = {
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    contents,
  };

  const response = await fetch(
    `${GEMINI_API_BASE}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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

  const textoRespuesta = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textoRespuesta || textoRespuesta.trim().length === 0) {
    throw new Error(
      "[!] EL MODELO NO GENERÓ RESPUESTA. Revisa los datos e inténtalo de nuevo.",
    );
  }

  return textoRespuesta.trim();
}

/**
 * Crea una nueva sesión de chat con un título por defecto basado en la fecha.
 */
export async function crearSesionChat(): Promise<number> {
  const ahora = new Date().toISOString();
  const fechaLegible = new Date().toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const hora = new Date().toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const sesion: SesionChat = {
    titulo: `SESIÓN // ${fechaLegible} ${hora}`,
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
 * Elimina una sesión de chat y todos sus mensajes.
 */
export async function eliminarSesionChat(sesionId: number): Promise<void> {
  await db.sesiones_chat.delete(sesionId);
}
