import type { DerivedStats, EnemyKind, GameState, Item, Settings, Slot, ZoneId } from './contracts';
import { ZONES } from './zones';

/** The single item catalogue shared by combat, inventory, rewards, and save validation. */
export const ITEMS: Record<string, Item> = {
  'wanderer-blade': { id: 'wanderer-blade', name: '방랑자의 검', kind: 'weapon', rarity: 'common', style: 'sword', attack: 14, description: '가볍고 균형 잡힌 검. 빠른 세 번의 연격과 근접 광역 베기에 적합하다.' },
  'apprentice-staff': { id: 'apprentice-staff', name: '견습 별술사의 지팡이', kind: 'weapon', rarity: 'common', style: 'staff', attack: 10, mana: 28, description: '별빛 탄환을 발사하는 지팡이. 거리를 유지하며 마법으로 전장을 지배한다.' },
  'traveler-coat': { id: 'traveler-coat', name: '여행자의 외투', kind: 'armor', rarity: 'common', defense: 5, hp: 20, description: '긴 여정을 함께한 외투. 별의 실로 기워 작은 상처를 막아 준다.' },
  dawnblade: { id: 'dawnblade', name: '여명의 서약', kind: 'weapon', rarity: 'rare', style: 'sword', attack: 25, defense: 2, price: 110, description: '새벽빛을 머금은 검. 날카로운 연격과 안정적인 근접전을 위한 무기.' },
  'moonweave-staff': { id: 'moonweave-staff', name: '월광의 가지', kind: 'weapon', rarity: 'rare', style: 'staff', attack: 21, mana: 38, price: 120, description: '달빛으로 엮은 고목의 가지. 마나와 원거리 마법의 위력을 높인다.' },
  'sentinel-mail': { id: 'sentinel-mail', name: '수호자의 흉갑', kind: 'armor', rarity: 'rare', defense: 12, hp: 40, price: 95, description: '신전 수호대가 남긴 흉갑. 생존력을 높여 강한 공격을 버티게 한다.' },
  'star-pendant': { id: 'star-pendant', name: '작은 별의 펜던트', kind: 'charm', rarity: 'rare', attack: 3, mana: 18, price: 80, description: '미약하지만 사라지지 않는 별의 빛. 공격력과 마나를 함께 높인다.' },
  'verdant-charm': { id: 'verdant-charm', name: '숲의 숨결', kind: 'charm', rarity: 'rare', hp: 25, defense: 3, description: '숲 깊은 보물함에 잠들어 있던 부적. 에메랄드빛 생명력을 품었다.' },
  'constellation-staff': { id: 'constellation-staff', name: '별자리의 지휘봉', kind: 'weapon', rarity: 'epic', style: 'staff', attack: 31, mana: 45, description: '신전의 비밀을 지킨 별술사의 유산. 강력한 별빛 마법을 다룬다.' },
  'astral-crown': { id: 'astral-crown', name: '별의 왕관', kind: 'charm', rarity: 'legendary', attack: 12, defense: 8, hp: 50, mana: 35, description: '마지막 수호자가 맡긴 별의 핵. 되찾은 하늘과 새로운 시대의 증표.' },
  'forest-shard': { id: 'forest-shard', name: '숲의 별 파편', kind: 'quest', rarity: 'epic', description: '에메랄드 숲에 떨어진 별의 기억. 고대 신전으로 향하는 길을 연다.' },
  'temple-shard': { id: 'temple-shard', name: '신전의 별 파편', kind: 'quest', rarity: 'epic', description: '태양과 별과 달의 인장을 풀어 되찾은 파편. 별의 균열을 잠재울 열쇠.' },
};

