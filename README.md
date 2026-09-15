# Platón — Gym Tracker System

Aplicación personal local-first para registrar entrenamientos, crear rutinas, planificar la semana, analizar progresos, seguir el peso corporal y conversar con un coach de IA capaz de proponer acciones sobre la aplicación.

> **Para futuros agentes:** lee este README antes de modificar el proyecto. Si una tarea cambia comportamiento, arquitectura, datos, prompts o herramientas de IA, actualiza la documentación afectada y añade una entrada en el registro de cambios.

## Propósito

Platón centraliza el ciclo completo del entrenamiento:

1. Planificar qué se entrena cada día.
2. Crear rutinas reutilizables con ejercicios, series, rangos de repeticiones, carga objetivo, RPE y objetivos de cardio.
3. Registrar lo que realmente se ha hecho, incluyendo peso, repeticiones, RPE, duración, distancia e inclinación.
4. Comparar el resultado con la plantilla y detectar sobrecarga progresiva.
5. Analizar la evolución mediante gráficas.
6. Hablar con una IA que conoce los datos locales y puede crear o modificar elementos después de una confirmación explícita.

La aplicación está pensada para uso personal, móvil y como PWA instalable. No tiene backend propio, autenticación ni sincronización automática entre dispositivos. El coach no es local: cuando se usa, el navegador envía el snapshot a Google Gemini.

## Funcionalidades

### Inicio y planificación

- Muestra el día actual y la rutina asignada.
- Permite configurar la planificación de lunes a domingo y los días de descanso.
- Inicia la rutina del día o un entrenamiento libre, vacío o basado en una rutina guardada.
- Lista entrenamientos recientes, notas, volumen, minutos y distancia.
- Permite editar o eliminar entrenamientos existentes.

### Rutinas y ejercicios

- Crea carpetas planas y rutinas.
- Reordena carpetas y rutinas con drag-and-drop, táctil o teclado.
- Mueve rutinas entre raíz y carpetas y colapsa carpetas.
- Edita nombre, descripción, ejercicios, series y orden.
- Crea, busca, edita, archiva y desarchiva ejercicios maestros.
- Tipos: `fuerza`, `cardio`, `tiempo`, `calistenia`.
- Grupos: `pecho`, `espalda`, `pierna`, `hombro`, `brazos`, `core`, `cardio`, `fullbody`.
- Abre analíticas de cada ejercicio.

Si una rutina o ejercicio está referenciado por el historial, se archiva en vez de borrarse físicamente.

### Registro de entrenamientos

- Registra sesiones de rutina o libres.
- Fuerza/calistenia: peso, repeticiones, RPE y completado.
- Cardio: minutos, distancia e inclinación.
- Tiempo: minutos y lastre.
- Añade o elimina ejercicios y series.
- Usa como placeholder el último log de la rutina o el objetivo de la plantilla.
- Al completar una serie, rellena campos vacíos desde el placeholder.
- Detecta aumentos de peso, repeticiones, duración, distancia y series extra.
- Pregunta si se deben actualizar los objetivos de la plantilla.
- Protege la salida accidental con cambios sin guardar.

### Métricas

- **Fuerza:** e1RM, delta de 30 días y fuerza relativa.
- **Peso:** registros, edición, borrado, gráfica bruta y tendencia EMA-7.
- Timeframes: `7D`, `30D`, `1A`, `TODO`.
- Levantamientos principales detectados por nombre: `banca`, `sentadilla`, `peso muerto`, `press militar`.

`features/metrics/useE1RM.ts` usa Brzycki:

```text
e1RM = peso × (36 / (37 - repeticiones))
```

`features/analytics/data.ts` usa Epley para `oneRm`:

```text
1RM = peso × (1 + repeticiones / 30)
```

Son cálculos distintos y no deben unificarse sin una decisión explícita.

### Ajustes

- Tema oscuro/claro.
- Nombre, altura, fecha de nacimiento, sexo biológico y objetivo.
- Nombre personalizado del coach.
- Gemini API key.
- Exportación e importación completa.

## Principios de diseño

