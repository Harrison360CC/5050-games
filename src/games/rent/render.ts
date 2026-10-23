import type { Hud } from "../mount";
import { drawChase } from "../hud";
import { RENT, RENT_GROUND, RENT_H, RENT_W, rentSpeed, type RentState } from "../../sim/rent";

const C = { sky: "#d9c7a3", sky2: "#b48f5c", far: "#8d6b47", bldg: "#5a3f2b", road: "#3a3230", line: "#d9c7a3", skin: "#e8b48f", boxers: "#4f8fd1", hair: "#2b1a12", ink: "#1a1410", paper: "#f5efe0", red: "#c62f2f", couch: "#7a4f8a", cone: "#f08a24", text: "#1a1410" };

let sky: CanvasGradient | null = null;

const DEATH_LINES = [
  "evicted.",
  "the landlord sends his regards.",
  "while they're out partying btw.",
  "my reaction to that: nothing.",
  "i'm so sorry.",
  "write that one down. scrib doon.",
];

export function drawRent(ctx: CanvasRenderingContext2D, s: RentState, scale: number, hud: Hud) {
  ctx.save();
  ctx.scale(scale, scale);
  // Cached: the sky never changes, so building it once beats building it 60
  // times a second on a phone.
  if (!sky) {
    sky = ctx.createLinearGradient(0, 0, 0, RENT_GROUND);
    sky.addColorStop(0, C.sky);
    sky.addColorStop(1, C.sky2);
  }
  ctx.fillStyle = sky; ctx.fillRect(0, 0, RENT_W, RENT_H);

  // far buildings parallax
  ctx.fillStyle = C.far;
  const off1 = (s.dist * 0.25) % 140;
  for (let i = -1; i < 4; i++) { const x = i * 140 - off1; const h = 120 + ((i * 53) % 70); ctx.fillRect(x, RENT_GROUND - h, 90, h); }
  ctx.fillStyle = C.bldg;
  const off2 = (s.dist * 0.5) % 110;
  for (let i = -1; i < 5; i++) { const x = i * 110 - off2; const h = 70 + ((i * 37) % 50); ctx.fillRect(x, RENT_GROUND - h, 60, h); }

  // landlord in the background, closer as speed rises (purely cosmetic)
  const close = Math.min(1, (rentSpeed(s.tick) - 3.8) / 7.0);
  const lx = 10 + close * 20, ly = RENT_GROUND - 28;
  ctx.fillStyle = C.ink; ctx.fillRect(lx, ly - 20, 14, 28); ctx.fillStyle = C.skin; ctx.fillRect(lx + 2, ly - 30, 10, 10);
  ctx.fillStyle = C.ink; ctx.font = "9px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.fillText("LANDLORD", lx - 4, ly - 34);

  // road
  ctx.fillStyle = C.road; ctx.fillRect(0, RENT_GROUND, RENT_W, RENT_H - RENT_GROUND);
  ctx.fillStyle = C.line;
  const off3 = s.dist % 60;
  for (let i = -1; i < 8; i++) ctx.fillRect(i * 60 - off3, RENT_GROUND + 30, 30, 3);

  // obstacles
  for (const o of s.obstacles) {
    const top = RENT_GROUND - o.h;
    if (o.kind === "notice") { ctx.fillStyle = C.paper; ctx.fillRect(o.x, top, o.w, o.h); ctx.fillStyle = C.red; ctx.fillRect(o.x + 3, top + 4, o.w - 6, 4); ctx.fillStyle = C.ink; ctx.fillRect(o.x + 3, top + 11, o.w - 6, 2); ctx.fillRect(o.x + 3, top + 16, o.w - 8, 2); }
    else if (o.kind === "cone") { ctx.fillStyle = C.cone; ctx.beginPath(); ctx.moveTo(o.x + o.w / 2, top); ctx.lineTo(o.x + o.w, RENT_GROUND); ctx.lineTo(o.x, RENT_GROUND); ctx.fill(); ctx.fillStyle = C.paper; ctx.fillRect(o.x + 5, top + 14, o.w - 10, 4); }
    else if (o.kind === "couch") { ctx.fillStyle = C.couch; ctx.fillRect(o.x, top + 8, o.w, o.h - 8); ctx.fillRect(o.x, top, 10, o.h); ctx.fillRect(o.x + o.w - 10, top, 10, o.h); ctx.fillStyle = C.ink; ctx.font = "8px system-ui"; ctx.fillText("FREE", o.x + 16, top + 22); }
    else { ctx.fillStyle = "#b03a5b"; ctx.fillRect(o.x + 2, top + 12, o.w - 4, o.h - 12); ctx.fillStyle = C.skin; ctx.fillRect(o.x + 4, top, o.w - 8, 12); ctx.fillStyle = C.hair; ctx.fillRect(o.x + 3, top - 2, o.w - 6, 5); ctx.fillStyle = C.ink; ctx.font = "8px system-ui"; ctx.fillText("ur ex", o.x - 2, top - 6); }
  }

  // player: guy in boxers
  const px = RENT.PLAYER_X, feet = s.y, h = RENT.PLAYER_H, w = RENT.PLAYER_W;
  const run = s.onGround ? Math.floor(s.tick / 5) % 2 : 0;
  ctx.fillStyle = C.skin; ctx.fillRect(px + 4, feet - h + 12, w - 8, 14); // torso
  ctx.fillStyle = C.boxers; ctx.fillRect(px + 3, feet - h + 26, w - 6, 10);
  ctx.fillStyle = C.paper; ctx.fillRect(px + 7, feet - h + 28, 3, 3); ctx.fillRect(px + 13, feet - h + 31, 3, 3); // polka dots
  ctx.fillStyle = C.skin; // legs
  if (s.onGround) { ctx.fillRect(px + 4 + run * 6, feet - 8, 5, 8); ctx.fillRect(px + 13 - run * 6, feet - 8, 5, 8); }
  else { ctx.fillRect(px + 2, feet - 8, 5, 8); ctx.fillRect(px + 15, feet - 10, 5, 8); }
  ctx.fillRect(px + 6, feet - h, 10, 12); // head
  ctx.fillStyle = C.hair; ctx.fillRect(px + 5, feet - h - 2, 12, 4);
  ctx.fillStyle = C.ink; ctx.fillRect(px + 13, feet - h + 4, 2, 2); // eye

  // HUD
  ctx.fillStyle = C.text; ctx.textAlign = "center";
  ctx.font = "bold 48px system-ui, sans-serif"; ctx.fillText(String(s.dodged), RENT_W / 2, 80);
  ctx.font = "14px system-ui, sans-serif"; ctx.fillStyle = "rgba(26,20,16,0.65)"; ctx.fillText(`days dodged · best ${hud.best}`, RENT_W / 2, 102);
  drawChase(ctx, hud, s.dodged, RENT_W, "rgba(26,20,16,0.7)", "#c1440e");

  if (!hud.started && hud.firstRun) {
    ctx.fillStyle = C.text; ctx.font = "bold 22px system-ui, sans-serif"; ctx.fillText("RENT'S DUE", RENT_W / 2, 300);
    ctx.font = "15px system-ui, sans-serif"; ctx.fillStyle = "rgba(26,20,16,0.8)"; ctx.fillText("tap to jump. he is faster than you think.", RENT_W / 2, 326);
  }
  if (s.dead) {
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(30, 240, RENT_W - 60, 140);
    ctx.fillStyle = C.paper; ctx.font = "bold 24px system-ui, sans-serif";
    ctx.fillText(DEATH_LINES[hud.seed % DEATH_LINES.length]!, RENT_W / 2, 285);
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText(`${s.dodged} days. tap to go again.`, RENT_W / 2, 320);
    if (hud.note) { ctx.font = "bold 14px system-ui, sans-serif"; ctx.fillStyle = "#FF8B2E"; ctx.fillText(hud.note, RENT_W / 2, 346); }
    if (hud.sub) { ctx.font = "13px system-ui, sans-serif"; ctx.fillStyle = "rgba(245,239,224,0.8)"; ctx.fillText(hud.sub, RENT_W / 2, 368); }
  }
  ctx.restore();
}