export const SHOP_ITEMS = ['dawnblade', 'moonweave-staff', 'sentinel-mail', 'star-pendant'];
export const POTION_PRICE = 25;
export const MAX_LEVEL = 50;
export const SAVE_KEY = 'astralia-save-v1';
export const SETTINGS_KEY = 'astralia-settings-v1';
export const DEFAULT_SETTINGS: Settings = { music: 0.32, effects: 0.65, ambience: 0.4, quality: 'high', shake: true, sensitivity: 1 };
const ZONE_IDS = Object.keys(ZONES) as ZoneId[];
const SLOTS: Slot[] = ['weapon', 'armor', 'charm'];
const ENEMIES = new Map(ZONE_IDS.flatMap(zone => ZONES[zone].enemies.map(enemy => [enemy.id, { kind: enemy.kind, zone }] as const)));
const CHESTS = new Set(ZONE_IDS.flatMap(zone => ZONES[zone].objects.filter(object => object.kind === 'chest').map(object => object.id)));
const SIDE_QUESTS = ['forest-clear', 'treasure', 'explorer'];
const knownItem = (id: string): Item | undefined => Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Returns an isolated, full-health new character; no storage or global state is mutated. */
export function newGame(): GameState {
  const state: GameState = {
    version: 1,
    player: { level: 1, xp: 0, hp: 140, mana: 70, gold: 70, potions: 5, inventory: ['wanderer-blade', 'apprentice-staff', 'traveler-coat'], equipment: { weapon: 'wanderer-blade', armor: 'traveler-coat', charm: null }, skillPoints: 0, talents: { power: 0, spirit: 0 } },
    quest: { accepted: false, forestKills: 0, forestShard: false, templeShard: false, runes: [], bossDefeated: false, claimed: [] },
    world: { openedChests: [], defeated: [], visited: ['haven'], checkpoint: 'haven' },
    settings: { ...DEFAULT_SETTINGS },
    stats: { kills: 0, deaths: 0, playTime: 0 },
  };
  refill(state);
  return state;
}

/** Every stat displayed by the UI and used by combat is derived here. */
export function calculateStats(state: GameState): DerivedStats {
  const { level, talents, equipment } = state.player;
  const stats: DerivedStats = {
    maxHp: 120 + (level - 1) * 20 + talents.spirit * 5,
    maxMana: 70 + (level - 1) * 8 + talents.spirit * 10,
    attack: 12 + (level - 1) * 3 + talents.power * 3,
    defense: 4 + (level - 1) * 2 + talents.spirit,
    crit: Math.min(0.4, 0.07 + talents.power * 0.01),
    style: 'sword',
  };
  for (const slot of SLOTS) {
    const item = knownItem(equipment[slot] ?? '');
    if (!item || item.kind !== slot) continue;
    stats.maxHp += item.hp ?? 0;
    stats.maxMana += item.mana ?? 0;
    stats.attack += item.attack ?? 0;
    stats.defense += item.defense ?? 0;
    if (item.style) stats.style = item.style;
  }
  return stats;
}

function refill(state: GameState): void {
  const stats = calculateStats(state);
  state.player.hp = stats.maxHp;
  state.player.mana = stats.maxMana;
}

function clampResources(state: GameState): void {
  const stats = calculateStats(state);
  state.player.hp = clamp(state.player.hp, 0, stats.maxHp);
  state.player.mana = clamp(state.player.mana, 0, stats.maxMana);
}

export function xpToNext(level: number): number {
  return 90 + (clamp(Number.isFinite(level) ? Math.floor(level) : 1, 1, MAX_LEVEL) - 1) * 60;
}

/** Adds XP, retaining overflow across multiple levels. Level gains refill HP/MP. */
export function addXp(state: GameState, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0 || state.player.level >= MAX_LEVEL) return 0;
  state.player.xp += Math.min(1_000_000, Math.floor(amount));
  let levels = 0;
  while (state.player.level < MAX_LEVEL && state.player.xp >= xpToNext(state.player.level)) {
    state.player.xp -= xpToNext(state.player.level);
    state.player.level++;
    state.player.skillPoints++;
    levels++;
  }
  if (state.player.level === MAX_LEVEL) state.player.xp = 0;
  if (levels) refill(state);
  return levels;
}

export function addItem(state: GameState, id: string): boolean {
  if (!knownItem(id) || state.player.inventory.includes(id)) return false;
  state.player.inventory.push(id);
  if (id === 'forest-shard') state.quest.forestShard = true;
  if (id === 'temple-shard') state.quest.templeShard = true;
  return true;
}

export function equipItem(state: GameState, id: string): boolean {
  const item = knownItem(id);
  if (!item || item.kind === 'quest' || !state.player.inventory.includes(id) || state.player.equipment[item.kind] === id) return false;
  state.player.equipment[item.kind] = id;
  clampResources(state);
  return true;
}

export function unequipItem(state: GameState, slot: Slot): boolean {
  if (!SLOTS.includes(slot) || !state.player.equipment[slot]) return false;
  state.player.equipment[slot] = null;
  clampResources(state);
  return true;
}

export function discardItem(state: GameState, id: string): boolean {
  const item = knownItem(id);
  if (!item || item.kind === 'quest' || Object.values(state.player.equipment).includes(id)) return false;
  const index = state.player.inventory.indexOf(id);
  if (index === -1) return false;
  state.player.inventory.splice(index, 1);
  return true;
}

