// Adapts the sourced level-11 roster to the Desktop simulation's units and effects.
import { COLLECTION_SOURCE } from './collection-source.js';

export const number = (v, fallback = 0) => Number.parseFloat(String(v ?? '').replace(/,/g, '').replace(/^[^\d.-]+/, '')) || fallback;
const stats = (r, name, hidden = false) => r.tables[name + (hidden ? ' hidden stats' : ' stats')] || [];
const flight = new Set(['minion-giant','minions','minion-horde','bats','mega-minion','baby-dragon','electro-dragon','inferno-dragon','skeleton-dragons','flying-machine','balloon','skeleton-barrel','lava-hound','phoenix','spirit-empress']);
const model = {
  'fire-spirit':'sparkwisp','ice-spirit':'sparkwisp','heal-spirit':'sparkwisp','berserker':'barbarian',
  'firecracker':'scout','goblin-gang':'goblin','rascals':'colossus','royal-recruits':'prismguard',
  'ice-golem':'podstrider','suspicious-bush':'goblin','dart-goblin':'speargoblin','elixir-golem':'podstrider',
  'battle-ram':'ramhorn','bomb-tower':'bombard','cannon':'sentry','flying-machine':'zephyr','furnace':'wizard',
  'goblin-cage':'nest','goblin-demolisher':'slingtoad','minion-giant':'zephyr','zappies':'sentry',
  'inferno-tower':'sentry','royal-hogs':'ramhorn','barbarian-hut':'nest','three-musketeers':'longshot',
  'wall-breakers':'slingtoad','dark-prince':'gyrolancer','goblin-drill':'drillworm','hunter':'longshot',
  'rune-giant':'colossus','bowler':'colossus','cannon-cart':'royalgiant','goblin-giant':'colossus',
  'x-bow':'bombard','electro-giant':'colossus','pekka':'breaker','fisherman':'drillworm',
  'princess':'scout','royal-ghost':'warden','electro-wizard':'wizard','lumberjack':'barbarian',
  'magic-archer':'scout','mother-witch':'gearwright','night-witch':'gearwright','phoenix':'stormray',
  'goblin-machine':'titan','ram-rider':'ramhorn','ronin':'warden','sparky':'sentry',
  'spirit-empress':'stormray','lava-hound':'stormray','skeleton-barrel':'thunderhead','skeleton-dragons':'stormray',
  'little-prince':'longshot','golden-knight':'warden','mighty-miner':'drillworm','skeleton-king':'boilerback',
  'archer-queen':'scout','goblinstein':'wizard','monk':'bloomtender','boss-bandit':'shardlynx','tombstone':'nest',
};

function unitFrom(r, name, group, hidden, makeUnit, kind = 'unit') {
  const s = group.stats, h = hidden?.stats || {};
  const dmg = number(s.Damage ?? s['Area damage'] ?? s['Ranged damage'] ?? s['Damage (stage 1)']);
  const range = number(h['Exact range (tiles)'], number(s['Range (tiles)'], {Short:.5,Medium:1.2,Long:1.6}[s['Range (melee)']] || 1));
  const u = makeUnit({name,level:11,kind,hp:number(s.Hitpoints,1),dmg,shield:number(s['Shield hitpoints']),
    hitSpeed:number(s['Hit speed'],1),windup:number(h['First hit speed'],.3),range,
    minRange:number(s['Minimum range (tiles)']),sight:Math.max(range,number(h['Sight range (tiles)'],5.5)),
    speed:kind === 'unit' ? number(h['Exact speed'],{Slow:45,Medium:60,Fast:90,'Very Fast':120}[s.Speed] || 60)/60 : 0,
    radius:number(h['Collision radius (tiles)'],kind === 'unit' ? .5 : .9),mass:number(h.Mass,kind==='unit'?6:1000),
    targets:s.Targets?.includes('Air')?'both':s.Targets==='Buildings'?'buildings':'ground',
    splash:s['Area damage']?number(h['Splash radius (tiles)'],1.2):0,
    flying:flight.has(r.slug),lifetime:number(s.Lifetime),deployTime:number(s['Deploy time'],number(h['Deploy time'],1)),
    projectile:range>=2.5?'bolt':null,projSpeed:number(h['Projectile speed'],600)/60,
    model:model[r.slug] || 'warden', sourceStats:s,
  });
  u.range = Math.max(u.range, u.radius + .15);
  if (s['Crown Tower damage'] && dmg) u.towerDmgMult=number(s['Crown Tower damage'])/dmg;
  if (s['Stun duration'] || s['Freeze duration']) u.onHit={stun:number(s['Stun duration'] || s['Freeze duration'])};
  if (s['Charge damage']) u.charge={dist:3,speedMult:2,dmgMult:number(s['Charge damage'])/dmg};
  if (s['Dash damage']) u.pounce={min:3.5,max:6,speed:12,dmgMult:number(s['Dash damage'])/dmg};
  if (s['Damage (stage 1)']) u.ramp={times:[2,4],mults:[1,number(s['Damage (stage 2)'])/dmg,number(s['Damage (stage 3)'])/dmg]};
  if (s['Death damage']) u.deathBlast={dmg:number(s['Death damage']),radius:2.5,delay:.5,towerMult:1};
  if (s['Elixir for opponent']) u.deathElixir=number(s['Elixir for opponent']);
  return u;
}

