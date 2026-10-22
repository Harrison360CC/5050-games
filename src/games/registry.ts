import { pigeonSim, WORLD_H, WORLD_W } from "../sim/pigeon";
import { rentSim, RENT_H, RENT_W } from "../sim/rent";
import { slumlordSim, SL_H, SL_W } from "../sim/slumlord";
import { draw as drawPigeon } from "./pigeon/render";
import { drawRent } from "./rent/render";
import { drawSlumlord } from "./slumlord/render";
import type { GameDef } from "./mount";

export const GAMES: Record<"pigeon" | "rent" | "slumlord", GameDef<any>> = {
  pigeon: { sim: pigeonSim, worldW: WORLD_W, worldH: WORLD_H, draw: drawPigeon },
  rent: { sim: rentSim, worldW: RENT_W, worldH: RENT_H, draw: drawRent },
  slumlord: { sim: slumlordSim, worldW: SL_W, worldH: SL_H, draw: drawSlumlord },
};