export function buyItem(state: GameState, id: string): boolean {
  if (id === 'potion') {
    if (state.player.gold < POTION_PRICE || state.player.potions >= 99) return false;
    state.player.gold -= POTION_PRICE;
    state.player.potions++;
    return true;
  }
  const item = knownItem(id);
  if (!item?.price || !SHOP_ITEMS.includes(id) || state.player.gold < item.price || state.player.inventory.includes(id)) return false;
  if (!addItem(state, id)) return false;
  state.player.gold -= item.price;
  return true;
}

/** Restores 55% maximum HP and 30% maximum mana; full resources do not waste a potion. */
export function usePotion(state: GameState): boolean {
  const stats = calculateStats(state);
  if (state.player.hp <= 0 || state.player.potions <= 0 || (state.player.hp >= stats.maxHp && state.player.mana >= stats.maxMana)) return false;
  state.player.potions--;
  state.player.hp = Math.min(stats.maxHp, state.player.hp + Math.ceil(stats.maxHp * 0.55));
  state.player.mana = Math.min(stats.maxMana, state.player.mana + Math.ceil(stats.maxMana * 0.3));
  return true;
}

export function investTalent(state: GameState, talent: 'power' | 'spirit'): boolean {
  if ((talent !== 'power' && talent !== 'spirit') || state.player.skillPoints <= 0 || state.player.talents[talent] >= 10) return false;
  state.player.skillPoints--;
  state.player.talents[talent]++;
  return true;
}

/** Armor has diminishing returns; guarding reduces post-armor damage to 28%. */
export function damageAmount(attack: number, defense: number, blocking = false): number {
  if (!Number.isFinite(attack) || !Number.isFinite(defense) || attack <= 0) return 0;
  return Math.max(1, Math.round(Math.min(attack, 1_000_000) * 100 / (100 + Math.max(0, defense) * 4) * (blocking ? 0.28 : 1)));
}

export function awardEnemy(state: GameState, id: string, kind: EnemyKind, zone: ZoneId): { xp: number; gold: number; levelUp: number; items: string[] } | null {
  const enemy = ENEMIES.get(id);
  if (!enemy || enemy.kind !== kind || enemy.zone !== zone || state.world.defeated.includes(id)) return null;
  const rewards: Record<EnemyKind, [number, number]> = { stalker: [32, 14], wisp: [46, 20], charger: [60, 28], sentinel: [75, 34], boss: [360, 220] };
  const [xp, gold] = rewards[kind];
  state.world.defeated.push(id);
  state.stats.kills++;
  if (zone === 'forest') state.quest.forestKills++;
  state.player.gold += gold;
  const levelUp = addXp(state, xp);
  const items: string[] = [];
  if (kind === 'boss') {
    state.quest.bossDefeated = true;
    if (addItem(state, 'astral-crown')) items.push('astral-crown');
  }
  return { xp, gold, levelUp, items };
}

export function openChest(state: GameState, id: string): boolean {
  if (!CHESTS.has(id) || state.world.openedChests.includes(id)) return false;
  state.world.openedChests.push(id);
  if (id === 'haven-cache') { state.player.gold += 30; state.player.potions = Math.min(99, state.player.potions + 2); addXp(state, 20); }
  if (id === 'forest-cache') { state.player.gold += 45; addItem(state, 'verdant-charm'); addXp(state, 35); }
  if (id === 'temple-cache') { state.player.gold += 70; addItem(state, 'constellation-staff'); addXp(state, 60); }
  return true;
}

/** Rune IDs follow the environmental clue: sun (0), star (1), moon (2). */
export function activateRune(state: GameState, index: number): 'correct' | 'reset' | 'complete' {
  if (state.quest.runes.length === 3) return 'complete';
  if (!Number.isInteger(index) || index !== state.quest.runes.length) {
    state.quest.runes = [];
    return 'reset';
  }
  state.quest.runes.push(index);
  return state.quest.runes.length === 3 ? 'complete' : 'correct';
}

export function claimSideQuest(state: GameState, id: string): boolean {
  if (state.quest.claimed.includes(id)) return false;
  const eligible = id === 'forest-clear' ? state.quest.forestKills >= 5 : id === 'treasure' ? state.world.openedChests.length >= 3 : id === 'explorer' ? new Set(state.world.visited).size >= 4 : false;
  if (!eligible) return false;
  const reward = id === 'forest-clear' ? [65, 80] : id === 'treasure' ? [70, 100] : [90, 130];
  state.quest.claimed.push(id);
  state.player.gold += reward[1];
  addXp(state, reward[0]);
  return true;
}