function spellFrom(r, s) {
  const spell={kind:'comet',delay:.5,radius:number(s['Radius (tiles)'],2.5),damage:number(s.Damage??s['Area damage']),crownDamage:number(s['Crown Tower damage']),towerMult:0};
  switch(r.slug){
    case 'giant-snowball': return {...spell,knockback:1.5,slow:{pct:number(s.Slow)/100,dur:number(s['Slow duration'])}};
    case 'earthquake': return {...spell,kind:'blight',dps:number(s['Damage per second']),crownDps:number(s['Crown Tower damage per second']),buildingDps:number(s['Building damage per second']),duration:3,tick:1,groundOnly:true,slow:.5};
    case 'goblin-curse': return {...spell,kind:'blight',dps:35,crownDps:10,duration:6,tick:1,slow:.15,curse:'goblin'};
    case 'clone': return {...spell,kind:'clone'};
    case 'mirror': return {...spell,kind:'mirror'};
    case 'graveyard': return {...spell,kind:'graveyard',unit:'mite',count:12,duration:9};
    case 'vines': return {...spell,kind:'vines',dps:number(s['Damage per second']),crownDps:number(s['Crown Tower damage per second']),duration:2,count:3};
    case 'void': return {...spell,kind:'void',damageStages:[696,307,153],crownStages:[97,51,35],waves:3,waveGap:1.5};
    case 'royal-delivery': return {...spell,delay:3,unit:'royal-recruits',count:1,ownSide:true};
    case 'barbarian-barrel': return {...spell,kind:'rockslide',length:4.5,halfWidth:1.3,speed:8,unit:'barbarian',count:1,knockback:0};
    case 'rocket': return {...spell,delay:1.5};
    default:return spell;
  }
}

