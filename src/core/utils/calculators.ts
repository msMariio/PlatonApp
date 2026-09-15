/**
 * Calcula el e1RM estimado con la fórmula de Brzycki.
 *
 * e1RM = peso × (36 / (37 - repeticiones))
 * La fórmula se considera válida para 1 ≤ repeticiones < 37.
 */
export function calcularE1RM(peso: number, repeticiones: number): number {
  if (peso <= 0 || repeticiones <= 0 || repeticiones >= 37) return 0;
  return peso * (36 / (37 - repeticiones));
}
