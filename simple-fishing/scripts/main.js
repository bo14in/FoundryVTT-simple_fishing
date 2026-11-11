import {ID, TIERS, positionAt, caught, characterDifficulty, hasFishingTackle, isFishingTackle, spotData, escapeHTML as esc, plainText} from "./core.mjs";
const App=foundry.applications.api.ApplicationV2;
const ICON=`modules/${ID}/icons/spot.svg`;
const sessions=new Map(), windows=new Map();
let queue=Promise.resolve(), placementCleanup;
const spotWindows=new Map();
let actorPromise, removePlayerClicks;
const notifyError=e=>{console.error(`${ID} |`,e);ui.notifications.error(e.message || String(e));};
function primaryGM(){return game.users.activeGM ?? game.users.find(u=>u.active && u.isGM);}
function isHost(){return game.user.isGM && primaryGM()?.id===game.user.id;}
function getSpot(doc){return doc?.getFlag(ID,"spot");}
function isSpot(doc){return !!getSpot(doc)?.enabled || !!doc?.actor?.getFlag(ID,"spotActor");}
function spotName(doc){return getSpot(doc)?.name || doc.name || "Fishing Spot";}
function tierOptions(selected){return TIERS.map(t=>`<option value="${t}" ${selected===t ? "selected" : ""}>${t[0].toUpperCase()+t.slice(1)} · ${t==="common" ? "Easy" : t==="uncommon" ? "Medium" : "Hard"}</option>`).join("");}
function enqueue(fn){queue=queue.then(fn).catch(notifyError);return queue;}
async function droppedDocument(event){
  const data=JSON.parse(event.dataTransfer.getData("text/plain"));
  const doc=await fromUuid(data.uuid);
  if(!["Item","RollTable"].includes(doc?.documentName)) throw Error("Drop an Item or RollTable from a sidebar or compendium.");
  return doc;
}
class FishingApp extends App {
  static DEFAULT_OPTIONS = {classes:["simple-fishing"], position:{width:640, height:"auto"}, window:{title:"Simple Fishing", resizable:false}};
  async _renderHTML() { return this.html(); }
  _replaceHTML(result, content) { content.innerHTML = `<div class="sf-body">${result}</div>`; this.bind(content); }
  html() { return ""; }
  bind() {}
  bindButton(root, name, fn) {
    root.querySelector(`[data-sf="${name}"]`)?.addEventListener("click", async event => {
      const b = event.currentTarget; b.disabled = true;
      try { await fn(event); } catch(e) { notifyError(e); } finally { if(b.isConnected) b.disabled = false; }
    });
  }
}

class FishingSettings extends FishingApp {
  html(){
    const rewards=game.settings.get(ID,"rewards");
    return `<h2>Fishing rewards</h2><p class="sf-muted">Drop your Items or RollTables into each difficulty. One entry is chosen at random per catch. Changes save automatically.</p>
    ${TIERS.map(t=>`<section class="sf-reward-group"><h3>${t[0].toUpperCase()+t.slice(1)} <small>${t==="common" ? "Easy" : t==="uncommon" ? "Medium" : "Hard"}</small></h3><div class="sf-drop" data-tier="${t}"><i class="fas fa-plus"></i> Drop Items or RollTables</div><ul class="sf-reward-list">${(rewards[t] || []).map((r,i)=>`<li><img src="${esc(r.img || ICON)}" alt=""><span>${esc(r.name)}<small>${esc(r.type)}</small></span><button type="button" data-remove="${t}:${i}" title="Remove reward" aria-label="Remove ${esc(r.name)}">×</button></li>`).join("") || '<li class="sf-muted">No rewards added</li>'}</ul></section>`).join("")}
    <label class="sf-check"><input name="approval" type="checkbox" ${game.settings.get(ID,"gmApproval") ? "checked" : ""}>GM chooses each catch</label><p class="sf-muted">Leave off for fewer windows. When enabled, the GM can choose a catch based on the bait.</p>`;
  }
  bind(root){
    for(const box of root.querySelectorAll("[data-tier]")){
      box.addEventListener("dragover",e=>{e.preventDefault();box.classList.add("sf-dragging");});
      box.addEventListener("dragleave",()=>box.classList.remove("sf-dragging"));
      box.addEventListener("drop",async e=>{
        e.preventDefault();box.classList.remove("sf-dragging");
        try{
          const doc=await droppedDocument(e), rewards=foundry.utils.deepClone(game.settings.get(ID,"rewards"));
          const list=rewards[box.dataset.tier] ??=[];
          if(!list.some(r=>r.uuid===doc.uuid)) list.push({uuid:doc.uuid,name:doc.name,img:doc.img || ICON,type:doc.documentName});
          await game.settings.set(ID,"rewards",rewards);await this.render(true);
        }catch(err){notifyError(err);}
      });
    }
    for(const button of root.querySelectorAll("[data-remove]")) button.addEventListener("click",async()=>{
      try{const [tier,index]=button.dataset.remove.split(":"),rewards=foundry.utils.deepClone(game.settings.get(ID,"rewards"));rewards[tier].splice(Number(index),1);await game.settings.set(ID,"rewards",rewards);await this.render(true);}catch(e){notifyError(e);}
    });
    root.querySelector("[name=approval]").addEventListener("change",e=>{void game.settings.set(ID,"gmApproval",e.target.checked).catch(notifyError);});
  }
}

