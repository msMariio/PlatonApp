import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Wrapper del setNodeRef de @dnd-kit que ignora los `null` que React 19 +
 * StrictMode envía durante el cleanup del doble render. Sólo registra
 * mounts reales con dnd-kit, evitando que los nodos se des-registren y
 * rompan el drag-and-drop.
 *
 * El parámetro `_stableId` se acepta para mantener compatibilidad de API
 * con los call sites; no se usa actualmente.
 *
 * Uso:
 *   const sortable = useSortable({ id, data });
 *   const setNodeRef = useStableNodeRef(sortable.setNodeRef, sortableId);
 *   return <Box ref={setNodeRef} {...sortable.attributes} {...sortable.listeners}>...
 */
export function useStableNodeRef(
  callback: (node: HTMLElement | null) => void,
  _stableId?: string
): (node: HTMLElement | null) => void {
  const ref = useRef(callback);
  useLayoutEffect(() => {
    ref.current = callback;
  }, [callback]);

  return useCallback((node: HTMLElement | null) => {
    if (node !== null) {
      ref.current(node);
    }
  }, []);
}
