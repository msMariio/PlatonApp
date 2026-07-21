import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getOrCreatePerfil, type PerfilUsuario } from "../../core/db";

/**
 * Hook reactivo que devuelve el perfil de usuario (singleton, id=1).
 * La escritura inicial se hace en un effect separado porque useLiveQuery
 * solo permite operaciones de solo-lectura.
 */
export function usePerfil(): PerfilUsuario | undefined {
  // Asegurar que el perfil existe (escritura fuera de liveQuery)
  useEffect(() => {
    void getOrCreatePerfil();
  }, []);

  // Lectura reactiva (solo-lectura, compatible con liveQuery)
  const perfil = useLiveQuery(
    () => db.perfil_usuario.get(1),
    [],
  );
  return perfil;
}
