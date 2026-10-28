let generation = 0;

export function nextGeneration(): number {
  generation += 1;
  return generation;
}

export function isCurrentGeneration(token: number): boolean {
  return token === generation;
}

export class StaleOperationError extends Error {
  constructor() {
    super('This operation was superseded by a newer one.');
    this.name = 'StaleOperationError';
  }
}
