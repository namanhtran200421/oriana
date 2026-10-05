/**
 * The resting places on the walk through the reading room, as scroll progress
 * from 0 to 1. Kept apart from the engine so the page can know them without
 * loading it.
 */
export const STOPS = { desk: 0, letter: 0.43, shelf: 1 } as const;

export type Stop = keyof typeof STOPS;