- **Local-first:** IndexedDB es la fuente de verdad. Las vistas leen con `useLiveQuery`; las escrituras se realizan fuera de los observers.
- **Mobile-first/PWA:** navegación inferior, controles táctiles, áreas seguras de iOS y modo standalone.
- **Brutal-terminal:** tipografía monoespaciada, bordes cuadrados, sin sombras y verde lima sobre negro en dark mode.
- **Control humano:** Gemini propone herramientas, pero no escribe hasta que el usuario pulsa `CONFIRMAR`.

## Stack

- TypeScript 6, React 19 y React DOM.
- Vite 8, `@vitejs/plugin-react`, React Compiler y `vite-plugin-pwa`.
- Material UI 9, Emotion y Material Icons.
- `@base-ui/react/number-field` para `InputNumber`.
- Dexie 4 e `dexie-react-hooks` sobre IndexedDB.
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- MUI X Charts.
- `react-markdown`.
- API REST de Google Gemini desde el navegador.

Endpoint configurado:

```text
https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent
```

## Puesta en marcha

El repositorio usa npm porque contiene `package-lock.json`.

```bash
npm ci
npm run dev
```

Scripts:

```bash
npm run dev       # Vite con HMR
npm run build     # tsc -b y build de producción
npm run lint      # ESLint
npm run preview   # sirve el build localmente
```

No hay suite de tests automatizados ni script `test`. Después de cambios no triviales se debe ejecutar como mínimo `npm run build` y, cuando sea posible, `npm run lint`.

### Configurar Gemini

1. Ir a `AJUSTES`.
2. Abrir `CONFIGURACIÓN IA // COACH SYSTEM`.
3. Introducir una API key de Google AI Studio.
4. Personalizar el nombre opcionalmente.
5. Guardar y abrir `COACH`.

La clave se almacena en `perfil_usuario.apiKeyGemini`, dentro de IndexedDB. No está en `.env`, no se debe commitear ni incluir en logs o documentación. El navegador la envía a Google como query parameter.

## Arquitectura

```text
main.tsx
└── StrictMode
    └── ErrorBoundary
        └── App
            ├── ColorModeProvider
            ├── AppThemeProvider
            ├── CssBaseline
            └── pantalla activa
```

`App.tsx` navega mediante estado local:

```text
tab 0 → HomeView
 tab 1 → RutinasView
 tab 2 → MetricsHub
 tab 3 → CoachView
 tab 4 → SettingsView
```

El logger es una pantalla especial con `{ type: "logger", rutinaId: string, logId?: number }`: sin `logId` crea y con `logId` edita.

No hay router externo. `RutinasView` navega localmente entre lista, detalle, catálogo y analítica.

### Flujo de datos

```text
Componente
    ↓ useLiveQuery / handler
Función de datos del feature o db
    ↓
Dexie → IndexedDB
```

`main.tsx` incluye un `ErrorBoundary` que muestra el stack para evitar una pantalla blanca. `useStableNodeRef` protege los nodos de dnd-kit frente a callbacks `null` de React 19 + StrictMode.

## Estructura del código

```text
.
├── index.html                  # HTML y metadatos PWA/iOS
├── package.json                # dependencias y scripts
├── vite.config.ts              # React Compiler y PWA
├── tsconfig*.json              # TypeScript
├── eslint.config.js            # ESLint
├── public/                     # iconos
└── src/
    ├── main.tsx                # montaje y ErrorBoundary
    ├── App.tsx                 # layout y navegación
    ├── components/             # UI reutilizable
    ├── core/                   # persistencia, tema, backup y prompt
    ├── hooks/                  # hooks técnicos
    └── features/
        ├── home/               # inicio y planificación
        ├── rutinas/            # carpetas, rutinas y catálogo
        ├── training-logger/    # registro
        ├── analytics/          # analítica de ejercicio
        ├── metrics/            # fuerza, fuerza relativa y peso
        ├── peso-tracker/       # operaciones de peso
        ├── coach-ia/           # Gemini, tools y chat
        ├── perfil/             # perfil y configuración IA
        └── settings/           # tema y backup/restore
```

Archivos clave:

