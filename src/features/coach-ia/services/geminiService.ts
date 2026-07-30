import { db, type MensajeChat, type SesionChat, type LogEntrenamiento, type PesoDiario, type Ejercicio } from "../../../core/db";
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

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS: EMA-7 y velocidad semanal (peso corporal)
// ═══════════════════════════════════════════════════════════════════════

interface PuntoDiario {
  date: Date;
  valor: number;
}

/** Agrupa pesajes por fecha y calcula el promedio diario. */
function agruparPromedioDiario(pesos: PesoDiario[]): PuntoDiario[] {
  const mapa = new Map<string, number[]>();
  for (const p of pesos) {
    const existente = mapa.get(p.fecha) ?? [];
    existente.push(p.valor);
    mapa.set(p.fecha, existente);
  }
  const resultado: PuntoDiario[] = [];
  for (const [fecha, valores] of mapa) {
    const avg = valores.reduce((a, b) => a + b, 0) / valores.length;
    resultado.push({ date: new Date(`${fecha}T00:00:00`), valor: avg });
  }
  resultado.sort((a, b) => a.date.getTime() - b.date.getTime());
  return resultado;
}

/** EMA: α = 2/(N+1). Primer valor = seed con el primer dato. */
function calcularEMA(diarios: PuntoDiario[], ventana: number): (number | null)[] {
  const alpha = 2 / (ventana + 1);
  const ema: (number | null)[] = [];
  for (let i = 0; i < diarios.length; i++) {
    if (i === 0) {
      ema.push(diarios[i].valor);
    } else {
      ema.push(alpha * diarios[i].valor + (1 - alpha) * ema[i - 1]!);
    }
  }
  return ema;
}

/** Regresión lineal simple (OLS). */
function linearRegression(
  points: { x: number; y: number }[],
): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

type MetodoTasa = "regresion_lineal" | "simple_ema" | "simple_raw";

interface ResultadoVelocidad {
  valor: number;
  metodo: MetodoTasa;
}

/**
 * Calcula la velocidad semanal (kg/sem) con fallbacks progresivos:
 * 1. Regresión lineal sobre últimos 14 puntos EMA (más preciso)
 * 2. Tasa simple sobre puntos EMA disponibles (span >= 3 días)
 * 3. Tasa simple sobre promedios diarios crudos (span >= 3 días)
 */