class FishingWindow extends FishingApp {
  constructor(spot){super();this.spot=spot;this.fishingState="idle";this.finished=false;windows.set(spot.uuid,this);}
  html(){
    this.spotUnavailable=!!this.spotGone || !(getSpot(this.spot)?.remaining>0);
    if(this.fishingState==="playing") return `<h2>${esc(spotName(this.spot))}</h2><p class="sf-muted">Reel when the fish’s center enters the green zone.</p><p class="sf-character-bonus">DEX ${this.game.dexMod>=0 ? "+" : ""}${this.game.dexMod ?? 0} · WIS ${this.game.wisMod>=0 ? "+" : ""}${this.game.wisMod ?? 0}${this.game.noBait ? " · No bait: smaller catch zone" : ""}</p><div class="sf-water"><div class="sf-zone" style="left:${this.game.zone*100}%;width:${this.game.width*100}%"><span>CATCH</span></div><div class="sf-fish">🐟</div></div><button data-sf="reel" class="sf-reel"><i class="fas fa-fish"></i> Reel!</button><p class="sf-status">15 seconds · One chance</p>`;
    this.actors=[...game.actors].filter(a=>a.isOwner && a.type==="character");
    for(const t of canvas.tokens?.controlled ?? []) if(t.actor?.isOwner && t.actor.type==="character" && !this.actors.some(a=>a.uuid===t.actor.uuid)) this.actors.unshift(t.actor);
    this.selected=this.selected || canvas.tokens?.controlled.find(t=>t.actor?.type==="character" && t.actor.isOwner)?.actor?.uuid || game.user.character?.uuid || this.actors[0]?.uuid;
    return `<h2>${esc(spotName(this.spot))}</h2><div class="sf-grid"><label>Character<select name="actor">${this.actors.map(a=>`<option value="${esc(a.uuid)}" ${a.uuid===this.selected ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label><label>Bait<select name="bait"></select></label></div><p class="sf-muted">Fishing Tackle required. DEX slows the fish; WIS widens the green zone. No bait makes the zone 35% smaller.</p><p class="sf-loadout sf-muted"></p><button data-sf="cast" ${this.fishingState==="waiting" || this.spotUnavailable ? "disabled" : ""}>${this.spotUnavailable ? "Spot closed" : this.fishingState==="waiting" ? "Waiting for a bite…" : "Cast"}</button><p class="sf-status">${esc(this.status || "Choose bait or cast with none.")}</p>`;
  }
  bind(root){
    if(this.fishingState==="playing"){this.bindGame(root);return;}
    const actorSelect=root.querySelector("[name=actor]");
    const refresh=()=>{
      this.selected=actorSelect.value;const actor=this.actors.find(a=>a.uuid===this.selected);
      root.querySelector("[name=bait]").innerHTML='<option value="">No bait</option>'+[...(actor?.items?.values() ?? [])].filter(i=>Number(i.system.quantity)>0 && !isFishingTackle(i)).sort((a,b)=>a.name.localeCompare(b.name)).map(i=>`<option value="${i.id}">${esc(i.name)} ×${Number(i.system.quantity)}</option>`).join("");
      const tackle=hasFishingTackle(actor);
      const loadout=root.querySelector(".sf-loadout");if(loadout) loadout.textContent=tackle ? "Fishing Tackle ready · Reusable" : "Add Fishing Tackle to this character’s inventory to cast.";
      const castButton=root.querySelector('[data-sf="cast"]');if(castButton) castButton.disabled=!tackle || this.fishingState==="waiting" || this.spotUnavailable;
    };actorSelect.addEventListener("change",refresh);refresh();
    actorSelect.disabled=this.fishingState==="waiting";root.querySelector("[name=bait]").disabled=this.fishingState==="waiting";
    this.bindButton(root,"cast",async()=>{
      if(this.fishingState!=="idle" || this.spotUnavailable) return;
      if(!this.selected) throw Error("Choose an owned character first.");
      if(!hasFishingTackle(this.actors.find(a=>a.uuid===this.selected))) throw Error("Fishing Tackle is required in this character’s inventory.");
      const baitId=root.querySelector("[name=bait]").value;
      this.finished=false;this.session=null;this.fishingState="waiting";this.status="Rolling for a bite…";
      try{await sendRequest({action:"cast",spot:this.spot.uuid,actor:this.selected,baitId});if(this.fishingState==="waiting") await this.render(true);}
      catch(e){this.fishingState="idle";await this.render(true);throw e;}
    });
  }
  async begin(data){this.session=data.id;this.game=data.game;this.fishingState="playing";this.finished=false;await this.render(true);}
  bindGame(root){
    this.started=performance.now();
    const fish=root.querySelector(".sf-fish"),status=root.querySelector(".sf-status");
    const animate=()=>{
      if(this.finished || this.fishingState!=="playing") return;
      const elapsed=performance.now()-this.started;
      fish.style.left=`${positionAt(elapsed,this.game.period,this.game.phase)*100}%`;
      status.textContent=`${Math.max(0,Math.ceil((15000-elapsed)/1000))} seconds · One chance`;
      if(elapsed>=15000){void this.finish(15001).catch(notifyError);return;}
      this.frame=requestAnimationFrame(animate);
    };
    root.querySelector('[data-sf="reel"]').addEventListener("click",()=>{void this.finish(performance.now()-this.started).catch(notifyError);});animate();
  }
  async finish(elapsed){
    if(this.finished) return;this.finished=true;cancelAnimationFrame(this.frame);
    this.element.querySelector('[data-sf="reel"]').disabled=true;this.element.querySelector(".sf-status").textContent="Checking your catch…";
    try{await sendRequest({action:"reel",session:this.session,elapsed});}catch(e){this.element.querySelector(".sf-status").textContent="Could not send the result. Ask the GM to resolve it.";throw e;}
  }
  async result(text){cancelAnimationFrame(this.frame);this.finished=true;this.session=null;this.fishingState="idle";this.status=text;await this.render(true);}
  async close(options){
    cancelAnimationFrame(this.frame);windows.delete(this.spot.uuid);
    if((this.session || this.fishingState==="waiting") && !this.finished) await sendRequest({action:"cancel",session:this.session,spot:this.spot.uuid}).catch(notifyError);
    this.finished=true;return super.close(options);
  }
}

class ApprovalWindow extends FishingApp {
  constructor(session){super();this.session=session;this.started=false;}
  html(){const s=this.session;return `<h2>${esc(s.actor.name)} is fishing</h2><p><b>Bait:</b> ${esc(s.baitName)}</p><label>Difficulty<select name="tier">${tierOptions(s.tier)}</select></label><label>Catch<input name="catch" maxlength="150" placeholder="Leave blank to use your reward list"></label><p class="sf-muted">Type a catch name or drag an Item onto this field.</p><div class="sf-buttons"><button data-sf="start">Roll for a bite</button><button data-sf="cancel">Cancel</button></div>`;}
  bind(root){
    const input=root.querySelector("[name=catch]");
    input.addEventListener("dragover",e=>e.preventDefault());
    input.addEventListener("input",()=>{this.itemUuid=null;});
    input.addEventListener("drop",async e=>{e.preventDefault();try{const doc=await droppedDocument(e);if(doc.documentName!=="Item") throw Error("Drop an Item here.");this.itemUuid=doc.uuid;input.value=doc.name;}catch(err){notifyError(err);}});
    this.bindButton(root,"start",()=>enqueue(async()=>{
      const s=this.session;if(!sessions.has(s.id)) throw Error("This cast expired.");
      s.tier=root.querySelector("[name=tier]").value;s.itemUuid=this.itemUuid;s.custom=this.itemUuid ? "" : input.value.trim();
      await startBite(s);this.started=true;await this.close();
    }));
    this.bindButton(root,"cancel",()=>this.close());
  }
  async close(options){if(!this.started && sessions.has(this.session.id)) await enqueue(()=>cancelSession(this.session,"The GM cancelled the cast. No bait was spent."));return super.close(options);}
}

async function sendRequest(request) {
  const gm=primaryGM();
  if(!gm) throw Error("An active GM is required for fishing.");
  return ChatMessage.create({content:"<p>🎣 Fishing request</p>",whisper:[gm.id,game.user.id],flags:{[ID]:{request}}});
}
async function reply(userId, payload, text) {
  return ChatMessage.create({content:`<p>🎣 ${esc(text)}</p>`,whisper:[userId,game.user.id],flags:{[ID]:{reply:{...payload,to:userId}}}});
}
async function handleRequest(message) {
  const r=message.getFlag(ID,"request"), user=message.author;
  if(!r || !user || !user.active) return;
  try {
    if(r.action==="cast") await cast(user,r);
    else if(r.action==="reel" || r.action==="cancel") {
      const s=r.session ? sessions.get(r.session) : [...sessions.values()].find(s=>s.userId===user.id && s.token.uuid===r.spot);
      if(!s || s.userId!==user.id) return;
      if(r.action==="cancel") await cancelSession(s,s.baitId ? "You stopped fishing. Spent bait was lost." : "You stopped fishing.");
      else await resolveCatch(s,r.elapsed);
    }
  } catch(e) {
    await reply(user.id,{kind:"error",spot:r.spot, id:r.session},e.message || String(e));
    console.error(`${ID} | request`,e);
  } finally {await message.delete().catch(()=>{});}
}
async function cast(user,r) {
  const token=await fromUuid(r.spot), actor=await fromUuid(r.actor);
  if(token?.documentName!=="Token" || !isSpot(token)) throw Error("That fishing spot no longer exists.");
  if(!actor || actor.type!=="character" || !actor.testUserPermission(user,"OWNER")) throw Error("You must own the fishing character.");
  if(!user.isGM && token.parent.id!==user.viewedScene) throw Error("You must be viewing the fishing spot’s scene.");
  if(token.hidden && !user.isGM) throw Error("That spot is hidden.");
  if(!(getSpot(token)?.remaining>0)) throw Error("Nothing is biting here.");
  if([...sessions.values()].some(s=>s.actor.uuid===actor.uuid)) throw Error("This character already has an active cast.");
  if([...sessions.values()].some(s=>s.token.uuid===token.uuid)) throw Error("Someone is already fishing here. Wait for their attempt to finish.");
  if(!hasFishingTackle(actor)) throw Error("Fishing Tackle is required in this character’s inventory.");
  const bait=r.baitId ? actor.items.get(r.baitId) : null;
  if(bait && isFishingTackle(bait)) throw Error("Fishing Tackle is your reusable equipment. Choose another item as bait, or No bait.");
  if(r.baitId && (!bait || !(Number(bait.system.quantity)>=1))) throw Error("That bait is no longer available.");
  const s={id:foundry.utils.randomID(),userId:user.id,token,actor,baitId:bait?.id ?? null,baitName:bait?.name ?? "No bait",tier:getSpot(token).tier,created:Date.now(),state:"pending"};
  sessions.set(s.id,s);
  if(game.settings.get(ID,"gmApproval")) {
    s.app=new ApprovalWindow(s); await s.app.render(true);
    await reply(user.id,{kind:"waiting",id:s.id,spot:token.uuid},`${actor.name} is waiting for the GM to choose a catch for ${s.baitName}.`);
  } else {
    try {await startBite(s);} catch(e) {sessions.delete(s.id);throw e;}
  }
}
async function startBite(s) {
  if(s.state!=="pending") throw Error("This bite has already started.");
  const token=await fromUuid(s.token.uuid);
  if(!token || !(getSpot(token)?.remaining>0)) throw Error("This spot is empty or was removed.");
  if(!hasFishingTackle(s.actor)) throw Error("Fishing Tackle was removed. Add it back before fishing.");
  // Prepare the reward before spending bait, so broken tables never waste a cast.
  s.reward=await prepareReward(s);
  if(s.baitId) {
    const bait=s.actor.items.get(s.baitId), quantity=Number(bait?.system.quantity);
    if(!bait || !(quantity>=1)) throw Error("The bait was removed before the bite started.");
    if(quantity===1) await bait.delete(); else await bait.update({"system.quantity":quantity-1});
  }
  const biteDC=spotData(getSpot(token)).biteDC;
  const bite=await new foundry.dice.Roll("1d20").evaluate();
  await bite.toMessage({speaker:ChatMessage.getSpeaker({actor:s.actor}),flavor:`Fishing bite · ${esc(spotName(token))} · DC ${biteDC}`,whisper:[s.userId,game.user.id]});
  const natural=bite.total; // Unmodified 1d20: total is the natural die face.
  let criticalBonus="";
  if(natural===1){
    await cancelSession(s,"Natural 1! The fish were scared away!");
    await token.delete();
    return;
  }
  if(natural===20){
    const remaining=Number(getSpot(token).remaining);
    await token.update({[`flags.${ID}.spot.remaining`]:Math.min(99999,remaining+1)});
    criticalBonus=remaining<99999 ? " Natural 20! +1 remaining catch." : " Natural 20!";
  }else if(bite.total<biteDC){
    const remaining=Math.max(0,Number(getSpot(token).remaining)-1);
    await token.update({[`flags.${ID}.spot.remaining`]:remaining});
    await cancelSession(s,`No bite — rolled ${bite.total}, needed ${biteDC}. A fish swims away.${s.baitId ? " Your bait was used." : " No bait was used."}`);
    if(remaining===0 && getSpot(token).deleteEmpty) await token.delete();
    return;
  }
  const difficulty=characterDifficulty(s.actor,s.tier,!!s.baitId);
  s.game={...difficulty,zone:0.08+Math.random()*(0.84-difficulty.width),phase:Math.random()};
  s.state="playing";s.started=Date.now();
  await reply(s.userId,{kind:"start",id:s.id,spot:s.token.uuid,game:s.game},`${s.actor.name} has a bite! Rolled ${bite.total} against DC ${biteDC}.${criticalBonus} ${s.baitId ? `One ${s.baitName} was used.` : "No bait used."}`);
}
async function resultDocument(result) {
  const collection=result.documentCollection, id=result.documentId;
  if(collection && id) {
    const pack=game.packs.get(collection);
    if(pack) return pack.getDocument(id);
    return game.collections.get(collection)?.get(id) ?? null;
  }
  // Text results may explicitly link an Item UUID.
  const match=String(result.text || "").match(/@UUID\[([^\]]+)\]/);
  return match ? fromUuid(match[1]) : null;
}
function loot(name,img=ICON) {return {name:plainText(name).slice(0,150) || "Fish",type:"loot",img,system:{quantity:1}};}
async function prepareReward(s) {
  if(s.custom) return {items:[loot(s.custom)],text:s.custom};
  if(s.itemUuid) {
    const item=await fromUuid(s.itemUuid);
    if(item?.documentName!=="Item") throw Error("The selected catch item could not be found.");
    return {items:[copyItem(item)],text:item.name};
  }
  const choices=game.settings.get(ID,"rewards")?.[s.tier] ?? [];
  if(!choices.length) throw Error(`Add ${s.tier} rewards in Module Settings → Simple Fishing first.`);
  const choice=choices[Math.floor(Math.random()*choices.length)];
  const document=await fromUuid(choice.uuid);
  if(document?.documentName==="Item") return {items:[copyItem(document)],text:document.name};
  if(document?.documentName!=="RollTable") throw Error(`Reward “${choice.name}” is missing. Remove it from Fishing rewards.`);
  const table=document;
  // roll(), rather than draw(), avoids consuming table entries on misses and leaves
  // stock management to the fishing spot. Nested tables are resolved recursively.
  const {results}=await table.roll({recursive:true});
  if(!results?.length) throw Error(`No available results in ${table.name}. Reset/normalize that table or enable replacement.`);
  const items=[],texts=[];
  for(const result of results) {
    const doc=await resultDocument(result);
    if(doc?.documentName==="Item") {items.push(copyItem(doc));texts.push(doc.name);}
    else if(result.documentId) throw Error(`Reward in ${table.name} must reference an Item, another RollTable, or plain text.`);
    else texts.push(plainText(result.text) || "Something unusual");
  }
  return {items,text:texts.join(", ")};
}
function copyItem(item) {
  const data=item.toObject(); delete data._id; delete data.folder; delete data.ownership; delete data._stats;
  data.system.quantity=1;
  if("container" in data.system) data.system.container=null;
  if("equipped" in data.system) data.system.equipped=false;
  return data;
}
async function resolveCatch(s,elapsed) {
  if(s.state!=="playing") return;
  // The timestamp is local elapsed time, keeping timing fair despite network delay.
  const valid=Date.now()-s.started<=45000 && caught(elapsed,s.game);
  s.state="resolving";
  if(!valid) {await cancelSession(s,s.baitId ? "The catch got away. Your bait was lost." : "The catch got away.");return;}
  const token=await fromUuid(s.token.uuid);
  if(!token || !(getSpot(token)?.remaining>0)) {await cancelSession(s,"The fishing spot was removed or emptied. Ask the GM to restore your bait.");return;}
  const remaining=getSpot(token).remaining;
  let created=[];
  try {
    if(s.reward.items.length) created=await s.actor.createEmbeddedDocuments("Item",s.reward.items);
    await token.update({[`flags.${ID}.spot.remaining`]:remaining-1});
  } catch(e) {
    // Roll back inserted items if the stock update fails. Never silently retry rewards.
    if(created.length) await s.actor.deleteEmbeddedDocuments("Item",created.map(i=>i.id)).catch(notifyError);
    sessions.delete(s.id);
    await reply(s.userId,{kind:"end",id:s.id,spot:s.token.uuid},"The catch could not be saved. Ask the GM to restore the bait and check the spot.");
    throw e;
  }
  sessions.delete(s.id);
  const suffix=s.reward.items.length ? " Added to inventory." : " (Text result; no inventory item.)";
  await reply(s.userId,{kind:"end",id:s.id,spot:s.token.uuid},`${s.actor.name} caught: ${s.reward.text}.${suffix}`);
  if(remaining===1 && getSpot(token).deleteEmpty) await token.delete();
}
async function cancelSession(s,text) {
  if(!sessions.has(s.id)) return;
  sessions.delete(s.id);
  await reply(s.userId,{kind:"end",id:s.id,spot:s.token.uuid},text);
}
function openFishing(spot){
  if(!primaryGM()) return ui.notifications.warn("An active GM is required.");
  if(!(getSpot(spot)?.remaining>0)) return ui.notifications.info("Nothing is biting here.");
  const existing=windows.get(spot.uuid);if(existing){existing.bringToFront();return existing;}
  return new FishingWindow(spot).render(true);
}
class SpotConfig extends FishingApp {
  static DEFAULT_OPTIONS={position:{width:420,height:"auto"},window:{title:"Fishing Spot"}};
  constructor(token){super();this.token=token;spotWindows.set(token.uuid,this);}
  html(){const d=spotData(getSpot(this.token) ?? {remaining:6});return `<h2>Fishing spot</h2><label>Name<input name="name" maxlength="100" value="${esc(d.name || this.token.name)}"></label><div class="sf-grid"><label>Catches remaining<input name="remaining" type="number" min="0" max="99999" step="1" value="${d.remaining}"></label><label>Difficulty<select name="tier">${tierOptions(d.tier)}</select></label></div><label>Bite DC<input name="biteDC" type="number" min="1" max="20" step="1" value="${d.biteDC}"></label><label class="sf-check"><input name="deleteEmpty" type="checkbox" ${d.deleteEmpty ? "checked" : ""}>Delete spot when empty</label><button data-sf="save">Save</button><div class="sf-buttons"><button data-sf="fish">Test fishing</button><button data-sf="delete">Delete spot</button></div>`;}
  bind(root){
    this.bindButton(root,"save",async()=>{
      const read=n=>root.querySelector(`[name=${n}]`),remaining=Number(read("remaining").value);
      if(!Number.isInteger(remaining) || remaining<0 || remaining>99999) throw Error("Enter a whole catch count from 0 to 99999.");
      const biteDC=Number(read("biteDC").value);
      if(!Number.isInteger(biteDC) || biteDC<1 || biteDC>20) throw Error("Bite DC must be a whole number from 1 to 20.");
      const name=read("name").value.trim() || "Fishing Spot";
      const spot=spotData({name,remaining,biteDC,tier:read("tier").value,deleteEmpty:read("deleteEmpty").checked});
      await this.token.update({name,[`flags.${ID}.spot`]:spot},{simpleFishingConfig:true});await this.close();
      if(!remaining && spot.deleteEmpty) await this.token.delete();
    });
    this.bindButton(root,"fish",()=>openFishing(this.token));
    this.bindButton(root,"delete",async()=>{await this.token.delete();await this.close();});
  }
  async close(options){spotWindows.delete(this.token.uuid);return super.close(options);}
}
function configureSpot(token){
  if(!game.user.isGM) return openFishing(token);
  const existing=spotWindows.get(token.uuid);if(existing){existing.bringToFront();return existing;}
  return new SpotConfig(token).render(true);
}
async function ensureActor(){
  const actor=game.actors.find(a=>a.getFlag?.(ID,"spotActor"));
  if(actor){
    if(Number(actor.ownership?.default ?? 0)<2) await actor.update({"ownership.default":2});
    return actor;
  }
  if(!actorPromise) actorPromise=Actor.create({name:"Fishing Spot",type:"npc",img:ICON,ownership:{default:2},flags:{[ID]:{spotActor:true}},prototypeToken:{name:"Fishing Spot",actorLink:false,texture:{src:ICON},disposition:0,sight:{enabled:false},flags:{[ID]:{spot:spotData({remaining:6})}}}}).finally(()=>{actorPromise=null;});
  return actorPromise;
}
function boardView(){return canvas.app?.canvas || canvas.app?.view || document.getElementById("board");}
function eventPoint(event){
  const view=boardView();if(!view || !canvas.stage) return null;
  const target=event.target;
  // Foundry's interface/HUD can sit over the canvas. Ignore real controls and
  // windows, but accept empty interface overlays at the same board coordinates.
  if(target!==view && target?.closest?.(".window-app,#sidebar,#sidebar-content,#controls,#scene-controls,#hotbar,#players,#navigation,#scene-navigation,button,input,select,textarea,a,[contenteditable=true]")) return null;
  const app=target!==view ? target?.closest?.(".application") : null;
  if(app?.querySelector?.(":scope > .window-header") || app?.matches?.('[role="dialog"]')) return null;
  const rect=view.getBoundingClientRect(),screen=canvas.app.screen || canvas.app.renderer.screen;
  if(!rect.width || !rect.height || event.clientX<rect.left || event.clientY<rect.top || event.clientX>rect.left+rect.width || event.clientY>rect.top+rect.height) return null;
  return canvas.stage.toLocal({x:(event.clientX-rect.left)*screen.width/rect.width,y:(event.clientY-rect.top)*screen.height/rect.height});
}
function fishingInteractive(token,user=game.user){
  return !user.isGM && isSpot(token.document) && !token.document.hidden && token.isVisible!==false && token.visible!==false;
}
function installTokenInteractions(){
  const proto=CONFIG.Token.objectClass.prototype,key=Symbol.for(`${ID}.interactionPatch`);
  if(Object.prototype.hasOwnProperty.call(proto,key)) return;
  Object.defineProperty(proto,key,{value:true});
  for(const method of ["_canControl","_canView","_canHover"]){
    const original=proto[method];
    proto[method]=function(user,...args){
      if(fishingInteractive(this,user ?? game.user)) return true;
      return original?.call(this,user,...args) ?? false;
    };
  }
  // Allow interaction without granting ownership, token movement, or the HUD.
  for(const method of ["_canDrag","_canDragLeftStart","_canHUD","_canConfigure"]){
    const original=proto[method];
    proto[method]=function(user,...args){
      if(!game.user.isGM && isSpot(this.document)) return false;
      return original?.call(this,user,...args) ?? false;
    };
  }
  const click=proto._onClickLeft,doubleClick=proto._onClickLeft2;
  proto._onClickLeft=function(event){
    if(fishingInteractive(this)) return openFishing(this.document);
    return click?.call(this,event);
  };
  proto._onClickLeft2=function(event){
    if(isSpot(this.document)){
      if(game.user.isGM) return configureSpot(this.document);
      if(fishingInteractive(this)) return openFishing(this.document);
    }
    return doubleClick?.call(this,event);
  };
}
async function placeSpot(){
  if(!game.user.isGM || !canvas.ready) return ui.notifications.warn("Open a scene as the GM first.");
  placementCleanup?.();canvas.tokens.activate();
  // Resolve the actor before arming placement; pointer capture is independent of
  // Foundry layer permissions and PIXI event propagation.
  const actor=await ensureActor();
  ui.notifications.info("Click the map to place a fishing spot. Escape cancels.");
  const view=boardView();if(!view) throw Error("The scene canvas is not ready.");
  view.style.cursor="crosshair";
  const cleanup=()=>{document.removeEventListener("pointerdown",click,true);document.removeEventListener("keydown",key);view.style.cursor="";placementCleanup=null;};
  const key=e=>{if(e.key==="Escape") cleanup();};
  const click=async e=>{
    if(e.button!==0) return;
    const point=eventPoint(e);if(!point) return;
    e.preventDefault();e.stopImmediatePropagation();cleanup();
    try{
      const size=canvas.grid.size || 100;
      const data=(await actor.getTokenDocument({x:Math.floor(point.x/size)*size,y:Math.floor(point.y/size)*size})).toObject();
      data.flags ??={};data.flags[ID]={...data.flags[ID],spot:spotData({remaining:6})};
      await canvas.scene.createEmbeddedDocuments("Token",[data]);
      // createToken opens the one fishing-only setup window, also for actor drops.
    }catch(err){notifyError(err);}
  };
  placementCleanup=cleanup;document.addEventListener("pointerdown",click,true);document.addEventListener("keydown",key);
}
function tokenAt(point){
  return [...(canvas.tokens?.placeables ?? [])].reverse().find(t=>isSpot(t.document) && !t.document.hidden && t.isVisible!==false && t.visible!==false && (t.bounds?.contains(point.x,point.y) ?? false));
}
function installPlayerClicks(){
  removePlayerClicks?.();
  const listenerTarget=globalThis.window ?? document;
  // DOM capture reaches the board even when the active Foundry layer stops PIXI events.
  // Normal observer permissions remain on the actor for native token interaction.
  let down;
  const onDown=e=>{
    if(game.user.isGM || e.button!==0 || placementCleanup) return;
    const point=eventPoint(e),token=point && tokenAt(point);if(!token) return;
    down={id:token.id,x:e.clientX,y:e.clientY};e.preventDefault();e.stopImmediatePropagation();
  };
  const onUp=e=>{
    if(!down || game.user.isGM || e.button!==0) return;
    const previous=down;down=null;
    const point=eventPoint(e),token=point && tokenAt(point);
    if(!token || token.id!==previous.id || Math.hypot(e.clientX-previous.x,e.clientY-previous.y)>6) return;
    e.preventDefault();e.stopImmediatePropagation();openFishing(token.document);
  };
  listenerTarget.addEventListener("pointerdown",onDown,true);listenerTarget.addEventListener("pointerup",onUp,true);
  const tear=()=>{listenerTarget.removeEventListener("pointerdown",onDown,true);listenerTarget.removeEventListener("pointerup",onUp,true);placementCleanup?.();Hooks.off("canvasTearDown",tear);if(removePlayerClicks===tear) removePlayerClicks=null;};
  removePlayerClicks=tear;Hooks.on("canvasTearDown",tear);
}
async function migrateSceneTiles(){
  if(!isHost() || !canvas.scene?.tiles) return;
  const tiles=[...canvas.scene.tiles].filter(t=>getSpot(t)?.enabled);if(!tiles.length) return;
  const actor=await ensureActor(),scene=canvas.scene;let count=0;
  for(const tile of tiles){
    const source=tile.uuid;
    let token=scene.tokens.find(t=>t.getFlag(ID,"sourceTile")===source);
    if(!token){
      const size=scene.grid.size || 100;
      const x=tile.object?.bounds?.x ?? tile.x-(tile.anchorX ?? 0.5)*tile.width;
      const y=tile.object?.bounds?.y ?? tile.y-(tile.anchorY ?? 0.5)*tile.height;
      const data=(await actor.getTokenDocument({x,y,name:spotName(tile),hidden:tile.hidden})).toObject();
      data.flags ??={};data.flags[ID]={spot:spotData(getSpot(tile)),sourceTile:source};
      [token]=await scene.createEmbeddedDocuments("Token",[data],{simpleFishingMigration:true});
    }
    await tile.delete();count++;
  }
  if(count) ui.notifications.info(`Converted ${count} fishing spot${count===1 ? "" : "s"} to actor tokens.`);
}
Hooks.once("init",()=>{
  installTokenInteractions();
  game.settings.register(ID,"uiVersion",{scope:"world",config:false,type:Number,default:0});
  game.settings.register(ID,"rewards",{scope:"world",config:false,type:Object,default:{common:[],uncommon:[],rare:[]}});
  game.settings.register(ID,"gmApproval",{scope:"world",config:false,type:Boolean,default:false});
  game.settings.registerMenu(ID,"rewards",{name:"Fishing Rewards",label:"Fishing Rewards",hint:"Drag Items or RollTables into common, uncommon, and rare lists.",icon:"fas fa-fish",type:FishingSettings,restricted:true});
});
Hooks.once("setup",installTokenInteractions);
Hooks.once("ready",()=>{
  if(isHost() && game.settings.get(ID,"uiVersion")<1) void (async()=>{await game.settings.set(ID,"gmApproval",false);await game.settings.set(ID,"uiVersion",1);})().catch(notifyError);
  game.modules.get(ID).api={placeSpot,configure:doc=>configureSpot(doc.document ?? doc),fish:doc=>openFishing(doc.document ?? doc),settings:()=>new FishingSettings().render(true)};
  installTokenInteractions();installPlayerClicks();
  setInterval(()=>{if(!isHost()) return;void enqueue(async()=>{
    for(const s of [...sessions.values()]) if(Date.now()-(s.started || s.created)>(s.state==="pending" ? 180000 : 45000) || !game.users.get(s.userId)?.active){
      await cancelSession(s,s.state==="pending" ? "The cast expired. No bait was spent." : "The cast expired.");await s.app?.close();
    }
  });},5000);
});
Hooks.on("getSceneControlButtons",controls=>{
  if(!controls.tokens?.tools) return;
  controls.tokens.tools.simpleFishing={name:"simpleFishing",title:"Add Fishing Spot",icon:"fas fa-fish",order:Object.keys(controls.tokens.tools).length,button:true,visible:game.user.isGM,onChange:()=>{void placeSpot().catch(notifyError);}};
});
Hooks.on("canvasReady",()=>{installPlayerClicks();void migrateSceneTiles().catch(notifyError);});
Hooks.on("createToken",(token,options,userId)=>{
  if(!game.user.isGM || game.user.id!==userId || !isSpot(token) || options.simpleFishingMigration) return;
  void (async()=>{if(!getSpot(token)) await token.setFlag(ID,"spot",spotData({remaining:6}));await configureSpot(token);})().catch(notifyError);
});
Hooks.on("deleteToken",doc=>{
  const fishing=windows.get(doc.uuid);if(fishing){fishing.spotGone=true;void fishing.render(true).catch(notifyError);}
  const win=spotWindows.get(doc.uuid);if(win) void win.close();
  if(!isHost() || !isSpot(doc)) return;
  void enqueue(async()=>{for(const s of [...sessions.values()]) if(s.token.uuid===doc.uuid){await cancelSession(s,"This fishing spot was removed.");await s.app?.close();}});
});
Hooks.on("preUpdateToken",(doc,change)=>{
  if(!isSpot(doc)) return;
  const n=foundry.utils.getProperty(change,`flags.${ID}.spot.remaining`) ?? change[`flags.${ID}.spot.remaining`];
  if(n!==undefined && (!Number.isInteger(Number(n)) || Number(n)<0 || Number(n)>99999)){ui.notifications.warn("Catches remaining must be a whole number from 0 to 99999.");return false;}
});
Hooks.on("updateToken",(doc,change,options,userId)=>{
  if(!game.user.isGM || game.user.id!==userId || !isSpot(doc) || options.simpleFishingConfig) return;
  if(getSpot(doc)?.deleteEmpty && Number(getSpot(doc).remaining)===0 && ![...sessions.values()].some(s=>s.token.uuid===doc.uuid)) void doc.delete().catch(notifyError);
});
Hooks.on("createChatMessage",message=>{
  const request=message.getFlag(ID,"request"),data=message.getFlag(ID,"reply");
  if(request && isHost()) void enqueue(()=>handleRequest(message));
  if(!data || !message.author?.isGM || data.to!==game.user.id) return;
  const win=windows.get(data.spot) || [...windows.values()].find(w=>w.session===data.id);
  if(data.kind==="waiting" && win){win.session=data.id;win.status="Waiting for the GM…";void win.render(true);}
  if(data.kind==="start"){
    if(win) void win.begin(data).catch(notifyError);
    else void fromUuid(data.spot).then(async spot=>{if(spot) await new FishingWindow(spot).begin(data);}).catch(notifyError);
  }
  if(data.kind==="end" || data.kind==="error"){
    const text=plainText(message.content);if(win) void win.result(text).catch(notifyError);
    else if(data.kind==="error") ui.notifications.warn(text);else ui.notifications.info(text);
  }
});