- `src/core/db.ts`: tipos, base `GymTrackerDB`, schema y migraciones.
- `src/core/backup.ts`: export/import atómico.
- `src/core/ia-prompts.ts`: prompt completo del coach.
- `src/core/theme.tsx`: tema.
- `src/features/training-logger/data.ts`: logs, placeholders y volumen.
- `src/features/training-logger/utils/compareWorkoutWithTemplate.ts`: progresión.
- `src/features/coach-ia/CoachView.tsx`: chat y confirmaciones.
- `src/features/coach-ia/services/geminiService.ts`: snapshot, API y serialización.
- `src/features/coach-ia/services/toolDefinitions.ts`: tipos y schemas.
- `src/features/coach-ia/services/toolExecutor.ts`: escrituras reales.
- `src/features/coach-ia/components/ToolProposalCard.tsx`: UI de propuesta.

## Datos y persistencia

La base se llama `GymTrackerDB`.

### Entidades

```ts
interface Ejercicio {
  id: string;
  nombre: string;
  grupoMuscular: GrupoMuscular;
  descripcion?: string;
  tipo: TipoEjercicio;
  isArchived?: boolean;
}

interface Serie {
  repsMin?: number;
  repsMax?: number;
  pesoObjetivo?: number;
  rpeObjetivo?: number;
  notas?: string;
  duracionObjetivoMinutos?: number;
  distanciaObjetivoKm?: number;
}

interface EjercicioEnRutina {
  id: string;          // instancia local; no es el id del catálogo
  ejercicioId: string; // id del ejercicio maestro
  series: Serie[];
  notas?: string;
  order: number;
}

interface LogEntrenamiento {
  id?: number;
  fecha: string;
  rutinaId: string;
  rutinaSnapshot?: string;
  completado: boolean;
  notas?: string;
  ejercicios: EjercicioReal[];
}

interface SerieReal {
  peso?: number;
  reps?: number;
  completado: boolean;
  rpe?: number;
  duracionMinutos?: number;
  distanciaKm?: number;
  nivelInclinacion?: number;
}
```

`custom-libre` es el ID especial de una sesión libre. `rutinaSnapshot` mantiene el nombre histórico aunque se archive la plantilla.

### Tablas

- `ejercicios`: catálogo maestro.
- `carpetas`: carpetas planas, orden y colapsado.
- `rutinas`: plantillas y ejercicios.
- `logsEntrenamientos`: historial con índice compuesto `[rutinaId+fecha]`.
- `pesos`: `{ id?, fecha, hora, valor }`.
- `planificacionSemanal`: singleton `default`, rutina o descanso por día.
- `perfil_usuario`: singleton `id: 1`, biometría, objetivo, API key y nombre del coach.
- `sesiones_chat`: título, timestamps y mensajes.

### Mensajes de chat

```ts
interface MensajeChat {
  id: string;
  role: "user" | "model";
  texto: string;
  timestamp: string;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
    thoughtSignature?: string;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}
```

### Migraciones Dexie

`db.ts` contiene versiones acumulativas:

- v1: modelo legacy.
- v2: carpetas, orden y modelos ricos.
- v3: `logsEntrenamientos` y planificación semanal.
- v4: snapshot de rutina.
- v5: tipo de ejercicio y campos flexibles de `SerieReal`.
- v6: perfil de usuario.
- v7: sesiones de chat.
- v8: archivado de ejercicios.
- v9: archivado de rutinas.
- v10: `repsObjetivo` → `repsMin`/`repsMax`.

**Regla:** cualquier cambio persistido requiere nueva versión y migración; no se deben reescribir silenciosamente versiones publicadas. Actualizar también `backup.ts` y este README.

## Flujos principales

### Rutinas

```text
RUTINAS
  ├── lista raíz + carpetas
  ├── detalle de rutina
  │     ├── nombre/descripción
  │     ├── ejercicios y objetivos por serie
  │     └── analítica de ejercicio
  └── catálogo de ejercicios maestros
```

`@dnd-kit` usa `PointerSensor` y `KeyboardSensor`. El drag se activa desde `DragHandle` para mantener el scroll móvil. Las listas normalizan `order` al persistir.

### Logger