function calcularVelocidadSemanal(
  diarios: PuntoDiario[],
  ema: (number | null)[],
): ResultadoVelocidad | null {
  // ── Nivel 1: Regresión lineal sobre últimos 14 puntos EMA ─────
  const ultimos: { diasDesdePrimero: number; y: number }[] = [];
  for (let i = diarios.length - 1; i >= 0 && ultimos.length < 14; i--) {
    if (ema[i] !== null) {
      const diasDesdePrimero =
        (diarios[i].date.getTime() - diarios[0].date.getTime()) / (24 * 60 * 60 * 1000);
      ultimos.unshift({ diasDesdePrimero, y: ema[i]! });
    }
  }
  if (ultimos.length >= 2) {
    const reg = linearRegression(ultimos);
    if (reg) return { valor: reg.slope * 7, metodo: "regresion_lineal" };
  }

  // ── Nivel 2: Tasa simple sobre EMA (primer vs último punto) ──
  if (ultimos.length >= 2) {
    const first = ultimos[0];
    const last = ultimos[ultimos.length - 1];
    const daysDiff = last.diasDesdePrimero - first.diasDesdePrimero;
    if (daysDiff >= 3) {
      return {
        valor: ((last.y - first.y) / daysDiff) * 7,
        metodo: "simple_ema",
      };
    }
  }

  // ── Nivel 3: Tasa simple sobre promedios diarios crudos ───────
  if (diarios.length >= 2) {
    const last = diarios[diarios.length - 1];

    // 3a: Buscar un punto ~7 días atrás para una ventana más relevante
    const targetDate = new Date(last.date);
    targetDate.setDate(targetDate.getDate() - 7);
    let bestEarlier: PuntoDiario | null = null;
    let bestDiff = Infinity;
    for (let i = diarios.length - 2; i >= 0; i--) {
      const diff = Math.abs(diarios[i].date.getTime() - targetDate.getTime());
      if (diff < bestDiff) { bestDiff = diff; bestEarlier = diarios[i]; }
    }
    if (bestEarlier) {
      const daysDiff =
        (last.date.getTime() - bestEarlier.date.getTime()) / (24 * 60 * 60 * 1000);
      if (daysDiff >= 3) {
        return {
          valor: ((last.valor - bestEarlier.valor) / daysDiff) * 7,
          metodo: "simple_raw",
        };
      }
    }

    // 3b: Último recurso: primer vs último diario de todo el historial
    const first = diarios[0];
    const daysDiff =
      (last.date.getTime() - first.date.getTime()) / (24 * 60 * 60 * 1000);
    if (daysDiff >= 3) {
      return {
        valor: ((last.valor - first.valor) / daysDiff) * 7,
        metodo: "simple_raw",
      };
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS: e1RM y fuerza relativa
// ═══════════════════════════════════════════════════════════════════════

const MAIN_LIFT_KEYWORDS = ["banca", "sentadilla", "peso muerto", "press militar"];

/** Fórmula de Brzycki: e1RM = w × (36 / (37 - r)) */
function brzycki(w: number, r: number): number {
  if (r <= 0 || r >= 37) return 0;
  return w * (36 / (37 - r));
}

/** Mejor e1RM estimado para un ejercicio en un log. */
function calcularE1RMPorLog(log: LogEntrenamiento, ejercicioId: string): number {
  const ej = log.ejercicios.find((e) => e.ejercicioId === ejercicioId);
  if (!ej) return 0;
  let mejor = 0;
  for (const s of ej.series) {
    if (!s.completado) continue;
    const peso = s.peso ?? 0;
    const reps = s.reps ?? 0;
    if (peso <= 0 || reps <= 0) continue;
    const e = brzycki(peso, reps);
    if (e > mejor) mejor = e;
  }
  return mejor;
}

/** Encuentra el peso corporal más cercano a una fecha (±3 días). */
function buscarPesoEnFecha(fecha: Date, pesos: PesoDiario[]): number | null {
  if (pesos.length === 0) return null;
  const fechaStr = fecha.toISOString().split("T")[0];
  const mismoDia = pesos.filter((p) => p.fecha === fechaStr);
  if (mismoDia.length > 0) {
    mismoDia.sort((a, b) => b.hora.localeCompare(a.hora));
    return mismoDia[0].valor;
  }
  const fechaTime = fecha.getTime();
  let mejor: PesoDiario | null = null;
  let mejorDiff = Infinity;
  for (const p of pesos) {
    const diff = Math.abs(new Date(p.fecha).getTime() - fechaTime);
    if (diff < mejorDiff) { mejorDiff = diff; mejor = p; }
  }
  if (mejor && mejorDiff <= 3 * 24 * 60 * 60 * 1000) return mejor.valor;
  return null;
}

interface MetricaEjercicio {
  nombre: string;
  e1rmActual: number | null;
  e1rmDelta30dias: number | null;
  frActual: number | null;
  frDelta30dias: number | null;
  ultimoPesoKg: number | null;
}

/** Calcula métricas de fuerza para los main lifts del atleta. */
async function calcularMetricasFuerza(
  ejercicios: Ejercicio[],
  logs: LogEntrenamiento[],
  pesos: PesoDiario[],
): Promise<MetricaEjercicio[]> {
  const result: MetricaEjercicio[] = [];

  for (const kw of MAIN_LIFT_KEYWORDS) {
    const ej = ejercicios.find(
      (e) =>
        e.nombre.toLowerCase().includes(kw.toLowerCase()) &&
        !e.isArchived &&
        (e.tipo === "fuerza" || e.tipo === "calistenia"),
    );
    if (!ej) continue;

    // ── e1RM ──────────────────────────────────────────────
    const puntos: { fecha: Date; e1rm: number }[] = [];
    for (const log of logs) {
      const e1rm = calcularE1RMPorLog(log, ej.id);
      if (e1rm > 0) puntos.push({ fecha: new Date(log.fecha), e1rm });
    }
    puntos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    const e1rmActual = puntos.length > 0 ? puntos[puntos.length - 1].e1rm : null;

    let e1rmDelta30dias: number | null = null;
    if (e1rmActual !== null) {
      const hace30 = new Date();
      hace30.setDate(hace30.getDate() - 30);
      const ventana = puntos.filter((p) => {
        const diff = p.fecha.getTime() - hace30.getTime();
        return diff >= -7 * 24 * 60 * 60 * 1000 && diff <= 7 * 24 * 60 * 60 * 1000;
      });
      if (ventana.length > 0) {
        e1rmDelta30dias = e1rmActual - Math.max(...ventana.map((p) => p.e1rm));
      } else if (puntos.length >= 2) {
        e1rmDelta30dias = e1rmActual - puntos[0].e1rm;
      }
    }

    // ── Fuerza relativa ───────────────────────────────────
    let frActual: number | null = null;
    let frDelta30dias: number | null = null;
    let ultimoPesoKg: number | null = null;

    if (e1rmActual !== null && pesos.length > 0) {
      // Peso más reciente
      ultimoPesoKg = pesos[pesos.length - 1].valor;

      // Cruzar cada punto e1RM con peso
      const frPuntos: { fecha: Date; ratio: number }[] = [];
      for (const p of puntos) {
        const peso = buscarPesoEnFecha(p.fecha, pesos);
        if (peso !== null && peso > 0) {
          frPuntos.push({ fecha: p.fecha, ratio: p.e1rm / peso });
        }
      }
      frPuntos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

      if (frPuntos.length > 0) {
        frActual = frPuntos[frPuntos.length - 1].ratio;

        const hace30 = new Date();
        hace30.setDate(hace30.getDate() - 30);
        const ventanaFR = frPuntos.filter((p) => {
          const diff = p.fecha.getTime() - hace30.getTime();
          return diff >= -7 * 24 * 60 * 60 * 1000 && diff <= 7 * 24 * 60 * 60 * 1000;
        });
        if (ventanaFR.length > 0) {
          frDelta30dias = frActual - Math.max(...ventanaFR.map((p) => p.ratio));
        } else if (frPuntos.length >= 2) {
          frDelta30dias = frActual - frPuntos[0].ratio;
        }
      }
    }

    result.push({
      nombre: ej.nombre,
      e1rmActual: e1rmActual ? +e1rmActual.toFixed(1) : null,
      e1rmDelta30dias: e1rmDelta30dias !== null ? +e1rmDelta30dias.toFixed(1) : null,
      frActual: frActual !== null ? +frActual.toFixed(2) : null,
      frDelta30dias: frDelta30dias !== null ? +frDelta30dias.toFixed(2) : null,
      ultimoPesoKg: ultimoPesoKg !== null ? +ultimoPesoKg.toFixed(1) : null,
    });
  }

  return result;
}

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

  // ── Métricas EMA-7 de tendencia de peso ───────────────────────────
  const diarios = agruparPromedioDiario(pesosOrdenados);
  const ema7 = calcularEMA(diarios, 7);
  const ultimoEMA = ema7.length > 0 ? ema7[ema7.length - 1] : null;
  const velocidadSemanal = calcularVelocidadSemanal(diarios, ema7);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const tendenciaPeso =
    velocidadSemanal == null
      ? "SIN_DATOS"
      : velocidadSemanal.valor > 0.3
        ? "SUBIDA_SIGNIFICATIVA"
        : velocidadSemanal.valor > 0.1
          ? "LIGERA_SUBIDA"
          : velocidadSemanal.valor < -0.3
            ? "BAJADA_SIGNIFICATIVA"
            : velocidadSemanal.valor < -0.1
              ? "LIGERA_BAJADA"
              : "ESTABLE";

  // ── Métricas de fuerza (main lifts) ───────────────────────────────
  const ejercicios = await db.ejercicios.toArray();
  const logsTodos = await db.logsEntrenamientos.toArray();
  const metricasFuerza = await calcularMetricasFuerza(ejercicios, logsTodos, pesosOrdenados);

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

  // Día de la semana actual en español para que la IA sepa qué día es "hoy"
  const DIAS_ES = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const fechaHoy = hoy.toISOString().slice(0, 10);
  const diaSemanaHoy = DIAS_ES[hoy.getDay()];

  const snapshot = {
    FECHA_ACTUAL: `${fechaHoy} (${diaSemanaHoy})`,
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
      ema7_actual_kg:
        ultimoEMA != null
          ? +ultimoEMA.toFixed(1)
          : null,
      tasaSemanal_kg: velocidadSemanal !== null ? +velocidadSemanal.valor.toFixed(2) : null,
      metodo_tasa: velocidadSemanal?.metodo ?? null,
      tendencia: tendenciaPeso,
      registros: pesosOrdenados.map((p) => ({
        fecha: p.fecha,
        hora: p.hora,
        valor: p.valor,
      })),
    },
    METRICAS_FUERZA: metricasFuerza.length > 0
      ? metricasFuerza.map((m) => ({
          ejercicio: m.nombre,
          e1rm_kg: m.e1rmActual,
          e1rm_delta30dias_kg: m.e1rmDelta30dias,
          fuerza_relativa_xBW: m.frActual,
          fr_delta30dias_xBW: m.frDelta30dias,
          peso_corporal_kg: m.ultimoPesoKg,
        }))
      : "SIN_DATOS",
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
            repsMin: s.repsMin,
            repsMax: s.repsMax,
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