export function expandCollection(baseUnits, baseCards, makeUnit, legacyArt) {
  const units={...baseUnits}, cards=baseCards.map(c=>({...c,family:legacyArt[c.id],variant:'base'})), towers=[];
  const legacy=new Map(cards.map(c=>[c.family,c]));
  const bySlug=new Map(COLLECTION_SOURCE.map(r=>[r.slug,r]));
  const childIds={Skeleton:'mite',Goblin:'goblin','Spear Goblin':'speargoblin',Barbarian:'barbarian',Bat:'bat','Fire Spirit':'fire-spirit','Royal Recruit':'royal-recruits'};
  for(const r of COLLECTION_SOURCE){
    const groups=stats(r,r.name), s=groups[0]?.stats||{};
    const type=r.pills[1]==='Tower Troop'?'tower':r.slug==='heal-spirit'||r.slug==='furnace'?'troop':r.pills[1]?.toLowerCase();
    if(legacy.has(r.slug))continue;
    const c={id:r.slug,name:r.name,family:r.slug,variant:'base',cost:number(r.pills[2],r.slug==='mirror'?1:0),type,rarity:r.pills[0].toLowerCase(),count:number(s.Count,1),unit:null,spell:null,tags:[],level:11,desc:'',reference:r.source};
    if(type==='spell')c.spell=spellFrom(r,s);
    else{
      c.unit=c.id;
      units[c.id]=unitFrom(r,r.name,groups[0],stats(r,r.name,true)[0],makeUnit,type==='tower'?'tower':type==='building'?'building':'unit');
      if(type==='tower') {units[c.id]={...baseUnits.spire,...units[c.id],model:'spire',height:baseUnits.spire.height};towers.push(c);continue;}
    }
    cards.push(c);
  }
  // Child bodies have their own tables, rather than accidentally borrowing parent HP.
  for(const r of COLLECTION_SOURCE){
    const c=cards.find(c=>c.family===r.slug&&c.variant==='base');
    const groups=stats(r,r.name), hidden=stats(r,r.name,true);
    for(const [i,g] of groups.entries()){
      if(i===0||g.name==='Ability'||!g.stats.Hitpoints)continue;
      const id=childIds[g.name] || `${r.slug}--${g.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;
      childIds[g.name]=id;
      if(!units[id]) units[id]=unitFrom({...r,slug:g.name==='Bat'?'bats':g.name==='Lava Pup'?'baby-dragon':r.slug},g.name,g,hidden.find(h=>h.name===g.name),makeUnit);
    }
    if(!c||!c.unit||legacy.has(r.slug))continue;
    const u=units[c.unit], s=groups[0]?.stats||{};
    const children=groups.slice(1).filter(g=>g.stats.Hitpoints&&g.name!=='Ability');
    if(s['Spawn speed']&&children[0])u.spawn={unit:childIds[children[0].name],count:number(s['Spawn count'],1),interval:number(s['Spawn speed']),first:1};
    const death=Object.keys(s).find(k=>k.startsWith('Death spawn'));
    if(death&&children[0])u.deathSpawn={unit:childIds[children[0].name],count:number(s[death],1)};
    if(['goblin-gang','rascals','goblinstein'].includes(r.slug)){
      c.count=number(s.Count,1);c.groups=children.map(g=>({unit:childIds[g.name],count:number(g.stats.Count,1)}));
    }
    if(r.slug==='goblin-gang')c.count=3;
    if(['fire-spirit','ice-spirit','heal-spirit','wall-breakers','battle-ram'].includes(r.slug)){u.kamikaze=true;u.projectile=null;}
    if(r.slug==='heal-spirit')u.heal={amount:401,radius:2.5,interval:999,onAttack:true};
    if(r.slug==='skeleton-barrel'){u.dmg=0;u.contactDeath=true;u.deathSpawn={unit:'mite',count:7};}
    if(r.slug==='suspicious-bush'){u.contactDeath=true;u.stealth=true;u.deathSpawn={unit:childIds['Bush Goblin'],count:2};units[childIds['Bush Goblin']].dmg=256;}
    if(r.slug==='elixir-golem'){const m=units[childIds['Elixir Golemite']];m.deathSpawn={unit:childIds['Elixir Blob'],count:2};}
    if(r.slug==='goblin-giant'){u.deathSpawn={unit:'speargoblin',count:2};u.secondary={dmg:81,count:2,range:5,interval:1.6,targets:'both'};}
    if(r.slug==='goblin-machine')u.secondary={dmg:304,range:5,minRange:2.5,interval:5,splash:1.5,targets:'both'};
    if(r.slug==='ram-rider')u.secondary={dmg:104,range:5.5,interval:1.1,targets:'both',onHit:{slow:{pct:.7,dur:2}},troopsOnly:true};
    if(r.slug==='electro-wizard'){u.chain={count:2,range:5};u.landing={dmg:192,radius:2.5,targets:'both'};}
    if(r.slug==='electro-giant')u.reflect={dmg:192,crown:97,range:3,stun:.5};
    if(r.slug==='dark-prince')u.splash=1.2;
    if(r.slug==='fisherman')u.hook={min:3.5,max:7,cooldown:4};
    if(r.slug==='royal-ghost'){u.stealth=true;u.leap=true;}
    if(r.slug==='mother-witch')u.curse=childIds['Cursed Hog'];
    if(r.slug==='lumberjack')u.deathSpell={kind:'overclock',damage:179,crownDamage:46,duration:5.5,radius:3,haste:.3};
    if(r.slug==='phoenix'){const egg=units[childIds['Phoenix Egg']];egg.speed=0;egg.flying=false;egg.model='aetherwell';egg.hatch={unit:'phoenix-reborn',time:3.8};units['phoenix-reborn']={...u,deathSpawn:null,hp:Math.round(u.hp*.8),dmg:Math.round(u.dmg*.8)};}
    if(r.slug==='goblin-drill'){u.deployAnywhere=true;u.tunnelSpeed=0;u.landing={dmg:84,radius:1.5};u.dmg=0;}
    if(r.slug==='cannon-cart')u.transform={threshold:.5,kind:'building',speed:0,lifetime:30};
    if(r.slug==='goblin-demolisher')u.transform={threshold:.5,targets:'buildings',speed:2,range:.5,dmg:0,kamikaze:true,contactDeath:true};
    if(r.slug==='rune-giant')u.enchant={damage:220,count:2,range:7};
    if(r.slug==='ronin')u.parry=3.5;
    if(r.slug==='hunter')u.shotgun=10;
    if(r.slug==='firecracker'){u.shotgun=5;u.recoil=1;u.splash=1.5;}
    if(r.slug==='magic-archer'||r.slug==='bowler'){u.pierce=number(s['Projectile range (tiles)']);u.onHit=r.slug==='bowler'?{knockback:1}:null;}
    if(r.slug==='monk')u.thirdHit=422;
    if(r.slug==='little-prince')u.ramp={times:[1.2,2.4],mults:[1,1.5,3]};
    if(r.slug==='mighty-miner')u.ramp={times:[2,4],mults:[1,4,409/43]};
    if(r.slug==='spirit-empress'){const ground=groups.find(g=>g.name==='Ground Form');units['spirit-empress-ground']=unitFrom({...r,slug:'ground'},'Spirit Empress',ground,hidden.find(h=>h.name==='Ground Form'),makeUnit);units['spirit-empress-ground'].model='bloomtender';c.dualForm={cost:6,unit:c.unit,ground:'spirit-empress-ground'};}
  }
  for(const [id,def] of Object.entries({
    'ability-guardian':{name:'Guardian',hp:1600,dmg:232,hitSpeed:1.2,model:'warden'},
    'ability-tombstone-giant':{name:'Skeleton Giant',hp:4224,dmg:422,hitSpeed:2.1,targets:'buildings',model:'boilerback'},
    'ability-turret':{name:'Musketeer Turret',kind:'building',hp:1536,dmg:148,hitSpeed:.5,range:4,sight:4,speed:0,lifetime:10,targets:'both',model:'sentry'},
    'ability-mount':{name:'Dark Prince Mount',hp:1356,dmg:179,hitSpeed:1.6,targets:'buildings',charge:{dist:3,speedMult:2,dmgMult:2},model:'ramhorn'},
    'ability-skeletrooper':{name:'Skeletrooper',hp:473,dmg:204,hitSpeed:1.1,speed:2,towerDmgMult:.1,model:'mite'},
    'ability-decoy':{name:'Magic Archer Decoy',hp:271,dmg:0,lifetime:7,model:'scout'},
  })) units[id]=makeUnit({level:11,...def});
  // Every selected Evolution cycles through its regular card before the evolved deployment.
  for(const r of COLLECTION_SOURCE){
    const base=cards.find(c=>c.family===r.slug&&c.variant==='base');
    if(!base)continue;
    for(const [title,notes] of Object.entries(r.sections)){
      const variant=title.endsWith('Evolution')?'evolution':'hero';
      const id=`${r.slug}-${variant}`, groups=stats(r,title), s=groups[0]?.stats||{};
      const c={...base,id,name:title,variant,baseId:base.id,cycles:variant==='evolution'?number(notes[0].match(/(\d+) Evolution/)?.[1],2):0};
      if(base.unit){
        c.unit=id;units[id]={...units[base.unit],...unitFrom(r,title,{stats:{...stats(r,r.name)[0]?.stats,...s}},stats(r,title,true)[0],makeUnit,units[base.unit].kind),model:units[base.unit].model||base.unit};
        // Preserve special mechanics from the base while applying the variant's table values.
        for(const key of ['spawn','deathSpawn','deathBlast','deathSpell','heal','landing','charge','pounce','chain','ramp','onHit','kamikaze','deployAnywhere','tunnelSpeed','leap','returnHit','secondary','contactDeath','stealth','reflect','pierce','shotgun','recoil','curse']){
          if(units[base.unit][key])units[id][key]=structuredClone(units[base.unit][key]);
        }
        const u=units[id];u.variant=variant;u.family=r.slug;
        const changes=Object.fromEntries(Object.entries(s).filter(([key,value])=>stats(r,r.name)[0]?.stats[key]!==value));
        u.evolutionStats=variant==='evolution'?changes:null;
        if(variant==='evolution') applyEvolution(u,r.slug,s,groups,units,childIds);
        if(variant==='evolution'&&r.slug==='skeleton-army')c.groups=[{unit:'skeleton-general',count:1}];
      }else c.spell={...base.spell};
      if(variant==='hero'){
        const ability=groups.find(g=>g.name==='Ability')?.stats||{};
        c.ability={...ability,cost:number(ability['Ability cost'],1),family:r.slug};
        if(c.unit)units[c.unit].ability=c.ability;
        if(r.slug==='barbarian-barrel'){units[id]={...units.barbarian,ability:c.ability,model:'barbarian',name:title,variant};c.spell.unit=id;}
      }
      if(variant==='evolution'&&c.spell){c.spell.evolution=r.slug;if(r.slug==='zap')Object.assign(c.spell,{kind:'shardstorm',waves:2,waveGap:1.45,stun:.5});if(r.slug==='giant-snowball')Object.assign(c.spell,{knockback:4,crownDamage:46,slow:{pct:.35,dur:3}});}
      if(r.slug==='mirror')c.desc='Repeats your last card for one extra elixir, at level 11. Evolution-specific stats are not available in the reference yet; this variant currently works like regular Mirror.';
      cards.push(c);
    }
  }
  for(const c of cards){
    const r=bySlug.get(c.family), title=c.variant==='base'?r?.name:c.name;
    c.reference=r?.source;c.referenceStats=stats(r,title);
    const ability=c.ability||stats(r,title).find(g=>g.name==='Ability')?.stats;
    if(c.rarity==='champion'&&ability){c.ability={...ability,cost:number(ability['Ability cost'],1),family:c.family};units[c.unit].ability=c.ability;}
    const u=units[c.unit];
    if(!c.desc)c.desc=c.type==='spell'?spellDescription(c.family):`${c.name}. ${u?.flying?'Flying troop. ':''}${u?.targets==='buildings'?'Targets buildings. ':''}${u?.splash?'Deals area damage. ':''}${u?.spawn?'Produces reinforcements. ':''}${c.ability?'Activate its ability during battle.':''}`;
    if(c.variant==='evolution')c.desc+=` Evolves after ${c.cycles} regular deployment${c.cycles===1?'':'s'}.`;
    if(!c.tags.length)c.tags=c.type==='spell'?['spell','damage']:c.type==='building'?['building','defense']:[u?.targets==='buildings'?'siege':'melee',...(u?.flying?['air']:[]),...(u?.targets==='both'?['anti-air']:[]),...(u?.range>=4?['ranged']:[]),...(c.count>1?['swarm']:[]),...(u?.hp>2000?['tank']:[]),...(u?.splash?['splash']:[])];
  }
  return {units,cards,towers};
}

function applyEvolution(u,slug,s,groups,units,childIds){
  if(s['Damage reduction (not attacking)'])u.movingReduction=number(s['Damage reduction (not attacking)'])/100;
  if(s['Heal per hit'])u.leech={amount:number(s['Heal per hit']),max:u.hp*2};
  if(s['Copies per hit'])u.replicate=number(s['Maximum skeletons']);
  if(s['Rage boost'])u.rageOnHit={boost:number(s['Rage boost'])/100,duration:number(s['Rage duration'],2)};
  if(s['Invincibility duration'])u.spawnInvincible=number(s['Invincibility duration']);
  if(s['Power shot damage'])u.powerShot={damage:number(s['Power shot damage']),min:4.5};
  if(s['Sniper damage'])u.sniper={damage:number(s['Sniper damage']),shots:3,range:13};
  if(s['Heal per kill'])u.healKill={small:168,medium:320,large:606,max:5640};
  if(s['Knockback (tiles)'])u.uppercut={distance:number(s['Knockback (tiles)']),every:number(s['Attacks per uppercut'],1)};
  if(slug==='royal-recruits')u.charge={dist:2,speedMult:2,dmgMult:2};
  if(slug==='battle-ram')u.kamikaze=false;
  if(slug==='furnace')u.spawn={...u.spawn,interval:2.4};
  if(slug==='mortar')u.hitSpawn={unit:'goblin',count:1};
  if(slug==='goblin-cage'){u.dmg=183;u.hitSpeed=.5;u.range=3;u.sight=3;u.hook={min:.5,max:3,cooldown:1};}
  if(slug==='bomber')u.pierce=10;
  if(slug==='ice-spirit')u.onHit={stun:2.2};
  if(slug==='electro-dragon')u.chain={count:12,range:4};
  if(slug==='inferno-dragon')u.ramp={times:[1.6,3.6,19.6],mults:[1,120/35,422/35,844/35]};
  if(slug==='goblin-giant')u.spawn={unit:'goblin',count:1,interval:2.2,first:2.2,below:.5};
  if(slug==='giant')u.lowHealthRage=true;
  if(slug==='hunter')u.net={cooldown:5,duration:3,range:4};
  if(slug==='executioner')u.strongHit={range:2.5,damage:240};
  if(slug==='wizard')u.shieldBlast={dmg:281,radius:3,knockback:3};
  if(slug==='royal-giant')u.attackBlast={damage:81,radius:3,knockback:1};
  if(slug==='valkyrie')u.attackPull={damage:40,radius:5};
  if(slug==='tesla')u.pulse={damage:148,radius:6,interval:4,stun:.5};
  if(slug==='cannon')u.landing={dmg:261,radius:6,knockback:1};
  if(slug==='royal-hogs'){u.flying=true;u.landOnHit={dmg:43,radius:2};}
  if(slug==='skeleton-barrel')u.dropAt={threshold:.75,unit:'mite',count:7};
  if(slug==='skeleton-army'){units['skeleton-general']={...u,name:'Skeleton General',shield:81,hitSpeed:1,range:1.6,model:'prismguard'};}
  if(slug==='princess')u.onHit={slow:{pct:.3,dur:5.5}};
  if(slug==='royal-ghost')u.hitSpawn={unit:'mite',count:2,cooldown:3};
  if(slug==='lumberjack'){units['lumberjack-ghost']={...u,deathSpawn:null,deathSpell:null,lifetime:5.5,invulnerable:true,towerDmgMult:.5,model:'barbarian'};u.deathSpawn={unit:'lumberjack-ghost',count:1};}
  if(slug==='wall-breakers'){units['wall-breaker-runner']={...u,hp:163,dmg:184,deathSpawn:null,model:'slingtoad'};u.deathSpawn={unit:'wall-breaker-runner',count:1};u.dmg=192;}
  if(slug==='dart-goblin')u.hitPoison={dps:64,crownDps:16,duration:1,radius:1.5};
  if(slug==='firecracker')u.hitPoison={dps:51,crownDps:16,duration:3,radius:2.5,slow:.15};
  if(slug==='witch')u.skeletonHeal=153;
  if(slug==='baby-dragon')u.aura={boost:.3,slow:.3,radius:4};
  if(slug==='elite-barbarians')u.secondary={dmg:220,range:4.5,minRange:3,interval:5,targets:'ground'};
  if(slug==='electro-giant')u.weakenPulse={interval:6,radius:6};
  if(slug==='goblin-drill')u.resurface=true;
}

function spellDescription(id){return ({mirror:'Repeats your last played card for one extra elixir. Copied troops remain at level 11.',clone:'Copies friendly troops in the area with one hit point.',graveyard:'Summons Skeletons over nine seconds.',void:'Three strikes deal more damage to smaller groups.',vines:'Roots the three toughest enemies and deals damage over time.',earthquake:'Damages ground enemies, with extra damage to buildings.', 'goblin-curse':'Curses enemies; defeated troops become friendly Goblins.','royal-delivery':'Drops a crate on your side, then deploys a Royal Recruit.','barbarian-barrel':'Rolls through ground enemies and releases a Barbarian.'})[id]||'Cast on the arena to damage enemies.';}