1. Resuelve rutina o crea una rutina virtual `ENTRENAMIENTO LIBRE`.
2. En edición, carga el log indicado.
3. En creación con plantilla, convierte objetivos a series reales.
4. Prioriza placeholders del último log; si no existen, usa la plantilla.
5. El usuario edita y completa series.
6. Calcula volumen.
7. Compara con plantilla.
8. Ofrece actualizar plantilla o registrar solo la sesión.
9. Guarda en `logsEntrenamientos`.

La actualización de plantilla conserva el máximo anterior/real y añade series extra como objetivos.

### Peso

Se agrupan pesajes del mismo día por promedio. La EMA-7 usa:

```text
alpha = 2 / (7 + 1)
EMA[0] = primer promedio diario
EMA[n] = alpha × valor[n] + (1 - alpha) × EMA[n-1]
```

La tasa semanal intenta regresión lineal sobre hasta 14 puntos EMA, luego diferencia simple EMA y, por último, diferencia sobre valores brutos. El snapshot IA conserva el método.

## Coach IA

El coach por defecto se llama `PERFORMANCE_OS`, aunque se puede personalizar.

### Contrato IA

Deben revisarse juntos cuando se cambie el agente:

1. `src/core/ia-prompts.ts`: instrucciones.
2. `src/features/coach-ia/services/geminiService.ts`: snapshot, API y serialización.
3. `src/features/coach-ia/services/toolDefinitions.ts`: tipos y schemas.
4. `src/features/coach-ia/services/toolExecutor.ts`: autoridad real de escritura.
5. `CoachView.tsx` y `ToolProposalCard.tsx`: confirmación y UI. `ToolProposalCard` consulta el estado local para previsualizar cambios antes/después en tools de edición.

### Prompt de sistema

`SYSTEM_PROMPT_PERFORMANCE_OS` en `src/core/ia-prompts.ts` define identidad de preparador físico, tono directo, adaptación al objetivo, uso obligatorio de `FECHA_ACTUAL`, análisis con datos reales, progresión doble, protocolo EMA-7, reglas de tools, diferencia entre registrar/editar, explicación antes de actuar y agrupación de llamadas independientes.

El prompt no sustituye la validación del executor.

### `LOCAL_SNAPSHOT`

`buildLocalSnapshot()` se recalcula en cada petición y contiene:

```text
FECHA_ACTUAL
PERFIL
HISTORIAL_PESO
METRICAS_FUERZA
CATALOGO_EJERCICIOS
CATALOGO_CARPETAS
CATALOGO_RUTINAS
PLANIFICACION_SEMANAL
ENTRENAMIENTOS_ULTIMOS_28_DIAS
```

- `FECHA_ACTUAL`: fecha ISO y día en español; única fuente para “hoy”.
- `PERFIL`: nombre, altura, edad, sexo y objetivo.
- `HISTORIAL_PESO`: todos los pesajes, último valor, total, EMA-7, tasa, método y tendencia.
- `METRICAS_FUERZA`: métricas de banca, sentadilla, peso muerto y press militar si existen.
- `CATALOGO_*`: IDs, nombres, tipos, carpetas, rutinas y objetivos por serie.
- `PLANIFICACION_SEMANAL`: día → nombre de rutina o `null`.
- `ENTRENAMIENTOS_ULTIMOS_28_DIAS`: logs reales de 28 días.

`SNAPSHOT_GENERADO` es una marca técnica, no una referencia de “hoy”.

### Construcción de la petición

`enviarMensajeAGemini()`:

1. Lee el perfil y valida `apiKeyGemini`.
2. Calcula fecha y snapshot.
3. Sustituye el primer `PERFORMANCE_OS` por el nombre personalizado.
4. Construye `system_instruction` con prompt y snapshot.
5. Convierte mensajes previos a `contents`.
6. Añade el mensaje actual.
7. Envía `TOOL_DECLARATIONS`.
8. Extrae texto y llamadas a función.

`enviarRespuestaFuncionAGemini()` repite el snapshot y reenvía la conversación tras confirmar o cancelar.

### Function calling

