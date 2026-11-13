export type ZoneId = 'haven' | 'forest' | 'temple' | 'rift';
export type WeaponStyle = 'sword' | 'staff';
export type EnemyKind = 'stalker' | 'wisp' | 'charger' | 'sentinel' | 'boss';
export type Slot = 'weapon' | 'armor' | 'charm';
export interface Vec2 { x: number; z: number }
export interface Settings { music: number; ambience: number; effects: number; quality: 'low' | 'high'; shake: boolean; sensitivity: number }
export interface GameState {
  version: 1;
  player: { level: number; xp: number; hp: number; mana: number; gold: number; potions: number; inventory: string[]; equipment: Record<Slot, string | null>; skillPoints: number; talents: { power: number; spirit: number } };
  quest: { accepted: boolean; forestKills: number; forestShard: boolean; templeShard: boolean; runes: number[]; bossDefeated: boolean; claimed: string[] };
  world: { openedChests: string[]; defeated: string[]; visited: ZoneId[]; checkpoint: ZoneId };
  settings: Settings;
  stats: { kills: number; deaths: number; playTime: number };
}
export interface Item { id: string; name: string; kind: Slot | 'quest'; rarity: 'common' | 'rare' | 'epic' | 'legendary'; description: string; attack?: number; defense?: number; hp?: number; mana?: number; style?: WeaponStyle; price?: number }
export interface DerivedStats { maxHp: number; maxMana: number; attack: number; defense: number; crit: number; style: WeaponStyle }
export interface EnemySpawn extends Vec2 { id: string; kind: EnemyKind }
export interface WorldObject extends Vec2 { id: string; kind: 'npc' | 'shop' | 'portal' | 'chest' | 'shard' | 'rune' | 'rest'; label: string; target?: ZoneId; rune?: number }
export interface ZoneDefinition { id: ZoneId; name: string; subtitle: string; description: string; spawn: Vec2; radius: number; enemies: EnemySpawn[]; objects: WorldObject[] }
export type Screen = 'title' | 'play' | 'pause' | 'inventory' | 'quests' | 'settings' | 'dialogue' | 'shop' | 'death' | 'ending';
export interface EnemyView extends Vec2 { id: string; kind: EnemyKind; hp: number; maxHp: number; screenX?: number; screenY?: number }
export interface UiSnapshot {
  screen: Screen; state: GameState; stats: DerivedStats; zone: ZoneId; zoneName: string;
  objective: { title: string; description: string; progress: string };
  player: Vec2; heading: number; enemies: EnemyView[]; objects: WorldObject[];
  interact: string | null; cooldowns: { q: number; r: number; dash: number; guard: number }; blocking: boolean;
  notice: string; noticeId: number; saveAvailable: boolean; tutorial: string; dialogue: string;
  boss: { hp: number; maxHp: number; phase: number; warning: string } | null;
  locationBanner: number; elapsed: number;
}
export type UiAction = 'new' | 'continue' | 'resume' | 'pause' | 'title' | 'inventory' | 'quests' | 'settings' | 'shop' | 'close' | 'accept' | 'claim' | 'equip' | 'unequip' | 'discard' | 'sort' | 'potion' | 'buy' | 'talent' | 'retry' | 'save' | 'setting' | 'fullscreen' | 'restart-boss';
export type UiHandler = (action: UiAction, value?: string) => void;