export function objective(state: GameState): { title: string; description: string; progress: string } {
  const quest = state.quest;
  if (quest.bossDefeated) return { title: '다시 빛나는 하늘', description: '별의 핵이 복원되었습니다. 돌아온 별빛 아래 여정을 돌아보세요.', progress: '여정 완료' };
  if (!quest.accepted) return { title: '별이 부르는 곳', description: '거점의 별의 기록자 엘리아에게 말을 걸어 여정을 시작하세요.', progress: '엘리아와 대화 · E' };
  if (!quest.forestShard && quest.forestKills < 3) return { title: '숲에 잠든 첫 번째 별', description: '에메랄드 숲의 변이체를 물리치고 북쪽 유적을 조사하세요.', progress: `숲의 변이체 ${Math.min(3, quest.forestKills)} / 3` };
  if (!quest.forestShard) return { title: '되찾은 숲의 기억', description: '숲 북쪽의 고대 유적에서 별 파편을 수집하세요.', progress: '숲의 별 파편 · E' };
  if (!quest.templeShard && quest.runes.length < 3) return { title: '태양, 별, 그리고 달', description: '고대 신전의 석판을 순서대로 깨우세요. 해가 뜨고, 별이 길을 열며, 달이 잠듭니다.', progress: `석판 ${quest.runes.length} / 3` };
  if (!quest.templeShard) return { title: '별의 문을 여는 열쇠', description: '깨어난 제단에서 신전의 별 파편을 수집하세요.', progress: '신전의 별 파편 · E' };
  return { title: '마지막 수호자의 맹세', description: '별의 균열에서 타락한 수호자 아르켄을 쓰러뜨리고 별의 핵을 복원하세요.', progress: '아르켄 처치 · 0 / 1' };
}

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const listOf = (value: unknown, valid: (entry: string) => boolean): value is string[] => Array.isArray(value) && value.length <= 500 && value.every(entry => typeof entry === 'string' && valid(entry));
const dedupe = <T>(values: T[]): T[] => [...new Set(values)];
const int = (value: number, max: number, min = 0): number => clamp(Math.floor(value), min, max);

function validateSettings(value: unknown): Settings {
  const source = isRecord(value) ? value : {};
  return {
    music: isNumber(source.music) ? clamp(source.music, 0, 1) : DEFAULT_SETTINGS.music,
    effects: isNumber(source.effects) ? clamp(source.effects, 0, 1) : DEFAULT_SETTINGS.effects,
    ambience: isNumber(source.ambience) ? clamp(source.ambience, 0, 1) : DEFAULT_SETTINGS.ambience,
    quality: source.quality === 'low' ? 'low' : 'high',
    shake: typeof source.shake === 'boolean' ? source.shake : DEFAULT_SETTINGS.shake,
    sensitivity: isNumber(source.sensitivity) ? clamp(source.sensitivity, 0.3, 2) : DEFAULT_SETTINGS.sensitivity,
  };
}