Gemini puede devolver varias llamadas en un único `content`. La UI guarda cada una como `MensajeChat`; `mensajesToGeminiContents()` vuelve a agrupar mensajes consecutivos del modelo en un `content` con varias `parts` y conserva `thoughtSignature`/`thought_signature`. No eliminar ese campo.

### Confirmación

```text
Usuario → CoachView guarda mensaje
       → geminiService crea prompt + snapshot + historial
       → Gemini devuelve texto/functionCall
       → ToolProposalCard muestra propuesta
       → CONFIRMAR: executeFunctionCall → functionResponse → Gemini
       → CANCELAR: mensaje de cancelación → Gemini ofrece alternativa
```

Las acciones independientes del mismo turno se agrupan en una tarjeta. Al confirmar, todas las calls se ejecutan dentro de una única transacción Dexie: si una falla, se revierten todas. Las acciones dependientes deben dividirse en turnos para obtener IDs generados.

### Sesiones

- Se guardan en `sesiones_chat`.
- El título se genera desde el primer mensaje.
- Se reutiliza la última sesión vacía o actualizada en las últimas 2 horas.
- El drawer permite cambiar o eliminar sesiones.
- Markdown se renderiza con componentes MUI.

## Herramientas de IA

Las declaraciones para Gemini están en `toolDefinitions.ts`; el comportamiento real, en `toolExecutor.ts`.

| Tool | Propósito | Contrato real |
|---|---|---|
| `crear_carpeta` | Crear carpeta | Orden al final; carpetas planas. |
| `crear_ejercicio` | Crear ejercicio | Evita duplicados por nombre sin distinguir mayúsculas. |
| `crear_rutina` | Crear plantilla | Fuerza/calistenia exige `repsMin`, `repsMax` y `pesoObjetivo`. |
| `actualizar_planificacion_semanal` | Asignar días | Acepta ID/nombre; normaliza acentos; `null` es descanso. |
| `editar_carpeta` | Renombrar carpeta | ID o nombre exacto. |
| `editar_ejercicio` | Editar catálogo | ID o nombre exacto. |
| `editar_rutina` | Editar plantilla | Renombra, describe, añade, quita o modifica ejercicios. |
| `registrar_peso` | Crear pesaje | Fecha/hora del argumento o fallback. |
| `editar_peso` | Corregir pesaje | Busca por fecha y opcionalmente hora. |
| `registrar_entrenamiento` | Crear log | Modo rutina o modo libre. |
| `editar_entrenamiento` | Editar log | Fecha obligatoria; evita ambigüedad y falla ante referencias inválidas. |
| `reordenar_rutina` | Reordenar ejercicios | Debe incluir todos exactamente una vez. |

### Resolución por ID/nombre

El snapshot aporta IDs y nombres, pero deben preferirse IDs exactos:

- carpeta: `carpetaId` o `carpetaNombre`;
- rutina: `rutinaId` o `rutinaNombre`;
- ejercicio: `ejercicioId` o `ejercicioNombre`.

`resolveEjercicio()` nunca crea ejercicios implícitamente. Si falta uno, la operación completa falla y no se escribe ningún cambio; usar `crear_ejercicio` primero y después la acción dependiente. Las referencias a ejercicios inexistentes o que no pertenecen a la rutina/log indicado tampoco se ignoran silenciosamente.

### Rutinas y merge

Para fuerza/calistenia, `crear_rutina` rechaza ejercicios sin `repsMin`, `repsMax` o `pesoObjetivo`. Para cardio/tiempo se usan minutos y/o distancia.

`ejerciciosModificar` hace merge sobre series existentes. El agente debe enviar solo campos modificados y conservar el número de series:

```json
{
  "ejercicioNombre": "Press banca",
  "series": 3,
  "rpeObjetivo": 8
}
```

No enviar peso o repeticiones si solo cambia el RPE.

### Editar entrenamientos

- `ejerciciosAgregar`: añade ejercicios con series reales.
- `ejerciciosQuitar`: quita ejercicios.
- `ejerciciosModificar`: cambia series mediante `serieIdx` desde cero.
- `notas`: reemplaza las notas si se incluye.

No usar `registrar_entrenamiento` para corregir un log existente.

