import assert from 'node:assert/strict';
import test from 'node:test';
import {caught,positionAt,spotData,escapeHTML,characterDifficulty,hasFishingTackle,isFishingTackle} from '../scripts/core.mjs';
test('fish movement, hit detection, and sanitized spot defaults',()=>{
  assert.equal(positionAt(0,2000),0);assert.equal(positionAt(500,2000),.5);assert.equal(positionAt(1000,2000),1);assert.equal(positionAt(1500,2000),.5);
  const g={period:2000,phase:0,zone:.3,width:.2};assert.equal(caught(400,g),true);assert.equal(caught(100,g),false);assert.equal(caught(15001,g),false);assert.equal(caught(NaN,g),false);
  assert.equal(spotData({remaining:-2}).remaining,0);assert.equal(spotData({remaining:4.9}).remaining,4);assert.equal(spotData({tier:'other'}).tier,'common');assert.equal(spotData().tables,undefined);
  assert.equal(escapeHTML('<img>'),'&lt;img&gt;');
});

test('character stats, bait penalties, tier difficulty and tackle recognition',()=>{
  const actor=(dex,wis)=>({system:{abilities:{dex:{value:dex},wis:{value:wis}}}});
  const average=actor(10,10),dexterous=actor(18,10),wise=actor(10,18),low=actor(6,6);
  assert.equal(characterDifficulty(average,'common',true).width,.30);
  assert.equal(characterDifficulty(average,'common',false).width,.30*.65);
  assert.ok(characterDifficulty(dexterous,'common',true).period>characterDifficulty(average,'common',true).period);
  assert.equal(characterDifficulty(dexterous,'common',true).width,.30,'DEX only controls speed');
  assert.ok(characterDifficulty(wise,'common',true).width>characterDifficulty(average,'common',true).width);
  assert.equal(characterDifficulty(wise,'common',true).period,2400,'WIS only controls width');
  assert.ok(characterDifficulty(low,'common',true).period<2400);assert.ok(characterDifficulty(low,'common',true).width<.30);
  const widths=['common','uncommon','rare'].map(t=>characterDifficulty(wise,t,true).width);assert.ok(widths[0]>widths[1] && widths[1]>widths[2]);
  const extreme=characterDifficulty(actor(1,1),'rare',false);assert.ok(extreme.width>=.05 && extreme.period>=650);
  assert.ok(isFishingTackle({name:'Fishing Tackle (2024)'}));assert.ok(isFishingTackle({name:'My Kit',system:{identifier:'fishing-tackle'}}));
  assert.equal(isFishingTackle({name:'Block and Tackle'}),false);
  assert.equal(hasFishingTackle({items:new Map([['kit',{name:'Fishing Tackle',system:{quantity:0}}]])}),false);
});

