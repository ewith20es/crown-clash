// Additional card mechanics share the Desktop world's damage, movement and event paths.
import { UNITS } from '../data/cards.js';
import { number as n } from '../data/collection.js';
import { resolveSpell } from './spells.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const enemies=(w,e,r)=>w.entities.filter(v=>v.alive&&v.team!==e.team&&distance(e,v)-v.radius<=r);
function cast(w,e,spell,x=e.x,z=e.z){const p={kind:spell.kind,team:e.team,x,z,cardId:e.cardId,spell,wave:0,timeLeft:0};if(!resolveSpell(w,p))w.pending.push(p);}
function burst(w,e,damage,radius,extra={}){cast(w,e,{kind:'comet',damage,crownDamage:extra.crownDamage??damage,radius,...extra});}
function spawn(w,e,type,count=1){return w._spawnGroup(type,e.team,e.x,e.z,count,.4,e.cardId);}

export function abilityList(w,team){
  const groups=new Set();
  return w.entities.filter(e=>{const key=e.cardId+':'+e.bornAt;if(!e.alive||e.team!==team||!e.def.ability||e.state==='deploy'||groups.has(key))return false;groups.add(key);return true;}).map(e=>{
    const a=e.def.ability,charges=n(a['Ability charges'],1),used=e.abilityUsed||0,cooldown=Math.max(0,(e.abilityAt||0)-w.time);
    return {id:e.id,name:e.def.name,cost:a.cost,remaining:charges-used,cooldown,ready:used<charges&&cooldown===0&&w.players[team].aether>=a.cost};
  });
}

export function activateAbility(w,team,id){
  const e=w.getEntity(id), status=abilityList(w,team).find(a=>a.id===id);
  if(w.phase==='ended'||!e||!status?.ready||e.frozen>0||e.stunned>0)return false;
  const a=e.def.ability, family=a.family;
  w.players[team].aether-=a.cost;w.stats[team].aetherSpent+=a.cost;
  for(const member of w.entities.filter(v=>v.team===e.team&&v.cardId===e.cardId&&v.bornAt===e.bornAt)){member.abilityUsed=(member.abilityUsed||0)+1;member.abilityAt=w.time+n(a['Ability cooldown']);}
  const duration=n(a.Duration??a['Ability duration']??a['Invisibility duration'],3.5);
  const target=enemies(w,e,15).sort((v,t)=>distance(e,v)-distance(e,t))[0];
  const buff=(patch,time=duration)=>{e._buffBase=e.def;e._buffUntil=w.time+time;e.def={...e.def,...patch};};
  switch(family){
    case 'archer-queen': e.invisibleUntil=w.time+duration;e.hastePct=1.8;e.hasteT=duration;break;
    case 'skeleton-king': spawn(w,e,'mite',Math.min(16,6+(e.souls||0)));break;
    case 'little-prince': {const g=w.addEntity('ability-guardian',team,e.x,e.z-1,{deployTime:.4});g.cardId=e.cardId;burst(w,g,320,2);break;}
    case 'golden-knight': {let from=e;const hit=new Set();for(let i=0;i<10;i++){const v=enemies(w,from,5).filter(v=>!v.flying&&!hit.has(v.id)).sort((a,b)=>distance(from,a)-distance(from,b))[0];if(!v)break;hit.add(v.id);w._damage(v,335,team,e.type);from=v;e.x=v.x;e.z=v.z;}break;}
    case 'mighty-miner':burst(w,e,332,3);e.x=-e.x;break;
    case 'boss-bandit':e.x=Math.max(-8,Math.min(8,e.x+(e.x>0?-6:6)));e.invisibleUntil=w.time+1;break;
    case 'monk':e.protectUntil=w.time+4;e.protect=.65;e.reflectProjectiles=true;break;
    case 'goblinstein':cast(w,e,{kind:'blight',dps:188,crownDps:46,duration:3.5,tick:.5,radius:4,slow:0});break;
    case 'knight':e.shield+=512;e.maxShield=Math.max(e.maxShield,e.shield);for(const v of enemies(w,e,6.5)){v.tauntId=e.id;v.tauntUntil=w.time+4;v.targetId=e.id;}break;
    case 'goblins':spawn(w,e,'goblin',2);break;
    case 'ice-golem':cast(w,e,{kind:'shardstorm',damage:69,crownDamage:5,waves:3,waveGap:.7,radius:4,slow:{pct:.3,dur:2}});break;
    case 'mega-minion':if(target){e.returnPosition={x:e.x,z:e.z,at:w.time+3.5};e.x=target.x;e.z=target.z;w._damage(target,422,team,e.type);}break;
    case 'tombstone':spawn(w,e,'ability-tombstone-giant');break;
    case 'mini-pekka':e.hp=Math.min(e.maxHp,e.hp+(e.maxHp-e.hp)*.3);buff({dmg:Math.round(e.def.dmg*1.1),hp:e.def.hp*1.1},22);break;
    case 'musketeer':spawn(w,e,'ability-turret');burst(w,e,204,2,{knockback:1});break;
    case 'valkyrie':cast(w,e,{kind:'blight',dps:388,crownDps:192,duration:3.5,tick:.5,radius:2.5});e.protectUntil=w.time+3.5;e.protect=.15;break;
    case 'giant': {const v=enemies(w,e,2.5).find(v=>v.kind==='unit'&&!v.flying);if(v){w._damage(v,135,team,e.type);w._stun(v,2);w._knockback(v,0,team===0?-1:1,9,team);}break;}
    case 'wizard':burst(w,e,43,4);buff({flying:true,dmg:261,speed:e.def.speed*1.5});e.flying=true;e.y=2;break;
    case 'barbarian-barrel':e.hp+=(e.maxHp-e.hp)*.5;cast(w,e,{kind:'rockslide',damage:215,crownDamage:108,length:3,halfWidth:1.3,speed:8});break;
    case 'dark-prince':burst(w,e,307,3,{crownDamage:0,knockback:1.5});spawn(w,e,'ability-mount');break;
    case 'balloon':burst(w,e,230,2,{crownDamage:25});spawn(w,e,'ability-skeletrooper');break;
    case 'bowler':buff({dmg:384,hitSpeed:1.9,range:11.5,sight:11.5,pierce:11.5,towerDmgMult:.5},7.3);break;
    case 'ice-wizard':cast(w,e,{kind:'stasis',damage:46,crownDamage:38,duration:5,radius:2.5});break;
    case 'electro-wizard':buff({dmg:128,towerDmgMult:.5});e.hastePct=2.6;e.hasteT=3;break;
    case 'magic-archer':{const d=w.addEntity('ability-decoy',team,e.x,e.z);d.cardId=e.cardId;e.x=Math.max(-8,Math.min(8,e.x+(e.x>0?-3.5:3.5)));buff({dmg:46,shotgun:3,pierce:13.5},7);break;}
    case 'berserker':buff({dmg:167,hitSpeed:.2,speed:2,towerDmgMult:.25});e.immortalUntil=w.time+3.5;break;
  }
  w._emit({type:'landing',id:e.id,team,x:e.x,z:e.z,radius:3});
  return true;
}

