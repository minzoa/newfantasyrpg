import { describe, expect, it } from 'vitest';
import type { GameState, Settings, Slot } from './contracts';
import { ZONES } from './zones';
import { DEFAULT_SETTINGS, ITEMS, MAX_LEVEL, POTION_PRICE, SAVE_KEY, SETTINGS_KEY, activateRune, addItem, addXp, awardEnemy, buyItem, calculateStats, claimSideQuest, damageAmount, discardItem, equipItem, hasSave, investTalent, loadGame, loadSettings, newGame, objective, openChest, resetSave, saveGame, saveSettings, unequipItem, usePotion, validateSave, xpToNext } from './domain';

class MemoryStorage implements Storage {
  private entries = new Map<string, string>();
  get length(): number { return this.entries.size; }
  clear(): void { this.entries.clear(); }
  getItem(key: string): string | null { return this.entries.get(key) ?? null; }
  key(index: number): string | null { return [...this.entries.keys()][index] ?? null; }
  removeItem(key: string): void { this.entries.delete(key); }
  setItem(key: string, value: string): void { this.entries.set(key, value); }
}

function clearForest(state: GameState): void {
  for (const enemy of ZONES.forest.enemies) awardEnemy(state, enemy.id, enemy.kind, 'forest');
}

describe('combat and character growth', () => {
  it('creates independent state with the promised starting equipment and resources', () => {
    const state = newGame();
    expect(state.player).toMatchObject({ gold: 70, potions: 5, level: 1, hp: 140, mana: 70 });
    expect(calculateStats(state)).toMatchObject({ maxHp: 140, maxMana: 70, attack: 26, defense: 9, style: 'sword' });
    state.player.inventory.pop();
    state.settings.music = 0;
    expect(newGame().player.inventory).toHaveLength(3);
    expect(newGame().settings.music).toBe(DEFAULT_SETTINGS.music);
  });

  it('applies armor before guarding, never heals from a hit, and rejects nonfinite damage', () => {
    expect(damageAmount(100, 0)).toBe(100);
    expect(damageAmount(100, 25)).toBe(50);
    expect(damageAmount(100, 25, true)).toBe(14);
    expect(damageAmount(1, 100_000, true)).toBe(1);
    expect(damageAmount(0, 10)).toBe(0);
    expect(damageAmount(-20, 10)).toBe(0);
    expect(damageAmount(20, -10)).toBe(20);
    expect(damageAmount(Number.NaN, 10)).toBe(0);
    expect(damageAmount(10, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('retains XP overflow over multiple level-ups and refills the new resource limits', () => {
    const state = newGame();
    state.player.hp = 5;
    state.player.mana = 1;
    expect(addXp(state, xpToNext(1) + xpToNext(2) + 17)).toBe(2);
    expect(state.player).toMatchObject({ level: 3, xp: 17, skillPoints: 2 });
    expect(state.player.hp).toBe(calculateStats(state).maxHp);
    expect(state.player.mana).toBe(calculateStats(state).maxMana);
    expect(addXp(state, Number.NaN)).toBe(0);
    expect(addXp(state, -50)).toBe(0);
    expect(state.player.xp).toBe(17);
  });

  it('caps maximum level and prevents additional or fractional XP from creating progress', () => {
    const state = newGame();
    expect(addXp(state, 0.9)).toBe(0);
    expect(state.player.xp).toBe(0);
    expect(addXp(state, 1_000_000)).toBe(MAX_LEVEL - 1);
    expect(state.player.level).toBe(MAX_LEVEL);
    expect(state.player.xp).toBe(0);
    expect(addXp(state, 100)).toBe(0);
  });

  it('makes talent choices affect combat and respects available points and maximum rank', () => {
    const state = newGame();
    expect(investTalent(state, 'power')).toBe(false);
    addXp(state, 240);
    const initial = calculateStats(state);
    expect(investTalent(state, 'power')).toBe(true);
    expect(investTalent(state, 'spirit')).toBe(true);
    expect(investTalent(state, 'power')).toBe(false);
    expect(calculateStats(state)).toMatchObject({ attack: initial.attack + 3, maxMana: initial.maxMana + 10, defense: initial.defense + 1, maxHp: initial.maxHp + 5 });
    state.player.skillPoints = 30;
    for (let i = 0; i < 9; i++) expect(investTalent(state, 'power')).toBe(true);
    expect(investTalent(state, 'power')).toBe(false);
    expect(investTalent(state, 'constructor' as 'power')).toBe(false);
  });
});

describe('inventory and economy', () => {
  it('switches weapon style and actual stats, and clamps resources without granting free healing', () => {
    const state = newGame();
    const sword = calculateStats(state);
    expect(equipItem(state, 'apprentice-staff')).toBe(true);
    const staff = calculateStats(state);
    expect(staff.style).toBe('staff');
    expect(staff.attack).toBeLessThan(sword.attack);
    expect(staff.maxMana).toBeGreaterThan(sword.maxMana);
    expect(state.player.mana).toBe(70);
    state.player.mana = staff.maxMana;
    expect(equipItem(state, 'wanderer-blade')).toBe(true);
    expect(state.player.mana).toBe(sword.maxMana);
    expect(unequipItem(state, 'armor')).toBe(true);
    expect(state.player.hp).toBe(120);
    expect(equipItem(state, 'traveler-coat')).toBe(true);
    expect(state.player.hp).toBe(120);
  });

  it('rejects unknown, unowned and quest equipment and treats redundant changes as no-ops', () => {
    const state = newGame();
    expect(equipItem(state, 'dawnblade')).toBe(false);
    expect(equipItem(state, 'wanderer-blade')).toBe(false);
    expect(addItem(state, 'forest-shard')).toBe(true);
    expect(equipItem(state, 'forest-shard')).toBe(false);
    expect(addItem(state, 'constructor')).toBe(false);
    expect(addItem(state, '__proto__')).toBe(false);
    expect(unequipItem(state, '__proto__' as Slot)).toBe(false);
    expect(unequipItem(state, 'charm')).toBe(false);
    expect(equipItem(state, 'nothing')).toBe(false);
  });

  it('protects equipped and quest items, rejects duplicates, and removes unequipped items', () => {
    const state = newGame();
    expect(addItem(state, 'forest-shard')).toBe(true);
    expect(state.quest.forestShard).toBe(true);
    expect(addItem(state, 'forest-shard')).toBe(false);
    expect(discardItem(state, 'forest-shard')).toBe(false);
    expect(discardItem(state, 'wanderer-blade')).toBe(false);
    expect(discardItem(state, 'apprentice-staff')).toBe(true);
    expect(discardItem(state, 'apprentice-staff')).toBe(false);
    expect(state.player.inventory).not.toContain('apprentice-staff');
  });

  it('deducts gold only for successful purchases, including potions', () => {
    const state = newGame();
    expect(buyItem(state, 'dawnblade')).toBe(false);
    expect(state.player.gold).toBe(70);
    state.player.gold = 500;
    expect(buyItem(state, 'dawnblade')).toBe(true);
    expect(state.player.gold).toBe(500 - ITEMS.dawnblade.price!);
    expect(buyItem(state, 'dawnblade')).toBe(false);
    expect(buyItem(state, 'astral-crown')).toBe(false);
    expect(buyItem(state, 'constructor')).toBe(false);
    const previousGold = state.player.gold;
    expect(buyItem(state, 'potion')).toBe(true);
    expect(state.player.gold).toBe(previousGold - POTION_PRICE);
    expect(state.player.potions).toBe(6);
    state.player.potions = 99;
    expect(buyItem(state, 'potion')).toBe(false);
  });

  it('uses real finite potions for HP and mana recovery but does not waste them at full health', () => {
    const state = newGame();
    expect(usePotion(state)).toBe(false);
    state.player.hp = 10;
    state.player.mana = 0;
    expect(usePotion(state)).toBe(true);
    expect(state.player).toMatchObject({ hp: 87, mana: 21, potions: 4 });
    state.player.hp = 139;
    state.player.mana = 69;
    expect(usePotion(state)).toBe(true);
    expect(state.player).toMatchObject({ hp: 140, mana: 70, potions: 3 });
    state.player.hp = 0;
    expect(usePotion(state)).toBe(false);
    state.player.hp = 1;
    state.player.potions = 0;
    expect(usePotion(state)).toBe(false);
  });
});

describe('world progression and one-time rewards', () => {
  it('awards each real enemy once and rejects mismatched enemy identity', () => {
    const state = newGame();
    expect(awardEnemy(state, 'f1', 'boss', 'forest')).toBeNull();
    expect(awardEnemy(state, 'f1', 'stalker', 'temple')).toBeNull();
    expect(awardEnemy(state, 'fake-enemy', 'stalker', 'forest')).toBeNull();
    expect(awardEnemy(state, 'f1', 'stalker', 'forest')).toMatchObject({ xp: 32, gold: 14, levelUp: 0, items: [] });
    expect(state.player.gold).toBe(84);
    expect(state.player.xp).toBe(32);
    expect(state.quest.forestKills).toBe(1);
    expect(state.stats.kills).toBe(1);
    expect(awardEnemy(state, 'f1', 'stalker', 'forest')).toBeNull();
    expect(state.player.gold).toBe(84);
  });

  it('grants a fixed legendary boss reward and completes the main objective exactly once', () => {
    const state = newGame();
    expect(awardEnemy(state, 'b1', 'boss', 'rift')?.items).toEqual(['astral-crown']);
    expect(state.quest.bossDefeated).toBe(true);
    expect(objective(state).progress).toBe('여정 완료');
    expect(state.player.inventory).toContain('astral-crown');
    const gold = state.player.gold;
    expect(awardEnemy(state, 'b1', 'boss', 'rift')).toBeNull();
    expect(state.player.gold).toBe(gold);
    expect(ITEMS['astral-crown'].rarity).toBe('legendary');
  });

  it('gives deterministic, one-time exploration loot', () => {
    const state = newGame();
    expect(openChest(state, 'haven-cache')).toBe(true);
    expect(state.player).toMatchObject({ gold: 100, potions: 7, xp: 20 });
    expect(openChest(state, 'haven-cache')).toBe(false);
    expect(openChest(state, 'forest-cache')).toBe(true);
    expect(openChest(state, 'temple-cache')).toBe(true);
    expect(state.player.inventory).toContain('verdant-charm');
    expect(state.player.inventory).toContain('constellation-staff');
    expect(openChest(state, 'fake-cache')).toBe(false);
    expect(state.world.openedChests).toHaveLength(3);
  });

  it('resets an incorrect rune sequence and keeps a completed puzzle unlocked', () => {
    const state = newGame();
    expect(activateRune(state, 0)).toBe('correct');
    expect(activateRune(state, 2)).toBe('reset');
    expect(state.quest.runes).toEqual([]);
    expect(activateRune(state, -1)).toBe('reset');
    expect(activateRune(state, 0)).toBe('correct');
    expect(activateRune(state, 1)).toBe('correct');
    expect(activateRune(state, 2)).toBe('complete');
    expect(activateRune(state, 0)).toBe('complete');
    expect(state.quest.runes).toEqual([0, 1, 2]);
    expect(state.quest.templeShard).toBe(false);
  });

  it('requires actual side objectives and pays each reward once', () => {
    const state = newGame();
    expect(claimSideQuest(state, 'forest-clear')).toBe(false);
    expect(claimSideQuest(state, 'treasure')).toBe(false);
    expect(claimSideQuest(state, 'explorer')).toBe(false);
    expect(claimSideQuest(state, 'not-a-quest')).toBe(false);
    clearForest(state);
    const gold = state.player.gold;
    expect(claimSideQuest(state, 'forest-clear')).toBe(true);
    expect(state.player.gold).toBe(gold + 80);
    expect(claimSideQuest(state, 'forest-clear')).toBe(false);
    for (const id of ['haven-cache', 'forest-cache', 'temple-cache']) openChest(state, id);
    expect(claimSideQuest(state, 'treasure')).toBe(true);
    state.world.visited = ['haven', 'forest', 'temple', 'rift'];
    expect(claimSideQuest(state, 'explorer')).toBe(true);
    expect(state.quest.claimed).toEqual(['forest-clear', 'treasure', 'explorer']);
  });

  it('advances the main objective through acceptance, combat, shard pickups, puzzle and boss', () => {
    const state = newGame();
    expect(objective(state).progress).toContain('엘리아');
    state.quest.accepted = true;
    expect(objective(state).progress).toContain('0 / 3');
    clearForest(state);
    expect(objective(state).progress).toContain('숲의 별 파편');
    addItem(state, 'forest-shard');
    expect(objective(state).progress).toBe('석판 0 / 3');
    for (const index of [0, 1, 2]) activateRune(state, index);
    expect(objective(state).progress).toContain('신전의 별 파편');
    addItem(state, 'temple-shard');
    expect(objective(state).progress).toContain('아르켄');
    awardEnemy(state, 'b1', 'boss', 'rift');
    expect(objective(state).progress).toBe('여정 완료');
  });
});

describe('validated persistence', () => {
  it('allows the minimum mandatory engine route to unlock level 3 before the final boss', () => {
    const state = newGame();
    const storage = new MemoryStorage();
    state.quest.accepted = true;
    state.world.visited.push('forest');
    state.world.checkpoint = 'forest';
    for (const enemy of ZONES.forest.enemies.slice(0, 3)) awardEnemy(state, enemy.id, enemy.kind, 'forest');
    expect(state.quest.forestKills).toBe(3);
    expect(objective(state).progress).toContain('숲의 별 파편');
    addItem(state, 'forest-shard');
    addXp(state, 90);
    state.player.gold += 35;
    state.world.visited.push('temple');
    state.world.checkpoint = 'temple';
    for (const rune of [0, 1, 2]) activateRune(state, rune);
    addItem(state, 'temple-shard');
    addXp(state, 120);
    state.player.gold += 60;
    state.world.visited.push('rift');
    state.world.checkpoint = 'rift';
    expect(state.player.level).toBeGreaterThanOrEqual(3);
    expect(claimSideQuest(state, 'forest-clear')).toBe(false);
    expect(buyItem(state, 'dawnblade')).toBe(true);
    expect(buyItem(state, 'sentinel-mail')).toBe(true);
    expect(saveGame(state, storage)).toBe(true);
    expect(loadGame(storage)).toEqual(state);
  });

  it('retains boss reward idempotency after a save, reload, and legendary item disposal', () => {
    const state = newGame();
    const storage = new MemoryStorage();
    awardEnemy(state, 'b1', 'boss', 'rift');
    expect(discardItem(state, 'astral-crown')).toBe(true);
    expect(saveGame(state, storage)).toBe(true);
    const restored = loadGame(storage)!;
    const before = structuredClone(restored);
    expect(awardEnemy(restored, 'b1', 'boss', 'rift')).toBeNull();
    expect(restored).toEqual(before);
    expect(restored.player.inventory).not.toContain('astral-crown');
  });

  it('round-trips a whole campaign including equipment, talents, quest flags, and checkpoint', () => {
    const state = newGame();
    const storage = new MemoryStorage();
    state.quest.accepted = true;
    clearForest(state);
    addItem(state, 'forest-shard');
    for (const enemy of ZONES.temple.enemies) awardEnemy(state, enemy.id, enemy.kind, 'temple');
    for (const index of [0, 1, 2]) activateRune(state, index);
    addItem(state, 'temple-shard');
    for (const id of ['haven-cache', 'forest-cache', 'temple-cache']) openChest(state, id);
    state.world.visited = ['haven', 'forest', 'temple', 'rift'];
    state.world.checkpoint = 'rift';
    claimSideQuest(state, 'forest-clear');
    investTalent(state, 'power');
    equipItem(state, 'constellation-staff');
    awardEnemy(state, 'b1', 'boss', 'rift');
    equipItem(state, 'astral-crown');
    state.stats.playTime = 543.25;
    expect(saveGame(state, storage)).toBe(true);
    expect(hasSave(storage)).toBe(true);
    expect(loadGame(storage)).toEqual(state);
    const restored = loadGame(storage)!;
    expect(awardEnemy(restored, 'b1', 'boss', 'rift')).toBeNull();
    expect(openChest(restored, 'temple-cache')).toBe(false);
    expect(claimSideQuest(restored, 'forest-clear')).toBe(false);
    expect(calculateStats(restored)).toEqual(calculateStats(state));
  });

  it.each(['{bad JSON', 'null', '[]', '{"version":2}', '{}'])('rejects malformed or unsupported persisted content: %s', raw => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, raw);
    expect(loadGame(storage)).toBeNull();
    expect(hasSave(storage)).toBe(false);
  });

  it('rejects unknown or foreign item, world, equipment and quest identities', () => {
    const corruptions: ((state: GameState) => void)[] = [
      state => state.player.inventory.push('unknown-sword'),
      state => state.player.inventory.push('__proto__'),
      state => { state.player.equipment.weapon = 'dawnblade'; },
      state => { state.player.equipment.weapon = 'traveler-coat'; },
      state => state.world.defeated.push('missing-enemy'),
      state => state.world.openedChests.push('missing-chest'),
      state => state.quest.claimed.push('missing-quest'),
      state => { state.world.checkpoint = 'missing-zone' as 'haven'; },
      state => { state.quest.runes = [0, 2]; },
      state => { state.player.hp = Number.NaN; },
      state => { state.player.talents.power = 3; },
    ];
    for (const corrupt of corruptions) {
      const state = newGame();
      corrupt(state);
      expect(validateSave(state)).toBeNull();
      expect(saveGame(state, new MemoryStorage())).toBe(false);
    }
  });

  it('clamps finite numeric bounds, resource caps, and independent settings safely', () => {
    const state = newGame();
    state.player.hp = 999999;
    state.player.mana = -50;
    state.player.gold = -100;
    state.player.potions = 1000;
    state.player.xp = 50000;
    state.player.skillPoints = 500;
    state.stats.deaths = -2;
    state.settings.music = 42;
    state.settings.ambience = -3;
    state.settings.sensitivity = -20;
    const restored = validateSave(state)!;
    expect(restored.player).toMatchObject({ hp: 140, mana: 0, gold: 0, potions: 99, xp: 89, skillPoints: 0 });
    expect(restored.stats.deaths).toBe(0);
    expect(restored.settings.music).toBe(1);
    expect(restored.settings.ambience).toBe(0);
    expect(restored.settings.sensitivity).toBe(0.3);
    expect(state.player.hp).toBe(999999);
  });

  it('preserves legitimate partial puzzle progress and repairs redundant quest facts', () => {
    const state = newGame();
    state.quest.accepted = true;
    state.quest.runes = [0, 1];
    expect(validateSave(state)?.quest.runes).toEqual([0, 1]);
    state.quest.forestShard = true;
    state.quest.templeShard = true;
    state.world.defeated = ['f1', 'f1'];
    const restored = validateSave(state)!;
    expect(restored.player.inventory).toContain('forest-shard');
    expect(restored.player.inventory).toContain('temple-shard');
    expect(restored.quest.runes).toEqual([0, 1, 2]);
    expect(restored.quest.forestKills).toBe(1);
    expect(restored.world.defeated).toEqual(['f1']);
    expect(restored.stats.kills).toBe(1);
  });

  it('repairs a completed boss flag missing its redundant world record without granting rewards', () => {
    const state = newGame();
    state.quest.bossDefeated = true;
    const restored = validateSave(state)!;
    expect(restored.world.defeated).toContain('b1');
    expect(awardEnemy(restored, 'b1', 'boss', 'rift')).toBeNull();
    expect(restored.player.gold).toBe(state.player.gold);
    expect(restored.player.inventory).toEqual(state.player.inventory);
  });

  it('preserves death on reload and does not revive by save validation', () => {
    const state = newGame();
    state.player.hp = 0;
    const storage = new MemoryStorage();
    expect(saveGame(state, storage)).toBe(true);
    expect(loadGame(storage)?.player.hp).toBe(0);
  });

  it('fails safely if browser storage is unavailable, quota is exceeded, or reads throw', () => {
    const storage = new MemoryStorage();
    storage.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(saveGame(newGame(), storage)).toBe(false);
    expect(saveSettings(DEFAULT_SETTINGS, storage)).toBe(false);
    storage.getItem = () => { throw new Error('SecurityError'); };
    expect(loadGame(storage)).toBeNull();
    expect(hasSave(storage)).toBe(false);
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    storage.removeItem = () => { throw new Error('SecurityError'); };
    expect(resetSave(storage)).toBe(false);
  });

  it('saves menu settings independently, applies them on load, and keeps them when progress resets', () => {
    const storage = new MemoryStorage();
    const settings: Settings = { music: 0, effects: 0.25, ambience: 0.1, quality: 'low', shake: false, sensitivity: 0.7 };
    expect(saveSettings(settings, storage)).toBe(true);
    expect(loadSettings(storage)).toEqual(settings);
    expect(saveGame(newGame(), storage)).toBe(true);
    expect(loadGame(storage)?.settings).toEqual(settings);
    expect(resetSave(storage)).toBe(true);
    expect(hasSave(storage)).toBe(false);
    expect(loadSettings(storage)).toEqual(settings);
    expect(storage.getItem(SETTINGS_KEY)).not.toBeNull();
  });

  it('upgrades earlier version-1 settings with the default environmental volume', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_KEY, JSON.stringify({ music: 0.2, effects: 0.8, quality: 'low', shake: false, sensitivity: 1.2 }));
    expect(loadSettings(storage)).toEqual({ music: 0.2, effects: 0.8, ambience: 0.4, quality: 'low', shake: false, sensitivity: 1.2 });
  });

  it('rejects oversized save content and tolerates broken settings', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, ' '.repeat(200_001));
    storage.setItem(SETTINGS_KEY, '{broken');
    expect(loadGame(storage)).toBeNull();
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });
});