test('actor controls, player clicks, optional bait, configured rewards, GM custom catches and authoritative stock',async()=>{
  globalThis.cancelAnimationFrame=()=>{};
  globalThis.document={addEventListener:()=>{},removeEventListener:()=>{}};
  const hooks=new Map(),once=new Map(),settings=new Map(),docs=new Map(),replies=[],apps=[];
  const gm={id:'gm',isGM:true,active:true},player={id:'player',isGM:false,active:true,viewedScene:'scene'},other={id:'other',isGM:false,active:true,viewedScene:'scene'};
  globalThis.Hooks={on:(n,f)=>hooks.set(n,f),once:(n,f)=>once.set(n,f),off:()=>{}};
  class ApplicationV2{get state(){return 2;}constructor(){apps.push(this);}async render(){return this;}async close(){}bringToFront(){}}
  globalThis.foundry={applications:{api:{ApplicationV2}},utils:{randomID:()=>crypto.randomUUID(),deepClone:structuredClone,getProperty:(o,path)=>path.split('.').reduce((a,k)=>a?.[k],o)}};
  const users=[gm,player,other];users.activeGM=gm;users.get=id=>users.find(u=>u.id===id);
  globalThis.game={user:gm,users,actors:[],settings:{register:(id,k,d)=>settings.set(k,structuredClone(d.default)),registerMenu:()=>{},get:(id,k)=>settings.get(k),set:async(id,k,v)=>settings.set(k,v)},modules:new Map([['simple-fishing',{}]]),system:{id:'dnd5e'},packs:new Map(),collections:new Map()};
  let biteRollTotal=10;const biteMessages=[];
  foundry.dice={Roll:class{constructor(formula){assert.equal(formula,'1d20');}async evaluate(){this.total=biteRollTotal;return this;}async toMessage(data){biteMessages.push(data);}}};
  const errors=[];globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:e=>errors.push(e)}};
  globalThis.CONFIG={Token:{objectClass:class{_onClickLeft(){return 'normal-click';}_onClickLeft2(){return 'normal-double';}_canControl(){return false;}_canView(){return false;}_canHover(){return false;}_canDrag(){return true;}_canHUD(){return true;}_canConfigure(){return true;}}}};
  globalThis.canvas={tokens:{controlled:[]}};
  globalThis.fromUuid=async uuid=>docs.get(uuid);
  globalThis.ChatMessage={getSpeaker:({actor})=>({actor:actor.uuid}),create:async data=>{const message={content:data.content,author:gm,getFlag:(id,k)=>data.flags?.[id]?.[k],delete:async()=>{}};if(data.flags?.['simple-fishing']?.reply)replies.push(data.flags['simple-fishing'].reply);hooks.get('createChatMessage')?.(message);return message;}};
  const nativeInterval=globalThis.setInterval;globalThis.setInterval=()=>{};
  await import('../scripts/main.js');once.get('init')();
  const nativeClickBeforeDraw=CONFIG.Token.objectClass.prototype._onClickLeft;
  assert.ok(CONFIG.Token.objectClass.prototype._canControl);
  once.get('ready')();globalThis.setInterval=nativeInterval;
  assert.equal(settings.get('gmApproval'),false);assert.deepEqual(settings.get('rewards'),{common:[],uncommon:[],rare:[]});assert.equal(settings.has('commonTable'),false);
  const controls={tokens:{tools:{select:{}}}};hooks.get('getSceneControlButtons')(controls);assert.equal(controls.tokens.tools.simpleFishing.title,'Add Fishing Spot');assert.equal(controls.tokens.tools.simpleFishing.button,true);
  // Reward settings contain only drop lists, save drops, reject duplicates, and remove entries.
  await game.modules.get('simple-fishing').api.settings();
  const rewardUI=apps.findLast(a=>a.constructor.name==='FishingSettings');
  assert.doesNotMatch(rewardUI.html(),/<select/);
  const drops=new Map(),removals=new Map();
  const boxes=['common','uncommon','rare'].map(t=>({dataset:{tier:t},classList:{add:()=>{},remove:()=>{}},addEventListener:(event,fn)=>drops.set(`${t}:${event}`,fn)}));
  const removeButton={dataset:{remove:'common:0'},addEventListener:(event,fn)=>removals.set(event,fn)};
  const settingRoot={querySelectorAll:selector=>selector==='[data-tier]'?boxes:[removeButton],querySelector:()=>({addEventListener:()=>{}})};
  rewardUI.bind(settingRoot);
  docs.set('Item.testDrop',{uuid:'Item.testDrop',documentName:'Item',name:'Dropped Fish',img:'fish.svg'});
  const event={preventDefault:()=>{},dataTransfer:{getData:()=>JSON.stringify({uuid:'Item.testDrop'})}};
  await drops.get('common:drop')(event);await drops.get('common:drop')(event);
  assert.equal(settings.get('rewards').common.length,1);assert.match(rewardUI.html(),/Dropped Fish/);
  await removals.get('click')();assert.equal(settings.get('rewards').common.length,0);
  let inventory=[],counter=0;
  const actor={uuid:'Actor.hero',name:'Hero',type:'character',system:{abilities:{dex:{value:10,mod:0},wis:{value:10,mod:0}}},items:new Map([['tackle',{id:'tackle',name:'Fishing Tackle',type:'loot',system:{quantity:1,identifier:'fishing-tackle'}}]]),testUserPermission:user=>user.id==='player',
    createEmbeddedDocuments:async(type,items)=>items.map(item=>{const value={...structuredClone(item),id:`item${++counter}`};inventory.push(value);return value;}),
    deleteEmbeddedDocuments:async(type,ids)=>{inventory=inventory.filter(i=>!ids.includes(i.id));}};docs.set(actor.uuid,actor);
  const bait=(q)=>({id:'bait',name:'Boot',system:{quantity:q},delete:async()=>actor.items.delete('bait'),update:async data=>{actor.items.get('bait').system.quantity=data['system.quantity'];}});
  function newSpot(id,remaining=3,deleteEmpty=false){
    const data=spotData({name:'Dock',remaining,deleteEmpty});
    const spot={uuid:`Scene.scene.Token.${id}`,id,documentName:'Token',parent:{id:'scene'},hidden:false,getFlag:()=>data,update:async change=>{if(spot.failUpdate)throw Error('Simulated stock failure');data.remaining=change['flags.simple-fishing.spot.remaining'];},delete:async()=>{spot.deleted=true;docs.delete(spot.uuid);}};docs.set(spot.uuid,spot);return spot;
  }
  const settle=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));};
  const request=async(user,r)=>{hooks.get('createChatMessage')({author:user,getFlag:(id,k)=>k==='request'?r:null,delete:async()=>{}});await settle();};
  const cast=(spot,baitId='')=>request(player,{action:'cast',spot:spot.uuid,actor:actor.uuid,baitId});
  const latest=()=>replies.findLast(r=>r.kind==='start');
  const winning=g=>((g.zone+g.width/2)/2-g.phase+1)%1*g.period;
  const reel=s=>request(player,{action:'reel',session:s.id,elapsed:winning(s.game)});
  const spot=newSpot('one',2,true);actor.items.set('bait',bait(3));
  const quiet=console.error;console.error=()=>{};
  try{
    // Missing tackle blocks even crafted cast requests before rolling/spending bait.
    const tackle=actor.items.get('tackle');actor.items.delete('tackle');
    await cast(spot,'bait');assert.equal(latest(),undefined);assert.equal(biteMessages.length,0);assert.equal(actor.items.get('bait').system.quantity,3);assert.equal(spot.getFlag().remaining,2);
    actor.items.set('tackle',tackle);
    await cast(spot,'tackle');assert.equal(latest(),undefined);assert.equal(actor.items.get('tackle').system.quantity,1);
    // Empty reward lists do not silently award a built-in Fish or spend bait.
    await cast(spot,'bait');assert.equal(actor.items.get('bait').system.quantity,3);assert.equal(inventory.length,0);assert.equal(latest(),undefined);
    const fish={uuid:'Item.fish',name:'Trout',documentName:'Item',toObject:()=>({_id:'original',folder:'f',name:'Trout',type:'loot',system:{quantity:5,container:'old'}})};docs.set(fish.uuid,fish);
    settings.set('rewards',{common:[{uuid:fish.uuid,name:'Trout',type:'Item'}],uncommon:[],rare:[]});
    // No-bait fishing works, success awards the configured item.
    await cast(spot);let s=latest();assert.ok(s);assert.equal(actor.items.get('bait').system.quantity,3);
    await request(other,{action:'reel',session:s.id,elapsed:winning(s.game)});assert.equal(inventory.length,0);
    await reel(s);assert.equal(inventory[0].name,'Trout');assert.equal(inventory[0].system.quantity,1);assert.equal(inventory[0].system.container,null);assert.equal(spot.getFlag().remaining,1);
    await reel(s);assert.equal(inventory.length,1,'duplicate reel is ignored');
    // Invalid or stolen bait never turns into a free no-bait attempt.
    await cast(spot,'missing');assert.equal(latest().id,s.id);
    await request(other,{action:'cast',spot:spot.uuid,actor:actor.uuid,baitId:'bait'});assert.equal(actor.items.get('bait').system.quantity,3);
    await cast(spot,'bait');s=latest();assert.equal(actor.items.get('bait').system.quantity,2);
    await cast(spot,'bait');assert.equal(actor.items.get('bait').system.quantity,2,'one active attempt per spot');
    await request(player,{action:'reel',session:s.id,elapsed:15001});assert.equal(spot.getFlag().remaining,1);
    await cast(spot);await reel(latest());assert.equal(spot.deleted,true);assert.equal(spot.getFlag().remaining,0);
    // A failed bite roll uses one remaining catch without opening the game.
    const biteSpot=newSpot('bite-fail'),beforeNoBite=inventory.length,beforeStarts=replies.filter(r=>r.kind==='start').length;
    biteRollTotal=2;
    await cast(biteSpot,'bait');
    assert.equal(replies.filter(r=>r.kind==='start').length,beforeStarts);
    assert.equal(biteSpot.getFlag().remaining,2);assert.equal(inventory.length,beforeNoBite);assert.equal(actor.items.get('bait').system.quantity,1);
    assert.equal(replies.at(-1).kind,'end');assert.match(biteMessages.at(-1).flavor,/DC 10/);
    await cast(biteSpot);assert.equal(actor.items.get('bait').system.quantity,1,'no-bait failure does not consume inventory');
    biteRollTotal=10;await cast(biteSpot);assert.notEqual(latest().id,s.id,'meeting DC opens game');
    await request(player,{action:'cancel',session:latest().id});biteRollTotal=10;
    // Failed bite depletion honors Delete when empty; zero remains otherwise.
    biteRollTotal=2;
    const exhausted=newSpot('exhausted',1,true);await cast(exhausted);assert.equal(exhausted.getFlag().remaining,0);assert.equal(exhausted.deleted,true);
    const quietSpot=newSpot('quiet',1,false);await cast(quietSpot);assert.equal(quietSpot.getFlag().remaining,0);assert.equal(quietSpot.deleted,undefined);
    // A natural 1 deletes the spot even when automatic deletion is disabled.
    biteRollTotal=1;const frightened=newSpot('frightened',8,false);const startsBeforeCritFail=replies.filter(r=>r.kind==='start').length;
    await cast(frightened);assert.equal(frightened.deleted,true);assert.equal(replies.filter(r=>r.kind==='start').length,startsBeforeCritFail);assert.equal(inventory.length,beforeNoBite);
    // A natural 20 adds one catch before the minigame; success then uses one.
    biteRollTotal=20;const lucky=newSpot('lucky',3,false);await cast(lucky);assert.equal(lucky.getFlag().remaining,4);const luckyStart=latest();
    await cast(lucky);assert.equal(lucky.getFlag().remaining,4,'duplicate cast cannot repeat critical bonus');
    await reel(luckyStart);assert.equal(lucky.getFlag().remaining,3);
    // Missing the timing game retains the critical bonus already earned.
    await cast(lucky);assert.equal(lucky.getFlag().remaining,4);
    await request(player,{action:'reel',session:latest().id,elapsed:15001});assert.equal(lucky.getFlag().remaining,4);
    biteRollTotal=10;
    // Server derives the minigame from the chosen character, not client inputs.
    const statSpot=newSpot('stats',9);actor.system.abilities.dex.mod=4;actor.system.abilities.wis.mod=3;
    await cast(statSpot,'bait');let personalized=latest();assert.equal(personalized.game.period,3360);assert.equal(personalized.game.width,.36);assert.equal(personalized.game.dexMod,4);assert.equal(personalized.game.wisMod,3);
    await request(player,{action:'cancel',session:personalized.id});
    await cast(statSpot);personalized=latest();assert.equal(personalized.game.width,.36*.65);assert.equal(personalized.game.period,3360);
    await request(player,{action:'cancel',session:personalized.id});assert.equal(actor.items.get('tackle').system.quantity,1,'tackle is reusable');
    actor.system.abilities.dex.mod=0;actor.system.abilities.wis.mod=0;
    // Dropped RollTables resolve their Item results.
    const table={uuid:'RollTable.river',name:'River',documentName:'RollTable',roll:async()=>({results:[{documentCollection:'Item',documentId:'fish'}]})};docs.set(table.uuid,table);game.collections.set('Item',new Map([['fish',fish]]));
    settings.set('rewards',{common:[{uuid:table.uuid,name:'River',type:'RollTable'}],uncommon:[],rare:[]});
    const spot2=newSpot('two');await cast(spot2);await reel(latest());assert.equal(inventory.at(-1).name,'Trout');assert.equal(spot2.getFlag().remaining,2);
    // Cancelling by spot works before a session ID has reached the player's window.
    await cast(spot2);await request(player,{action:'cancel',spot:spot2.uuid});const before=inventory.length;await reel(latest());assert.equal(inventory.length,before);
    // Failed stock updates roll back inventory insertion.
    await cast(spot2);s=latest();spot2.failUpdate=true;await reel(s);assert.equal(inventory.length,before);assert.equal(spot2.getFlag().remaining,2);spot2.failUpdate=false;
    // The actor control creates a token via DOM capture and opens a clean setup.
    const listenersDOM=new Map(),view={style:{},getBoundingClientRect:()=>({left:0,top:0,width:1000,height:800})};let placed,activated=0;
    globalThis.document={addEventListener:(n,f)=>listenersDOM.set(n,f),removeEventListener:(n,f)=>{if(listenersDOM.get(n)===f)listenersDOM.delete(n);},getElementById:()=>view};
    const spotActor={ownership:{default:2},getFlag:(id,k)=>k==='spotActor',getTokenDocument:async data=>({toObject:()=>({...data,actorId:'spot-actor',name:'Fishing Spot',flags:{}})})};
    globalThis.Actor={create:async data=>{assert.equal(data.ownership.default,2);game.actors.push(spotActor);return spotActor;}};
    canvas.ready=true;canvas.grid={size:100};canvas.tokens.activate=()=>activated++;
    canvas.app={view,screen:{width:1000,height:800}};canvas.stage={toLocal:p=>({x:p.x+100,y:p.y+50})};
    canvas.scene={createEmbeddedDocuments:async(type,data)=>{
      placed={type,data};const token=newSpot('placed');
      hooks.get('createToken')(token,{},gm.id);return [token];
    }};
    await game.modules.get('simple-fishing').api.placeSpot();
    const stop={preventDefault:()=>{},stopImmediatePropagation:()=>{}};
    await listenersDOM.get('pointerdown')({button:0,target:view,clientX:245,clientY:310,...stop});await settle();
    assert.equal(activated,1);assert.equal(placed.type,'Token');assert.equal(placed.data[0].x,300);assert.equal(placed.data[0].y,300);
    const config=apps.findLast(a=>a.constructor.name==='SpotConfig');assert.ok(config);
    assert.doesNotMatch(config.html(),/overhead|appearance|nexus/i);assert.match(config.html(),/Catches remaining/);
    // Native token callbacks are installed before initial drawing/binding.
    game.user=player;
    const NativeToken=CONFIG.Token.objectClass;
    const nativeSpot=new NativeToken();nativeSpot.document=spot2;nativeSpot.visible=true;nativeSpot.isVisible=true;
    assert.equal(nativeSpot._canControl(player),true);assert.equal(nativeSpot._canView(player),true);
    assert.equal(nativeSpot._canDrag(player),false);assert.equal(nativeSpot._canHUD(player),false);assert.equal(nativeSpot._canConfigure(player),false);
    await nativeClickBeforeDraw.call(nativeSpot,{});await settle();
    const nativeWindow=apps.findLast(a=>a.constructor.name==='FishingWindow');assert.ok(nativeWindow);await nativeWindow.close();
    const normal=new NativeToken();normal.document={getFlag:()=>null};
    assert.equal(normal._onClickLeft({}),'normal-click');assert.equal(normal._canControl(player),false);assert.equal(normal._canDrag(player),true);
    spot2.hidden=true;assert.equal(nativeSpot._canControl(player),false);spot2.hidden=false;
    // Player pointer capture opens a spot even with native PIXI tile events absent.
    game.user=player;canvas.tokens.placeables=[{id:'two',document:spot2,isVisible:true,visible:true,bounds:{contains:(x,y)=>x>=100 && x<=200 && y>=50 && y<=150}}];
    hooks.get('canvasReady')();
    listenersDOM.get('pointerdown')({button:0,target:view,clientX:30,clientY:30,...stop});
    listenersDOM.get('pointerup')({button:0,target:view,clientX:30,clientY:30,...stop});await settle();
    assert.ok(apps.some(a=>a.constructor.name==='FishingWindow'));
    // An empty HUD/interface overlay must not block the same coordinates.
    const direct=apps.findLast(a=>a.constructor.name==='FishingWindow');await direct.close();
    const hudApp={querySelector:()=>null,matches:()=>false};
    const overlay={closest:selector=>selector==='.application' ? hudApp : null};
    listenersDOM.get('pointerdown')({button:0,target:overlay,clientX:30,clientY:30,...stop});
    listenersDOM.get('pointerup')({button:0,target:overlay,clientX:30,clientY:30,...stop});await settle();
    const throughOverlay=apps.findLast(a=>a.constructor.name==='FishingWindow');assert.notEqual(throughOverlay,direct);await throughOverlay.close();
    // Real controls/windows over the spot must not open fishing.
    const beforeBlocked=apps.length,control={closest:()=>({})};
    listenersDOM.get('pointerdown')({button:0,target:control,clientX:30,clientY:30,...stop});
    listenersDOM.get('pointerup')({button:0,target:control,clientX:30,clientY:30,...stop});await settle();assert.equal(apps.length,beforeBlocked);
    game.user=gm;
    // Existing fishing tiles migrate once without opening placement/config windows.
    const legacySpot=spotData({name:'Old Dock',remaining:7,tier:'rare',deleteEmpty:true});let legacyDeleted=0,migrationOptions;
    const legacy={uuid:'Scene.scene.Tile.old',x:200,y:200,width:100,height:100,anchorX:.5,anchorY:.5,hidden:false,getFlag:()=>legacySpot,delete:async()=>{legacyDeleted++;}};
    const migrated=[];canvas.scene={grid:{size:100},tiles:[legacy],tokens:migrated,createEmbeddedDocuments:async(type,data,options)=>{
      migrationOptions=options;const token={getFlag:(id,k)=>data[0].flags[id]?.[k],...data[0]};migrated.push(token);return [token];
    }};
    const configCount=apps.filter(a=>a.constructor.name==='SpotConfig').length;
    hooks.get('canvasReady')();await settle();
    assert.equal(legacyDeleted,1);assert.equal(migrated[0].flags['simple-fishing'].spot.remaining,7);assert.equal(migrated[0].flags['simple-fishing'].spot.tier,'rare');assert.equal(migrationOptions.simpleFishingMigration,true);
    hooks.get('canvasReady')();await settle();assert.equal(migrated.length,1,'migration retries never duplicate actors');
    assert.equal(apps.filter(a=>a.constructor.name==='SpotConfig').length,configCount);
    // Bait, the timing game, and result all share the same FishingWindow instance.
    actor.isOwner=true;game.actors=[actor];
    await game.modules.get('simple-fishing').api.fish(spot2);
    const win=apps.findLast(a=>a.constructor.name==='FishingWindow');assert.ok(win);
    assert.match(win.html(),/Bait/);
    const inputs={actor:{value:actor.uuid,addEventListener:()=>{}},bait:{value:'',innerHTML:''}};
    win.bind({querySelector:selector=>{const name=selector.match(/name=([^\]]+)/)?.[1];return name ? inputs[name] : {addEventListener:()=>{}};}});
    assert.match(inputs.bait.innerHTML,/No bait/);
    await win.begin({id:'ui-session',game:{width:.3,zone:.2,period:2400,phase:0}});assert.match(win.html(),/sf-water/);
    await win.result('Caught a Trout');assert.equal(win.fishingState,'idle');assert.equal(win.state,2);assert.match(win.html(),/Caught a Trout/);await win.close();
    // Optional GM review can create a silly named catch without a reward list.
    actor.items.set('bait',bait(2));
    settings.set('gmApproval',true);settings.set('rewards',{common:[],uncommon:[],rare:[]});
    await cast(spot2,'bait');let approval=apps.findLast(a=>a.constructor.name==='ApprovalWindow');assert.ok(approval);assert.equal(actor.items.get('bait').system.quantity,2);
    await approval.close();await settle();assert.equal(actor.items.get('bait').system.quantity,2);
    await cast(spot2);approval=apps.findLast(a=>a.constructor.name==='ApprovalWindow');
    const listeners=new Map(),fields={catch:{value:'The Other Boot',addEventListener:()=>{}},tier:{value:'rare'}};
    const root={querySelector:selector=>{const name=selector.match(/name=([^\]]+)/)?.[1];if(name)return fields[name];const key=selector.match(/data-sf="([^"]+)/)?.[1];return {addEventListener:(event,fn)=>listeners.set(`${key}:${event}`,fn)};}};
    approval.bind(root);await listeners.get('start:click')({currentTarget:{disabled:false,isConnected:false}});await settle();s=latest();assert.equal(s.game.width,.12*.65);await reel(s);assert.equal(inventory.at(-1).name,'The Other Boot');assert.equal(actor.items.get('bait').system.quantity,2);
  }finally{console.error=quiet;}
});