export function updateExtra(w,e,dt){
  const u=e.def;
  if(e._buffUntil&&w.time>=e._buffUntil){e.def=e._buffBase;e.flying=!!e.def.flying;e._buffUntil=0;}
  if(e.returnPosition&&w.time>=e.returnPosition.at){Object.assign(e,{x:e.returnPosition.x,z:e.returnPosition.z});e.returnPosition=null;}
  if(e.invisibleUntil&&w.time>=e.invisibleUntil)e.invisibleUntil=0;
  if(e.state==='deploy'||e.frozen>0||e.stunned>0)return;
  if(u.stealth)e.invisibleUntil=e.attackT>=0||e.state==='attack'?0:w.time+.1;
  if(u.hatch){e.hatchT=(e.hatchT||0)+dt;if(e.hatchT>=u.hatch.time){spawn(w,e,u.hatch.unit);e.def={...u,deathSpawn:null,deathBlast:null};w._kill(e);return;}}
  if(u.contactDeath&&enemies(w,e,1).some(v=>v.kind!=='unit')){w._kill(e);return;}
  if(u.transform&&!e.transformed&&e.hp/e.maxHp<=u.transform.threshold){e.def={...u,...u.transform};e.kind=e.def.kind;e.transformed=true;e.lifeMax=e.def.lifetime;e.lifeLeft=e.def.lifetime;}
  if(u.dropAt&&!e.dropped&&e.hp/e.maxHp<=u.dropAt.threshold){spawn(w,e,u.dropAt.unit,u.dropAt.count);e.dropped=true;}
  if(u.resurface){const stage=e.hp/e.maxHp<.33?2:e.hp/e.maxHp<.66?1:0;if(stage>(e.resurfaces||0)){e.resurfaces=stage;spawn(w,e,'goblin',stage===1?2:1);e.x=Math.max(-8,Math.min(8,e.x+(stage===1?2:-4)));}}
  if(u.lowHealthRage&&e.hp<e.maxHp*.5){e.hastePct=.3;e.hasteT=.2;}
  if(u.aura){for(const v of w.entities){if(!v.alive||distance(e,v)>u.aura.radius)continue;if(v.team===e.team){v.hastePct=u.aura.boost;v.hasteT=.2;}else w._slow(v,u.aura.slow,.2);}}
  if(u.enchant){const allies=w.entities.filter(v=>v.alive&&v.team===e.team&&v.kind==='unit'&&v.id!==e.id&&distance(e,v)<=u.enchant.range).sort((a,b)=>b.hp-a.hp).slice(0,u.enchant.count);for(const v of allies){v.enchantUntil=w.time+.2;v.enchantDamage=u.enchant.damage;}}
  if(u.hook||u.net){e.hookAt=e.hookAt||0;if(w.time>=e.hookAt){const h=u.hook||u.net;const t=enemies(w,e,h.max||h.range).find(t=>t.kind==='unit'&&!t.flying&&distance(e,t)>=(h.min||0));if(t){if(u.hook)w._pull(t,e.x,e.z,distance(e,t)-1);else w._freeze(t,h.duration);e.hookAt=w.time+h.cooldown;}}}
  if(u.secondary){e.secondaryT=(e.secondaryT||0)-dt;if(e.secondaryT<=0){const s=u.secondary,t=enemies(w,e,s.range).find(v=>(!s.minRange||distance(e,v)>=s.minRange)&&(!s.troopsOnly||v.kind==='unit')&&(s.targets==='both'||!v.flying));if(t){for(let i=0;i<(s.count||1);i++)w._hitOne({...u,...s,towerDmgMult:1},e.team,t,s.dmg,e.x,e.z,e.type);e.secondaryT=s.interval;}}}
  if(u.pulse||u.weakenPulse){const p=u.pulse||u.weakenPulse;e.pulseT=(e.pulseT||0)+dt;if(e.pulseT>=p.interval){e.pulseT=0;for(const v of enemies(w,e,p.radius)){if(u.weakenPulse&&v.kind==='unit')v.def={...v.def,dmg:Math.round(v.def.dmg/1.1)};else{w._damage(v,p.damage,e.team,e.type);w._stun(v,p.stun);}}}}
  if(e.type==='dagger-duchess'){e.ammo??=8;e.reload=(e.reload||0)+dt;if(e.reload>=.9){e.ammo=Math.min(8,e.ammo+1);e.reload=0;}if(e.ammo<1)e.cooldown=Math.max(e.cooldown,.1);}
  if(e.type==='royal-chef'){e.cook=(e.cook||0)+dt;if(e.cook>=33){const v=w.entities.filter(v=>v.alive&&v.team===e.team&&v.kind==='unit'&&v.hp/v.maxHp>.33).sort((a,b)=>b.hp-a.hp)[0];if(v){v.def={...v.def,dmg:Math.round(v.def.dmg*1.1)};v.hp=Math.round(v.hp*1.1);v.maxHp=Math.round(v.maxHp*1.1);e.cook=0;}}}
}

