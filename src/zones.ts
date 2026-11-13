import type { ZoneDefinition, ZoneId } from './contracts';
export const ZONES: Record<ZoneId, ZoneDefinition> = {
  haven: { id: 'haven', name: '별빛의 거점', subtitle: 'STARFALL SANCTUARY', description: '모든 여정은 작은 빛에서 시작된다.', spawn: { x: 0, z: 7 }, radius: 22, enemies: [], objects: [
    {id:'elder',kind:'npc',label:'별의 기록자 · 엘리아',x:-4,z:1}, {id:'merchant',kind:'shop',label:'떠돌이 상인 · 로엔',x:7,z:3},
    {id:'haven-rest',kind:'rest',label:'별의 샘 · 회복 및 저장',x:0,z:-2}, {id:'haven-forest',kind:'portal',label:'에메랄드 숲으로',x:0,z:-15,target:'forest'},
    {id:'haven-cache',kind:'chest',label:'여행자의 보급품',x:-12,z:7}
  ]},
  forest: { id: 'forest', name: '에메랄드 숲', subtitle: 'THE EMERALD WILDS', description: '오래된 숲 깊이, 첫 번째 별이 숨 쉰다.', spawn:{x:0,z:16},radius:25,enemies:[
    {id:'f1',kind:'stalker',x:-3,z:7},{id:'f2',kind:'stalker',x:5,z:2},{id:'f3',kind:'wisp',x:-7,z:-3},{id:'f4',kind:'charger',x:6,z:-9},{id:'f5',kind:'stalker',x:-3,z:-12}
  ],objects:[{id:'forest-haven',kind:'portal',label:'별빛의 거점으로',x:0,z:21,target:'haven'}, {id:'forest-temple',kind:'portal',label:'고대 별의 신전으로',x:0,z:-21,target:'temple'},
    {id:'forest-shard',kind:'shard',label:'숲의 별 파편',x:0,z:-14}, {id:'forest-cache',kind:'chest',label:'덩굴에 감긴 보물함',x:-17,z:-6}, {id:'forest-rest',kind:'rest',label:'숲의 성소 · 회복 및 저장',x:13,z:12}
  ]},
  temple: { id:'temple',name:'고대 별의 신전',subtitle:'TEMPLE OF THE FIRST LIGHT',description:'해가 뜨고, 별이 길을 열며, 달이 잠든다.',spawn:{x:0,z:17},radius:25,enemies:[
    {id:'t1',kind:'sentinel',x:-6,z:8},{id:'t2',kind:'wisp',x:7,z:4},{id:'t3',kind:'charger',x:-7,z:-7},{id:'t4',kind:'sentinel',x:6,z:-12}
  ],objects:[{id:'temple-forest',kind:'portal',label:'에메랄드 숲으로',x:0,z:22,target:'forest'},{id:'temple-rift',kind:'portal',label:'별의 균열로',x:0,z:-21,target:'rift'},
    {id:'rune-sun',kind:'rune',label:'태양의 석판',x:-12,z:-4,rune:0},{id:'rune-star',kind:'rune',label:'별의 석판',x:0,z:-10,rune:1},{id:'rune-moon',kind:'rune',label:'달의 석판',x:12,z:-4,rune:2},
    {id:'temple-shard',kind:'shard',label:'신전의 별 파편',x:0,z:-15},{id:'temple-cache',kind:'chest',label:'수호자의 유산',x:18,z:6},{id:'temple-rest',kind:'rest',label:'기억의 성소 · 회복 및 저장',x:-12,z:15}
  ]},
  rift: { id:'rift',name:'별의 균열',subtitle:'THE ASTRAL RIFT',description:'마지막 수호자는 누구를 위해 검을 들었는가.',spawn:{x:0,z:17},radius:23,enemies:[
    {id:'b1',kind:'boss',x:0,z:-7}
  ],objects:[{id:'rift-temple',kind:'portal',label:'고대 별의 신전으로',x:0,z:21,target:'temple'},{id:'rift-rest',kind:'rest',label:'마지막 별의 샘',x:-10,z:16}]}
};
