/**
 * Changes an existing SVG transform when its node's geometry is changed by A.
 * (A T A^-1)(A p) = A(T p); the same identity telescopes through a subtree.
 * Keeping T as SVG text also supports rotate, skew and matrix without parsing.
 */
export class TransformOperations {
  static moved(original: string, dx: number, dy: number): string {
    if (!original.trim() || (dx === 0 && dy === 0)) return original;
    return `translate(${dx} ${dy}) ${original} translate(${-dx} ${-dy})`;
  }

  static scaled(original: string, factor: number): string {
    if (!original.trim() || factor === 1) return original;
    const inverse = 1 / factor;
    if (!Number.isFinite(inverse)) throw new Error('scale factor is too small for an existing transform');
    return `scale(${factor}) ${original} scale(${inverse})`;
  }
}