export function beforeAttack(w,e,t,damage){
  const u=e.def;e.attacks=(e.attacks||0)+1;
  if(u.contactDeath){w._kill(e);return {handled:true,damage:0};}
  if(e.type==='dagger-duchess')e.ammo=Math.max(0,(e.ammo??8)-1);
  if(u.powerShot&&distance(e,t)>=u.powerShot.min)damage=u.powerShot.damage;
  if(u.sniper&&e.attacks<=u.sniper.shots)damage=u.sniper.damage;
  if(u.strongHit&&distance(e,t)<=u.strongHit.range)damage=u.strongHit.damage;
  if(u.thirdHit&&e.attacks%3===0){damage=u.thirdHit;w._knockback(t,t.x-e.x,t.z-e.z,1.5,e.team);}
  if(u.uppercut&&e.attacks%u.uppercut.every===0)w._knockback(t,t.x-e.x,t.z-e.z,u.uppercut.distance,e.team);
  if(u.leech)e.hp=Math.min(u.leech.max,e.hp+u.leech.amount);
  if(u.rageOnHit){e.hastePct=u.rageOnHit.boost;e.hasteT=u.rageOnHit.duration;}
  if(u.replicate&&w.entities.filter(v=>v.alive&&v.team===e.team&&v.type===e.type).length<u.replicate)spawn(w,e,e.type);
  if(u.hitSpawn&&w.time>=(e.hitSpawnAt||0)){w._spawnGroup(u.hitSpawn.unit,e.team,t.x,t.z,u.hitSpawn.count,.5,e.cardId);e.hitSpawnAt=w.time+(u.hitSpawn.cooldown||0);}
  if(u.attackBlast)burst(w,e,u.attackBlast.damage,u.attackBlast.radius,{knockback:u.attackBlast.knockback,crownDamage:0});
  if(u.attackPull){for(const v of enemies(w,e,u.attackPull.radius)){w._pull(v,e.x,e.z,1);w._damage(v,v.kind==='tower'?12:u.attackPull.damage,e.team,e.type);}}
  if(u.hitPoison)cast(w,e,{kind:'blight',tick:.5,...u.hitPoison},t.x,t.z);
  if(u.recoil)w._knockback(e,e.x-t.x,e.z-t.z,u.recoil,e.team);
  if(e.enchantUntil>w.time&&e.attacks%3===0)damage+=e.enchantDamage;
  if(u.shotgun)damage*=Math.max(1,Math.round(u.shotgun*(1-Math.min(.9,distance(e,t)/7))));
  if(u.pierce){const dx=t.x-e.x,dz=t.z-e.z,len=Math.hypot(dx,dz)||1;for(const v of enemies(w,e,u.pierce)){const along=((v.x-e.x)*dx+(v.z-e.z)*dz)/len,side=Math.abs((v.x-e.x)*dz-(v.z-e.z)*dx)/len;if(along>=0&&side<=.5+v.radius&&(u.targets==='both'||!v.flying))w._hitOne(u,e.team,v,damage,e.x,e.z,e.type);}return {handled:true,damage};}
  return {handled:false,damage};
}

