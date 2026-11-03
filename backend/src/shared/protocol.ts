import { z } from "zod";

export const PlayerInputSchema = z.object({
  sequence: z.number().int().nonnegative(),
  throttle: z.number().min(0).max(1),
  brake: z.number().min(0).max(1),
  steering: z.number().min(-1).max(1),
  drift: z.boolean(),
  nitro: z.boolean()
}).strict();

export type PlayerInput = z.infer<typeof PlayerInputSchema>;

export interface RaceSnapshot {
  serverTick: number;
  acknowledgedInput: number;
  playerId: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  heading: number;
  speed: number;
}