### Fechas

El prompt exige convertir “hoy”, “ayer” o días de la semana mediante `FECHA_ACTUAL` y pasar la fecha efectiva en `fecha`. Todas las tools de peso y entrenamiento usan `fecha`; no existe `fechaDefault` en el contrato actual. Si falta `fecha`, el executor usa el reloj local como último recurso para registrar, mientras que las tools de edición exigen la fecha para localizar el registro.

La hora de `registrar_peso` también usa el valor recibido o la hora local si se omite.

## Backups y configuración

`src/core/backup.ts` exporta las ocho tablas:

```json
{
  "app": "Platón",
  "version": 1,
  "exportedAt": "...",
  "data": {
    "ejercicios": [],
    "carpetas": [],
    "rutinas": [],
    "logsEntrenamientos": [],
    "pesos": [],
    "planificacionSemanal": [],
    "perfil_usuario": [],
    "sesiones_chat": []
  }
}
```

La restauración valida, pide confirmación, vacía todas las tablas y escribe en una transacción Dexie. Es sustitución completa, no fusión.

El modo visual se guarda en `localStorage` con `platonapp.colorMode`; los datos de entrenamiento están en IndexedDB.

## Guía para hacer cambios

### Antes de editar

1. Leer este README.
2. Determinar si el cambio afecta a UI, dominio, persistencia, prompt, tools o varias capas.
3. Revisar tipos en `src/core/db.ts` y todos sus usos.
4. Comprobar datos existentes y necesidad de migración.
5. Para IA, leer siempre prompt, servicio Gemini, definitions, executor, `CoachView` y `ToolProposalCard`.

### Dónde implementar

| Necesidad | Lugar |
|---|---|
| Campo persistido nuevo | `core/db.ts` + migración + backup + README |
| Operación de rutinas | `features/rutinas/data.ts` + consumidor |
| Cálculo analítico | `features/analytics` o `features/metrics` |
| Campo de serie | `db.ts` + logger + plantilla + IA si aplica |
| Nueva tool IA | tipos, declaration, executor, prompt, UI y README |
| Tema global | `core/theme.tsx` |
| Navegación | `App.tsx` y `AppFooter.tsx` |
| Backup | `core/backup.ts` |

### Nueva tool IA

1. Crear interfaz de argumentos.
2. Añadir variante a `FunctionCallArgs`.
3. Añadir schema a `TOOL_DECLARATIONS`.
4. Implementar operación en `toolExecutor.ts`.
5. Añadir `case` a `executeFunctionCall`.
6. Devolver `{ success, message, data? }`.
7. Gestionar IDs, nombres, entidades inexistentes y ambigüedad.
8. Añadir reglas al prompt.
9. Revisar la representación de argumentos.
10. Probar confirmación, cancelación, error y turno posterior.
11. Documentar la tool.

### Reglas de dominio

Conservar diferencia entre IDs de catálogo e instancias, `order` normalizado, snapshots históricos, archivado lógico, `completado` derivado de series y separación entre plantilla y resultado real.

### Mantener este README

Toda tarea que cambie el proyecto debe actualizar las secciones afectadas y añadir:

```md
### YYYY-MM-DD — Título

- **Cambio:** qué se hizo.
- **Motivación:** por qué.
- **Áreas afectadas:** archivos/features.
- **Contrato nuevo:** qué deben saber futuros agentes.
- **Migración/verificación:** pasos realizados o pendientes.
```

## Verificación

```bash
npm run build
npm run lint
```

No hay tests automatizados, así que se necesita revisión manual:

- [ ] Arranque sin pantalla blanca.
- [ ] Navegación inferior correcta.
- [ ] Cambios de IndexedDB reactivos.
- [ ] Confirmaciones de borrado/restauración.
- [ ] Rutinas archivadas fuera de selectores activos.
- [ ] Historial legible tras archivar rutinas o ejercicios.
- [ ] Logger protege cambios sin guardar.
- [ ] Gráficas y estados vacíos correctos.
- [ ] Backup exporta/importa todas las tablas.
- [ ] Coach sin API key muestra instrucciones.
- [ ] Snapshot actualizado en cada petición.
- [ ] Ninguna tool escribe antes de confirmar.
- [ ] Cancelar no modifica datos.
- [ ] Errores llegan como `success: false`.
- [ ] Múltiples calls y `thoughtSignature` se reconstruyen.