/** Whitelist fields and IDs, repair harmless inconsistencies, reject malformed structure. */
export function validateSave(value: unknown): GameState | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const { player, quest, world, stats } = value;
  if (!isRecord(player) || !isRecord(quest) || !isRecord(world) || !isRecord(stats) || !isRecord(player.equipment) || !isRecord(player.talents)) return null;
  if (!['level', 'xp', 'hp', 'mana', 'gold', 'potions', 'skillPoints'].every(key => isNumber(player[key])) || !isNumber(player.talents.power) || !isNumber(player.talents.spirit)) return null;
  if (!['kills', 'deaths', 'playTime'].every(key => isNumber(stats[key])) || !isNumber(quest.forestKills)) return null;
  if (!['accepted', 'forestShard', 'templeShard', 'bossDefeated'].every(key => typeof quest[key] === 'boolean')) return null;
  if (!listOf(player.inventory, id => !!knownItem(id)) || !listOf(quest.claimed, id => SIDE_QUESTS.includes(id))) return null;
  if (!listOf(world.openedChests, id => CHESTS.has(id)) || !listOf(world.defeated, id => ENEMIES.has(id)) || !listOf(world.visited, id => ZONE_IDS.includes(id as ZoneId)) || !ZONE_IDS.includes(world.checkpoint as ZoneId)) return null;
  if (!Array.isArray(quest.runes) || quest.runes.length > 3 || quest.runes.some((index, order) => index !== order)) return null;
  const inventory = dedupe(player.inventory);
  const equipment: Record<Slot, string | null> = { weapon: null, armor: null, charm: null };
  for (const slot of SLOTS) {
    const id = player.equipment[slot];
    if (id !== null && (typeof id !== 'string' || !inventory.includes(id) || knownItem(id)?.kind !== slot)) return null;
    equipment[slot] = id as string | null;
  }
  const level = int(player.level as number, MAX_LEVEL, 1);
  const power = int(player.talents.power, 10);
  const spirit = int(player.talents.spirit, 10);
  if (power + spirit > level - 1) return null;
  const defeated = dedupe(world.defeated);
  // Completion is permanent: a partially written record must not resurrect a rewarded boss.
  if (quest.bossDefeated === true && !defeated.includes('b1')) defeated.push('b1');
  const forestKills = Math.max(int(quest.forestKills, 5), defeated.filter(id => ENEMIES.get(id)?.zone === 'forest').length);
  const forestShard = quest.forestShard === true || inventory.includes('forest-shard');
  const templeShard = quest.templeShard === true || inventory.includes('temple-shard');
  // A shard flag and its protected quest item represent the same persistent fact.
  if (forestShard && !inventory.includes('forest-shard')) inventory.push('forest-shard');
  if (templeShard && !inventory.includes('temple-shard')) inventory.push('temple-shard');
  const checkpoint = world.checkpoint as ZoneId;
  const state: GameState = {
    version: 1,
    player: { level, xp: level === MAX_LEVEL ? 0 : int(player.xp as number, xpToNext(level) - 1), hp: Math.max(0, player.hp as number), mana: Math.max(0, player.mana as number), gold: int(player.gold as number, 9_999_999), potions: int(player.potions as number, 99), inventory, equipment, skillPoints: int(player.skillPoints as number, level - 1 - power - spirit), talents: { power, spirit } },
    quest: { accepted: quest.accepted as boolean, forestKills, forestShard, templeShard, runes: templeShard ? [0, 1, 2] : [...quest.runes] as number[], bossDefeated: quest.bossDefeated === true || defeated.includes('b1'), claimed: dedupe(quest.claimed) },
    world: { openedChests: dedupe(world.openedChests), defeated, visited: dedupe(['haven', ...world.visited, checkpoint]) as ZoneId[], checkpoint },
    settings: validateSettings(value.settings),
    stats: { kills: Math.max(int(stats.kills as number, 1_000_000), defeated.length), deaths: int(stats.deaths as number, 1_000_000), playTime: clamp(stats.playTime as number, 0, 315_360_000) },
  };
  clampResources(state);
  return state;
}

function storageOrDefault(storage?: Storage): Storage | null {
  try { return storage ?? (typeof localStorage !== 'undefined' ? localStorage : null); } catch { return null; }
}

export function saveGame(state: GameState, storage?: Storage): boolean {
  try {
    const target = storageOrDefault(storage);
    const valid = validateSave(state);
    if (!target || !valid) return false;
    target.setItem(SAVE_KEY, JSON.stringify(valid));
    return true;
  } catch { return false; }
}

export function loadGame(storage?: Storage): GameState | null {
  try {
    const target = storageOrDefault(storage);
    const raw = target?.getItem(SAVE_KEY);
    if (!raw || raw.length > 200_000) return null;
    const state = validateSave(JSON.parse(raw));
    if (state && target?.getItem(SETTINGS_KEY)) state.settings = loadSettings(target);
    return state;
  } catch { return null; }
}

export function hasSave(storage?: Storage): boolean { return loadGame(storage) !== null; }

/** Reset progress only. Audio/accessibility preferences have an independent lifetime. */
export function resetSave(storage?: Storage): boolean {
  try {
    const target = storageOrDefault(storage);
    if (!target) return false;
    target.removeItem(SAVE_KEY);
    return true;
  } catch { return false; }
}

export function saveSettings(settings: Settings, storage?: Storage): boolean {
  try {
    const target = storageOrDefault(storage);
    if (!target) return false;
    target.setItem(SETTINGS_KEY, JSON.stringify(validateSettings(settings)));
    return true;
  } catch { return false; }
}

export function loadSettings(storage?: Storage): Settings {
  try {
    const raw = storageOrDefault(storage)?.getItem(SETTINGS_KEY);
    return validateSettings(raw && raw.length < 10_000 ? JSON.parse(raw) : null);
  } catch { return { ...DEFAULT_SETTINGS }; }
}
