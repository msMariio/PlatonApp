import type { MensajeChat } from "../../../core/db";

// ── Tipos del protocolo de Gemini ────────────────────────────────────

export interface GeminiTextPart {
  text: string;
}

export interface GeminiFunctionCallPart {
  functionCall: {
    name: string;
    args: Record<string, unknown>;
  };
  /** Gemini API usa snake_case en peticiones. */
  thought_signature?: string;
  /** Gemini puede devolver camelCase en respuestas (estándar JSON de Google). */
  thoughtSignature?: string;
}

export interface GeminiFunctionResponsePart {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
  };
}

export type GeminiPart =
  | GeminiTextPart
  | GeminiFunctionCallPart
  | GeminiFunctionResponsePart;

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export function partIsText(p: GeminiPart): p is GeminiTextPart {
  return "text" in p;
}

export function partIsFunctionCall(
  p: GeminiPart,
): p is GeminiFunctionCallPart {
  return "functionCall" in p;
}

function partIsFunctionResponse(
  p: GeminiPart,
): p is GeminiFunctionResponsePart {
  return "functionResponse" in p;
}

// ── Normalización ────────────────────────────────────────────────────

/**
 * Gemini exige que la conversación no tenga dos contenidos seguidos del mismo
 * rol. La app guarda cada `functionResponse` como un mensaje propio, así que
 * aquí se fusionan los contenidos consecutivos del mismo rol.
 */
function fusionarContenidosConsecutivos(
  contents: GeminiContent[],
): GeminiContent[] {
  const fusionados: GeminiContent[] = [];

  for (const contenido of contents) {
    const ultimo = fusionados[fusionados.length - 1];
    if (ultimo && ultimo.role === contenido.role) {
      ultimo.parts.push(...contenido.parts);
    } else {
      fusionados.push({ role: contenido.role, parts: [...contenido.parts] });
    }
  }

  return fusionados;
}

/**
 * Repara secuencias inválidas antes de enviarlas a la API:
 * - `functionCall` sin su `functionResponse` (p. ej. propuestas canceladas con
 *   versiones antiguas de la app, o ejecuciones interrumpidas) se descartan.
 * - `functionResponse` huérfanos (sin `functionCall` que los espere) se descartan.
 *
 * Sin esta reparación, una sola propuesta cancelada dejaba la sesión entera
 * devolviendo 400 en cada mensaje posterior.
 */
function repararFuncionesSinRespuesta(
  contents: GeminiContent[],
): GeminiContent[] {
  const reparados: GeminiContent[] = contents.map((contenido) => ({
    role: contenido.role,
    parts: [...contenido.parts],
  }));

  for (let i = 0; i < reparados.length; i++) {
    const contenido = reparados[i];
    if (contenido.role !== "model") continue;

    const llamadas = contenido.parts.filter(partIsFunctionCall);
    if (llamadas.length === 0) continue;

    const siguiente = reparados[i + 1];
    const respuestas =
      siguiente?.role === "user"
        ? siguiente.parts.filter(partIsFunctionResponse)
        : [];

    // Respuestas disponibles por nombre de función.
    const disponibles = new Map<string, number>();
    for (const respuesta of respuestas) {
      const nombre = respuesta.functionResponse.name;
      disponibles.set(nombre, (disponibles.get(nombre) ?? 0) + 1);
    }

    // Solo se conservan las llamadas que tienen respuesta (por nombre y orden).
    const conservadas: string[] = [];
    contenido.parts = contenido.parts.filter((part) => {
      if (!partIsFunctionCall(part)) return true;
      const nombre = part.functionCall.name;
      const restantes = disponibles.get(nombre) ?? 0;
      if (restantes <= 0) return false;
      disponibles.set(nombre, restantes - 1);
      conservadas.push(nombre);
      return true;
    });

    if (siguiente?.role === "user" && respuestas.length > 0) {
      const esperadas = new Map<string, number>();
      for (const nombre of conservadas) {
        esperadas.set(nombre, (esperadas.get(nombre) ?? 0) + 1);
      }
      siguiente.parts = siguiente.parts.filter((part) => {
        if (!partIsFunctionResponse(part)) return true;
        const nombre = part.functionResponse.name;
        const restantes = esperadas.get(nombre) ?? 0;
        if (restantes <= 0) return false;
        esperadas.set(nombre, restantes - 1);
        return true;
      });
    }
  }

  return reparados;
}

/**
 * Descarta `functionResponse` que no corresponden a ninguna `functionCall` del
 * contenido anterior: Gemini los rechaza y rompen la conversación entera.
 */
