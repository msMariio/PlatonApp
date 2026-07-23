import { db } from "./db";
import type {
  Ejercicio,
  Carpeta,
  Rutina,
  LogEntrenamiento,
  PesoDiario,
  PlanificacionSemanal,
  PerfilUsuario,
  SesionChat,
} from "./db";

const APP_NAME = "Platón";
const BACKUP_VERSION = 1;

export interface BackupData {
  app: string;
  version: number;
  exportedAt: string;
  data: {
    ejercicios: Ejercicio[];
    carpetas: Carpeta[];
    rutinas: Rutina[];
    logsEntrenamientos: LogEntrenamiento[];
    pesos: PesoDiario[];
    planificacionSemanal: PlanificacionSemanal[];
    perfil_usuario: PerfilUsuario[];
    sesiones_chat: SesionChat[];
  };
}

/**
 * Consulta todas las tablas de Dexie.js y genera un archivo JSON que se
 * descarga automáticamente en el navegador.
 */
export async function exportBackup(): Promise<void> {
  const [
    ejercicios,
    carpetas,
    rutinas,
    logsEntrenamientos,
    pesos,
    planificacionSemanal,
    perfil_usuario,
    sesiones_chat,
  ] = await Promise.all([
    db.ejercicios.toArray(),
    db.carpetas.toArray(),
    db.rutinas.toArray(),
    db.logsEntrenamientos.toArray(),
    db.pesos.toArray(),
    db.planificacionSemanal.toArray(),
    db.perfil_usuario.toArray(),
    db.sesiones_chat.toArray(),
  ]);

  const backup: BackupData = {
    app: APP_NAME,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      ejercicios,
      carpetas,
      rutinas,
      logsEntrenamientos,
      pesos,
      planificacionSemanal,
      perfil_usuario,
      sesiones_chat,
    },
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const filename = `platon_backup_${yyyy}-${mm}-${dd}.json`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Lee un archivo JSON, valida que tenga la estructura de backup esperada,
 * y retorna los datos parseados o lanza un error descriptivo.
 */
function validateBackupJson(json: unknown): BackupData {
  if (!json || typeof json !== "object") {
    throw new Error("El archivo no contiene un JSON válido.");
  }

  const obj = json as Record<string, unknown>;

  if (obj.app !== APP_NAME) {
    throw new Error(
      `El archivo no parece ser un backup de ${APP_NAME} (app: "${obj.app}").`
    );
  }

  if (!obj.data || typeof obj.data !== "object") {
    throw new Error(
      'El backup no contiene la propiedad "data" o tiene un formato incorrecto.'
    );
  }

  const data = obj.data as Record<string, unknown>;
  const requiredTables = [
    "ejercicios",
    "carpetas",
    "rutinas",
    "logsEntrenamientos",
    "pesos",
    "planificacionSemanal",
    "perfil_usuario",
    "sesiones_chat",
  ];

  for (const table of requiredTables) {
    if (!Array.isArray(data[table])) {
      throw new Error(
        `El backup no contiene el array "${table}" en "data". Formato inválido.`
      );
    }
  }

  return obj as unknown as BackupData;
}

/**
 * Ejecuta la importación: vacía todas las tablas y escribe los datos del
 * backup en una transacción atómica.
 */
async function performImport(backup: BackupData): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.ejercicios,
      db.carpetas,
      db.rutinas,
      db.logsEntrenamientos,
      db.pesos,
      db.planificacionSemanal,
      db.perfil_usuario,
      db.sesiones_chat,
    ],
    async () => {
      // Limpiar tablas en orden inverso para respetar dependencias conceptuales
      await db.sesiones_chat.clear();
      await db.perfil_usuario.clear();
      await db.planificacionSemanal.clear();
      await db.logsEntrenamientos.clear();
      await db.pesos.clear();
      await db.rutinas.clear();
      await db.carpetas.clear();
      await db.ejercicios.clear();

      // Insertar datos nuevos
      if (backup.data.ejercicios.length > 0) {
        await db.ejercicios.bulkAdd(backup.data.ejercicios);
      }
      if (backup.data.carpetas.length > 0) {
        await db.carpetas.bulkAdd(backup.data.carpetas);
      }
      if (backup.data.rutinas.length > 0) {
        await db.rutinas.bulkAdd(backup.data.rutinas);
      }
      if (backup.data.logsEntrenamientos.length > 0) {
        await db.logsEntrenamientos.bulkAdd(backup.data.logsEntrenamientos);
      }
      if (backup.data.pesos.length > 0) {
        await db.pesos.bulkAdd(backup.data.pesos);
      }
      if (backup.data.planificacionSemanal.length > 0) {
        await db.planificacionSemanal.bulkAdd(backup.data.planificacionSemanal);
      }
      if (backup.data.perfil_usuario.length > 0) {
        await db.perfil_usuario.bulkAdd(backup.data.perfil_usuario);
      }
      if (backup.data.sesiones_chat.length > 0) {
        await db.sesiones_chat.bulkAdd(backup.data.sesiones_chat);
      }
    }
  );
}

/**
 * Procesa un archivo de backup seleccionado por el usuario:
 * 1. Lee el archivo con FileReader
 * 2. Valida el formato
 * 3. Si la validación es exitosa, retorna los datos para que el caller
 *    muestre un diálogo de confirmación antes de ejecutar la importación.
 *
 * Lanza un error descriptivo si algo falla.
 */
export function readBackupFile(file: File): Promise<BackupData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const text = reader.result as string;
        const json = JSON.parse(text);
        const backup = validateBackupJson(json);
        resolve(backup);
      } catch (err) {
        reject(
          err instanceof Error ? err : new Error("Error desconocido al leer el archivo.")
        );
      }
    };

    reader.onerror = () => {
      reject(new Error("No se pudo leer el archivo seleccionado."));
    };

    reader.readAsText(file);
  });
}

/**
 * Importa un backup ya validado, ejecutando la transacción de escritura.
 * Debe llamarse después de que el usuario confirme la acción.
 */
export async function importBackup(backup: BackupData): Promise<void> {
  await performImport(backup);
}