Si se toca `db.ts`, probar base limpia, upgrades, pérdida cero de datos y export/import. Si se toca IA, probar información, cancelación, confirmación, múltiples acciones, entidades inexistentes, fechas relativas, errores y respuesta posterior.

## Limitaciones y decisiones

1. Los datos dependen del navegador; sin backup, borrar el almacenamiento puede perderlos.
2. No existe sincronización entre dispositivos.
3. La API key se usa desde el cliente y no hay proxy propio.
4. El snapshot de entrenamientos cubre 28 días; el peso se envía completo.
5. Las búsquedas por nombre exacto pueden ser ambiguas; preferir IDs.
6. Registrar una rutina desde IA copia objetivos como completados; para datos reales usar modo libre o editar después.
7. El archivado lógico conserva logs históricos.
8. Conviven fechas `YYYY-MM-DD`, horas locales y timestamps ISO; revisar zonas horarias.
9. Métricas usa Brzycki y analytics usa Epley.
10. No hay backend ni tests automatizados.
11. Los patrones específicos de React 19 + StrictMode no deben eliminarse sin reproducir sus problemas.
12. El prompt orienta al modelo, pero `toolExecutor.ts` es la autoridad final de escrituras y validaciones.

## Registro de cambios

### 2026-09-15 — Previsualización rica de propuestas IA

- **Cambio:** `ToolProposalCard` añade tarjetas específicas para editar rutinas, editar entrenamientos, registrar/editar peso y reordenar rutinas, con nombres resueltos desde IndexedDB y comparativas antes/después.
- **Motivación:** hacer comprensibles las consecuencias de una acción antes de confirmarla y evitar que el usuario tenga que interpretar JSON.
- **Áreas afectadas:** `src/features/coach-ia/components/ToolProposalCard.tsx` y este README.
- **Contrato nuevo:** la UI puede consultar el estado local actual para presentar el estado anterior; la confirmación y ejecución siguen siendo las del executor y no se realizan escrituras desde la tarjeta.
- **Verificación:** `npm run build` correcto; `npm run lint` mantiene los errores preexistentes documentados.

### 2026-09-15 — Contrato IA y ejecución atómica

- **Cambio:** se unificó el contrato efectivo de fechas en `fecha`, se eliminó la creación/omisión implícita de ejercicios no encontrados y se añadió ejecución transaccional para una o varias tools confirmadas.
- **Motivación:** evitar propuestas que fallen por discrepancias entre prompt, schema y executor, y evitar estados parciales cuando una acción compuesta falla.
- **Áreas afectadas:** `src/core/ia-prompts.ts`, `src/features/coach-ia/services/toolDefinitions.ts`, `src/features/coach-ia/services/toolExecutor.ts`, `src/features/coach-ia/CoachView.tsx` y este README.
- **Contrato nuevo:** `fecha` es el único campo de fecha; los ejercicios deben existir antes de usarse en rutinas/logs; las referencias inválidas abortan la operación; `executeFunctionCalls()` ejecuta el lote confirmado atómicamente.
- **Verificación:** `npm run build` correcto; `npm run lint` continúa fallando por errores preexistentes no relacionados.

### 2026-09-15 — Documentación técnica inicial

- **Cambio:** se sustituyó el README de plantilla de Vite por documentación de propósito, funcionalidades, arquitectura, stack, persistencia, métricas, PWA, Coach IA, tools y mantenimiento.
- **Motivación:** permitir que cualquier persona o agente nuevo entienda por qué existe Platón y cómo cambiarlo sin reconstruir el contexto.
- **Áreas afectadas:** `README.md`; no se modificó la lógica.
- **Contrato nuevo:** futuras tareas deben actualizar este documento si alteran comportamiento, datos, prompts o tools.
- **Verificación:** contenido contrastado con el código actual; ejecutar `npm run build` y `npm run lint`.