function limpiarRespuestasHuerfanas(
  contents: GeminiContent[],
): GeminiContent[] {
  const resultado: GeminiContent[] = contents.map((contenido) => ({
    role: contenido.role,
    parts: [...contenido.parts],
  }));

  for (let i = 0; i < resultado.length; i++) {
    const contenido = resultado[i];
    if (contenido.role !== "user") continue;

    const respuestas = contenido.parts.filter(partIsFunctionResponse);
    if (respuestas.length === 0) continue;

    const esperadas = new Map<string, number>();
    const anterior = resultado[i - 1];
    if (anterior?.role === "model") {
      for (const part of anterior.parts) {
        if (!partIsFunctionCall(part)) continue;
        const nombre = part.functionCall.name;
        esperadas.set(nombre, (esperadas.get(nombre) ?? 0) + 1);
      }
    }

    contenido.parts = contenido.parts.filter((part) => {
      if (!partIsFunctionResponse(part)) return true;
      const nombre = part.functionResponse.name;
      const restantes = esperadas.get(nombre) ?? 0;
      if (restantes <= 0) return false;
      esperadas.set(nombre, restantes - 1);
      return true;
    });
  }

  return resultado;
}

/** Número máximo de mensajes de historial que se reenvían al modelo. */
export const HISTORIAL_MAX_MENSAJES = 40;

/**
 * Recorta el historial a los últimos turnos, empezando siempre por un mensaje
 * de usuario de texto (nunca por una respuesta de herramienta suelta).
 * Sin recorte, cada mensaje reenviaba la conversación entera y el coste crecía
 * sin límite hasta agotar el contexto.
 */
export function recortarHistorial(mensajes: MensajeChat[]): MensajeChat[] {
  if (mensajes.length <= HISTORIAL_MAX_MENSAJES) return mensajes;

  const inicioMinimo = mensajes.length - HISTORIAL_MAX_MENSAJES;
  for (let i = inicioMinimo; i < mensajes.length; i++) {
    if (mensajes[i].role === "user" && !mensajes[i].functionResponse) {
      return mensajes.slice(i);
    }
  }

  // Sin un corte limpio (tramo con muchas herramientas seguidas), es preferible
  // enviar el historial completo antes que romper un par functionCall/response.
  return mensajes;
}

/** Elimina textos vacíos y contenidos sin partes. */
function limpiarContenidosVacios(contents: GeminiContent[]): GeminiContent[] {
  for (const contenido of contents) {
    contenido.parts = contenido.parts.filter(
      (part) => !partIsText(part) || part.text.trim().length > 0,
    );
  }
  return contents.filter((contenido) => contenido.parts.length > 0);
}

// ── Conversión de mensajes al formato Gemini ─────────────────────────

/**
 * Convierte MensajeChat[] al formato contents[] de Gemini,
 * incluyendo functionCall y functionResponse cuando corresponda.
 *
 * REGLA CLAVE: Si el modelo generó varias functionCalls en una misma
 * respuesta, Gemini las devuelve en un ÚNICO content con múltiples parts
 * (cada una con su thought_signature). Almacenamos cada functionCall como
 * un MensajeChat separado (para simplificar la UI), pero al reenviarlas
 * a Gemini DEBEN ir agrupadas en un solo content. Esta función hace el
 * merge de mensajes model consecutivos con functionCall respetando el
 * orden de parts original (texto primero, luego functionCalls).
 */
export function mensajesToGeminiContents(
  mensajes: MensajeChat[],
): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (let i = 0; i < mensajes.length; i++) {
    const m = mensajes[i];

    // ── Agrupar functionCalls consecutivos del modelo ────────────
    if (m.role === "model" && m.functionCall) {
      const mergedParts: GeminiPart[] = [];

      // El texto viene del primer functionCall del turno (todos comparten el mismo texto)
      if (m.texto && m.texto.trim().length > 0) {
        mergedParts.push({ text: m.texto });
      }

      // Recorrer todos los functionCalls consecutivos del modelo
      while (
        i < mensajes.length &&
        mensajes[i].role === "model" &&
        mensajes[i].functionCall
      ) {
        const fcMsg = mensajes[i];
        const fcPart: GeminiPart = {
          functionCall: {
            name: fcMsg.functionCall!.name,
            args: fcMsg.functionCall!.args,
          },
        };
        // Incluir thought_signature si está presente (requerido por Gemini)
        if (fcMsg.functionCall!.thoughtSignature) {
          (fcPart as GeminiFunctionCallPart).thought_signature =
            fcMsg.functionCall!.thoughtSignature;
        }
        mergedParts.push(fcPart);
        i++;
      }
      i--; // Retroceder uno porque el for hará i++

      contents.push({ role: "model", parts: mergedParts });
    } else if (m.functionResponse) {
      contents.push({
        role: m.role,
        parts: [{ functionResponse: m.functionResponse }],
      });
    } else if (m.texto && m.texto.trim().length > 0) {
      contents.push({
        role: m.role,
        parts: [{ text: m.texto }],
      });
    }
    // Si el mensaje no tiene contenido relevante, se omite
  }

  const fusionados = fusionarContenidosConsecutivos(contents);
  const reparados = repararFuncionesSinRespuesta(fusionados);
  const sinHuerfanas = limpiarRespuestasHuerfanas(reparados);
  const fusionadosFinales = fusionarContenidosConsecutivos(sinHuerfanas);

  return limpiarContenidosVacios(fusionadosFinales);
}
