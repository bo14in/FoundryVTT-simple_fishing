export const ID = "simple-fishing";
export const TIERS = ["common", "uncommon", "rare"];
export const DIFFICULTIES = {
  common: {width: 0.30, period: 2400},
  uncommon: {width: 0.20, period: 1800},
  rare: {width: 0.12, period: 1300}
};
export function positionAt(elapsed, period, phase = 0) {
  const t = ((elapsed / period + phase) % 1 + 1) % 1;
  return t < 0.5 ? t * 2 : 2 - t * 2;
}
export function caught(elapsed, game) {
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 15000) return false;
  const p = positionAt(elapsed, game.period, game.phase);
  return p >= game.zone && p <= game.zone + game.width;
}
export function spotData(data = {}) {
  return {
    enabled: true, name: String(data.name || "Fishing Spot").slice(0,100),
    remaining: Math.max(0, Math.floor(Number(data.remaining) || 0)),
    tier: TIERS.includes(data.tier) ? data.tier : "common",
    biteDC: Math.max(1,Math.min(20,Math.floor(Number(data.biteDC) || 10))),
    deleteEmpty: !!data.deleteEmpty
  };
}
export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
export function plainText(text) {
  return String(text || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function abilityModifier(actor,key){
  const ability=actor?.system?.abilities?.[key];
  if(ability?.mod!==undefined && ability.mod!==null && Number.isFinite(Number(ability.mod))) return Number(ability.mod);
  const score=Number(ability?.value ?? 10);
  return Number.isFinite(score) ? Math.floor((score-10)/2) : 0;
}
export function isFishingTackle(item){
  const normalize=value=>String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g,"");
  return normalize(item?.system?.identifier)==="fishingtackle" || /^fishing[\s-]+tackle(?:\b|$)/i.test(String(item?.name ?? "").trim());
}
export function hasFishingTackle(actor){
  return [...(actor?.items?.values() ?? [])].some(item=>isFishingTackle(item) && Number(item.system?.quantity ?? 1)>0);
}
export function characterDifficulty(actor,tier,hasBait){
  const base=DIFFICULTIES[tier] ?? DIFFICULTIES.common;
  const dexMod=abilityModifier(actor,"dex"),wisMod=abilityModifier(actor,"wis");
  const width=Math.max(.05,Math.min(.5,(base.width+wisMod*.02)*(hasBait ? 1 : .65)));
  const period=Math.round(base.period*Math.max(.5,Math.min(2,1+dexMod*.1)));
  return {width,period,dexMod,wisMod,noBait:!hasBait};
}