export function afterHit(w,def,team,v,sourceType,fromX,fromZ){
  const source=w.entities.find(e=>e.alive&&e.team===team&&e.type===sourceType&&Math.hypot(e.x-fromX,e.z-fromZ)<1.5);
  if(def.curse&&v.kind==='unit'){v.cursedBy=team;v.curseUnit=def.curse;v.curseUntil=w.time+5;}
  if(!v.alive&&source&&def.healKill){const h=def.healKill;source.hp=Math.min(h.max,source.hp+(v.maxHp<990?h.small:v.maxHp<1990?h.medium:h.large));}
  if(v.def.reflect&&source&&distance(source,v)<=v.def.reflect.range){const r=v.def.reflect;w._damage(source,source.kind==='tower'?r.crown:r.dmg,v.team,v.type);w._stun(source,r.stun);}
  if(source&&v.reflectProjectiles&&v.protectUntil>w.time&&def.projectile)w._damage(source,def.dmg,v.team,v.type);
}

export function extraDeath(w,e){
  if(e.def.deathElixir)w.players[1-e.team].aether=Math.min(10,w.players[1-e.team].aether+e.def.deathElixir);
  if(e.def.deathSpell)w.pending.push({kind:e.def.deathSpell.kind,team:e.team,x:e.x,z:e.z,cardId:e.cardId,spell:e.def.deathSpell,wave:0,timeLeft:0});
  if(e.curseUntil>=w.time&&e.curseUnit)w._spawnGroup(e.curseUnit,e.cursedBy,e.x,e.z,1,.5,null);
  for(const v of w.entities){if(v.def.ability?.family==='skeleton-king')v.souls=(v.souls||0)+1;if(v.team===e.team&&v.def.skeletonHeal&&e.def.name.includes('Skeleton'))v.hp=Math.min(1451,v.hp+v.def.skeletonHeal);}
}

export function damageMultiplier(w,e){
  if(e.def.invulnerable||e.def.spawnInvincible&&w.time-e.bornAt<e.def.spawnInvincible)return 0;
  if(e.def.parry&&w.time>=(e.parryAt||0)){e.parryAt=w.time+e.def.parry;return 0;}
  if(e.protectUntil>w.time)return 1-e.protect;
  if(e.def.movingReduction&&e.state!=='attack'&&e.attackT<0)return 1-e.def.movingReduction;
  return 1;
}
