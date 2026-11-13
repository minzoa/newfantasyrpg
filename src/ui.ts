import type { Item, Slot, UiAction, UiHandler, UiSnapshot } from './contracts';
import { ITEMS, xpToNext } from './domain';
import { ZONES } from './zones';

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const number = (value: number) => Math.round(value).toLocaleString('ko-KR');
const rarity: Record<Item['rarity'], string> = { common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' };
const slots: Record<Slot, string> = { weapon: '무기', armor: '방어구', charm: '장신구' };
const paths: Record<string, string> = {
  star: '<path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4Z"/><path d="m5 5 2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>',
  sword: '<path d="m16 3 5-1-1 5L9 18l-3-3Z"/><path d="m4 13 7 7M3 21l4-4m-5 2 3 3"/>',
  staff: '<path d="m5 21 9-13m-1-5 4-2 5 4-2 5-5-1-2-6Z"/><path d="m16 4 3 2-1 2-3-1Z"/>',
  shield: '<path d="M12 2 3 6v7c0 5 9 9 9 9s9-4 9-9V6Z"/><path d="M12 6v11m-4-7h8"/>',
  dash: '<path d="m13 3-7 10h7l-2 8 9-12h-8l1-6Z"/><path d="M2 7h5m-6 10h5"/>',
  potion: '<path d="M9 2h6v5l5 8a5 5 0 0 1-4 7H8a5 5 0 0 1-4-7l5-8Z"/><path d="M8 3h8M7 14h10m-9 3h3"/>',
  bag: '<path d="M5 8h14l2 13H3L5 8Z"/><path d="M8 8V5a4 4 0 0 1 8 0v3m-9 5h10m-5 0v4"/>',
  book: '<path d="M12 5C9 2 3 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-3-2-7-1-10 1Z"/><path d="M12 5v16M5 7l4 1m-4 3 4 1m6-4 4-1m-4 5 4-1"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="m12 6 4 6-4 6-4-6Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  arrow: '<path d="M3 12h17m-6-6 6 6-6 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  crystal: '<path d="m12 2 7 7-3 11-4 2-4-2L5 9Z"/><path d="m12 2-2 8 2 12 2-12-2-8ZM5 9l5 1m4 0 5-1"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16 6-2 8-8 4 4-8 6-4Z"/>',
  heart: '<path d="M12 21 3 12a6 6 0 0 1 9-8 6 6 0 0 1 9 8Z"/>',
};
const icon = (name: string, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.star}</svg>`;
const emblem = `<svg class="astral-emblem" viewBox="0 0 120 120" fill="none" aria-hidden="true"><circle cx="60" cy="60" r="42" stroke="currentColor" stroke-width=".6"/><circle cx="60" cy="60" r="33" stroke="currentColor" stroke-width=".6" stroke-dasharray="2 6"/><path d="M60 3 70 49 116 60 70 71 60 117 50 71 4 60 50 49Z" stroke="currentColor" stroke-width="1"/><path d="m60 24 7 29 29 7-29 7-7 29-7-29-29-7 29-7Z" fill="currentColor" opacity=".75"/><path d="m30 30 9 9m42 42 9 9m0-60-9 9M39 81l-9 9" stroke="currentColor"/><circle cx="60" cy="60" r="5" fill="#fff7dc"/></svg>`;
const itemIcon = (item: Item) => item.kind === 'weapon' ? item.style === 'staff' ? 'staff' : 'sword' : item.kind === 'armor' ? 'shield' : 'crystal';
const itemStats = (item: Item) => [item.attack ? `공격력 +${item.attack}` : '', item.defense ? `방어력 +${item.defense}` : '', item.hp ? `체력 +${item.hp}` : '', item.mana ? `마나 +${item.mana}` : ''].filter(Boolean).join(' · ');
const btn = (action: UiAction, label: string, cls = '', value = '', disabled = false) => {
  const accessible = action === 'close' ? '닫기' : action === 'talent' ? `${value === 'power' ? '검의 의지' : '별의 숨결'}에 재능 투자` : cls.includes('hud-button') ? ({ inventory: '소지품 열기', quests: '여정의 기록 열기', pause: '일시 정지 메뉴' } as Record<string, string>)[action] : '';
  return `<button type="button" class="game-button ${cls}" data-action="${action}"${accessible ? ` aria-label="${accessible}"` : ''}${value ? ` data-value="${escape(value)}"` : ''}${disabled ? ' disabled' : ''}>${label}</button>`;
};

export class GameUI {
  private snapshot?: UiSnapshot;
  private modalKey = '';
  private selected = '';
  private noticeId = -1;
  private noticeTimer?: ReturnType<typeof setTimeout>;
  private floatingTimers = new Set<ReturnType<typeof setTimeout>>();
  private enemyBars = new Map<string, HTMLDivElement>();
  private refs: Record<string, HTMLElement> = {};
  private map: HTMLCanvasElement;
  private modal: HTMLElement;
  private clickHandler = (event: MouseEvent) => this.click(event);
  private inputHandler = (event: Event) => this.setting(event);
  private keyHandler = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || this.modal.hidden) return;
    const controls = [...this.modal.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  constructor(private root: HTMLElement, private onAction: UiHandler) {
    root.innerHTML = `
      <section class="title-screen" id="title-screen" aria-label="타이틀 화면">
        <div class="title-shade"></div><div class="screen-corners" aria-hidden="true"></div>
        <div class="title-top"><span class="brand-mark">${icon('star')} ASTRALIA <span class="tiny-rule"></span> ORIGINAL CHRONICLES</span><span class="edition-label">CHAPTER I <span>THE FALLEN STAR</span></span></div>
        <div class="title-content">
          <div class="title-eyebrow"><span></span> A WORLD WAITING TO BE REMEMBERED</div>
          <div class="title-wordmark"><h1>ASTRALIA</h1><div class="title-subtitle"><span></span> LEGACY OF STARS <span></span></div></div>
          <div class="title-korean">아스트라리아 <span>별의 유산</span></div>
          <p class="title-story">별이 부서진 밤, 세상은 빛을 잊었다.<br>당신 안에 남은 작은 빛이, 다시 길을 열리라.</p>
          <nav class="title-menu" aria-label="시작 메뉴">
            ${btn('new', `<span class="menu-star">✦</span><span>새로운 여정<span class="button-sub">BEGIN YOUR JOURNEY</span></span>${icon('arrow')}`, 'start-button')}
            ${btn('continue', '<span>여정 이어가기</span><span class="continue-note" id="continue-note">SAVED JOURNEY</span>', 'text-menu', '', true)}
            ${btn('settings', '<span>환경 설정</span><span class="menu-shortcut">SETTINGS</span>', 'text-menu')}
          </nav>
        </div>
        <div class="title-scene-label"><span class="label-rule"></span><span>THE FIRST LIGHT</span><strong>별빛의 거점</strong><small>잃어버린 별을 찾아, 첫걸음을 내딛다.</small></div>
        <footer class="title-footer"><div class="title-controls"><span><kbd>W A S D</kbd> 이동</span><span><kbd>마우스</kbd> 전투 · 시점</span><span><kbd>Shift</kbd> 회피</span><span><kbd>E</kbd> 상호작용</span></div><div class="title-build"><span class="live-dot"></span> SINGLE PLAYER ADVENTURE <span>v1.0</span></div></footer>
      </section>
      <section class="hud" id="hud" aria-label="게임 정보" hidden>
        <div class="enemy-health-layer" id="enemy-health-layer"></div>
        <div class="player-hud"><div class="player-sigil">${icon('star')}<span id="player-level">1</span></div><div class="player-vitals"><div class="player-name">별을 잇는 자 <span id="combat-style">검의 길</span></div><div class="vital hp"><div id="hp-fill"></div><span id="hp-text"></span></div><div class="vital mana"><div id="mana-fill"></div><span id="mana-text"></span></div><div class="vitals-meta"><span>${icon('coin')} <b id="gold-text">0</b></span><span id="level-label">LEVEL 1</span></div></div></div>
        <div class="zone-heading" id="zone-heading"><span id="zone-subtitle"></span><strong id="zone-name"></strong><div class="zone-heading-rule"><i></i>✦<i></i></div></div>
        <div class="map-block"><div class="map-compass">N</div><canvas id="minimap" width="320" height="320" aria-label="지역 미니맵"></canvas><div class="map-bottom">${icon('compass')} <span id="map-coords"></span></div></div>
        <div class="objective-tracker"><span class="eyebrow">별의 부름 <i>MAIN QUEST</i></span><strong id="objective-title"></strong><p id="objective-description"></p><span id="objective-progress"></span></div>
        <div class="boss-hud" id="boss-hud" hidden><span>THE LAST SENTINEL</span><strong>공허의 수호자 · 아르켄 <i id="boss-phase"></i></strong><div class="boss-health"><div id="boss-fill"></div></div><p id="boss-warning"></p></div>
        <div class="location-banner" id="location-banner" hidden><span id="location-subtitle"></span><strong id="location-name"></strong><p id="location-description"></p></div>
        <div class="tutorial" id="tutorial"></div>
        <div class="interact-hint" id="interact-hint" hidden><kbd>E</kbd><span id="interact-text"></span></div>
        <div class="combat-bar"><div class="combat-caption"><span id="weapon-name"></span><i></i><span>별의 가호가 함께하기를</span></div><div class="skills">
          ${this.skill('attack', 'LMB', '연속 공격', 'sword', '마우스 왼쪽 · 검은 3연격, 지팡이는 원거리 마법탄')}
          ${this.skill('q', 'Q', '별빛 폭발', 'star', 'Q · 주변 범위 공격 · 마나 18 · 재사용 5.5초')}
          ${this.skill('r', 'R', '별의 창', 'staff', 'R · 강력한 전방 공격 · 레벨 3 해금 · 마나 30 · 재사용 11초')}
          ${this.skill('dash', 'SHIFT', '회피 대시', 'dash', 'Shift · 0.32초 무적 회피 · 마나 8 · 재사용 1.4초')}
          ${this.skill('guard', 'RMB', '별빛 방어', 'shield', '마우스 오른쪽 유지 · 방어 시 마나 6 · 받는 피해를 28%로 줄입니다')}
          <button class="skill-slot potion-slot" type="button" data-action="potion" title="1 · 체력과 마나를 회복합니다"><kbd>1</kbd>${icon('potion')}<strong class="skill-count" id="potion-count">3</strong><span class="skill-name">회복 물약</span></button>
        </div></div>
        <div class="hud-shortcuts">${btn('inventory', `${icon('bag')}<kbd>I</kbd><span>소지품</span>`, 'hud-button')}${btn('quests', `${icon('book')}<kbd>J</kbd><span>여정</span>`, 'hud-button')}${btn('pause', `${icon('menu')}<kbd>ESC</kbd><span>메뉴</span>`, 'hud-button')}</div>
        <div class="camera-hint"><kbd>휠 드래그</kbd> 시점 회전 <span>·</span> <kbd>V</kbd> 시점 고정</div>
        <div class="experience-track"><div id="xp-fill"></div></div>
      </section>
      <div class="notice" id="notice" role="status" aria-live="polite">${icon('star')}<span id="notice-text"></span></div>
      <div class="floating-layer" id="floating-layer" aria-hidden="true"></div>
      <div class="modal-layer" id="modal-layer" hidden></div>
    `;
    for (const element of root.querySelectorAll<HTMLElement>('[id]')) this.refs[element.id] = element;
    this.map = root.querySelector<HTMLCanvasElement>('#minimap')!;
    this.modal = this.refs['modal-layer'];
    root.addEventListener('click', this.clickHandler);
    root.addEventListener('input', this.inputHandler);
    root.addEventListener('change', this.inputHandler);
    root.addEventListener('keydown', this.keyHandler);
  }

  private skill(id: string, key: string, label: string, glyph: string, description: string) {
    return `<div class="skill-slot" id="skill-${id}" title="${description}" aria-label="${description}"><kbd>${key}</kbd>${icon(glyph)}<span class="cooldown-value" id="cooldown-${id}"></span><span class="skill-name">${label}</span></div>`;
  }

  private click(event: MouseEvent) {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action], [data-select]');
    if (!target || target.hasAttribute('disabled')) return;
    if (target.dataset.select) {
      this.selected = target.dataset.select;
      this.modalKey = '';
      if (this.snapshot) this.render(this.snapshot);
      return;
    }
    const action = target.dataset.action as UiAction;
    const value = target.dataset.value;
    if (action === 'new' && this.snapshot?.saveAvailable && !window.confirm('새로운 여정을 시작하면 현재 저장된 여정을 덮어씁니다. 새로 시작할까요?')) return;
    if (action === 'discard' && !window.confirm(`${ITEMS[value || '']?.name || '이 아이템'}을(를) 버릴까요? 되돌릴 수 없습니다.`)) return;
    this.onAction(action, value);
  }

  private setting(event: Event) {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const key = target.dataset.setting;
    if (!key) return;
    // Range input is live; selects and checkboxes dispatch once through change.
    if (event.type === 'input' && target.type !== 'range') return;
    if (event.type === 'change' && target.type === 'range') return;
    const value = target.type === 'checkbox' ? String((target as HTMLInputElement).checked) : target.value;
    const output = this.modal.querySelector<HTMLOutputElement>(`[data-output="${key}"]`);
    if (output) output.value = key === 'sensitivity' ? `${Number(value).toFixed(1)}×` : `${Math.round(Number(value) * 100)}%`;
    this.onAction('setting', `${key}:${value}`);
  }

  render(snapshot: UiSnapshot) {
    const previousScreen = this.snapshot?.screen;
    this.snapshot = snapshot;
    const { state, stats, screen } = snapshot;
    const p = state.player;
    const title = screen === 'title';
    this.root.dataset.screen = screen;
    this.refs['title-screen'].hidden = !title;
    this.refs.hud.hidden = title;
    const continueButton = this.root.querySelector<HTMLButtonElement>('[data-action="continue"]')!;
    continueButton.disabled = !snapshot.saveAvailable;
    this.setText('continue-note', snapshot.saveAvailable ? 'SAVED JOURNEY' : '저장된 여정 없음');
    this.setText('player-level', p.level);
    this.setText('level-label', `LEVEL ${p.level}`);
    this.setText('combat-style', stats.style === 'staff' ? '별의 술사' : '별의 검사');
    this.setText('hp-text', `${number(p.hp)} / ${number(stats.maxHp)}`);
    this.setText('mana-text', `${number(p.mana)} / ${number(stats.maxMana)}`);
    this.setFill('hp-fill', p.hp / stats.maxHp);
    this.setFill('mana-fill', p.mana / stats.maxMana);
    this.setFill('xp-fill', p.xp / xpToNext(p.level));
    this.setText('gold-text', number(p.gold));
    this.setText('zone-name', snapshot.zoneName);
    this.setText('zone-subtitle', ZONES[snapshot.zone].subtitle);
    this.setText('map-coords', `${Math.round(snapshot.player.x)} · ${Math.round(-snapshot.player.z)}`);
    this.setText('objective-title', snapshot.objective.title);
    this.setText('objective-description', snapshot.objective.description);
    this.setText('objective-progress', snapshot.objective.progress);
    this.setText('potion-count', p.potions);
    this.setText('weapon-name', ITEMS[p.equipment.weapon || '']?.name || '여행자의 검');
    this.refs['interact-hint'].hidden = !snapshot.interact || screen !== 'play';
    this.setText('interact-text', snapshot.interact || '');
    this.setText('tutorial', snapshot.tutorial);
    this.refs.tutorial.hidden = !snapshot.tutorial || screen !== 'play';
    this.refs['boss-hud'].hidden = !snapshot.boss;
    if (snapshot.boss) {
      this.setFill('boss-fill', snapshot.boss.hp / snapshot.boss.maxHp);
      this.setText('boss-phase', `PHASE ${snapshot.boss.phase}`);
      this.setText('boss-warning', snapshot.boss.warning);
    }
    this.refs['zone-heading']?.classList.toggle('boss-active', Boolean(snapshot.boss));
    const locationVisible = snapshot.locationBanner > 0 && screen === 'play';
    this.refs['location-banner'].hidden = !locationVisible;
    if (locationVisible) {
      this.setText('location-subtitle', ZONES[snapshot.zone].subtitle);
      this.setText('location-name', snapshot.zoneName);
      this.setText('location-description', ZONES[snapshot.zone].description);
    }
    for (const skill of ['q', 'r', 'dash', 'guard'] as const) {
      const remaining = snapshot.cooldowns[skill];
      const locked = skill === 'r' && p.level < 3;
      this.refs[`skill-${skill}`].classList.toggle('is-cooling', remaining > 0);
      this.refs[`skill-${skill}`].classList.toggle('is-locked', locked);
      this.setText(`cooldown-${skill}`, locked ? 'Lv.3' : remaining > 0 ? remaining.toFixed(1) : '');
    }
    this.refs['skill-guard'].classList.toggle('is-active', snapshot.blocking);
    if (snapshot.notice && snapshot.noticeId !== this.noticeId) {
      this.noticeId = snapshot.noticeId;
      this.setText('notice-text', snapshot.notice);
      this.refs.notice.classList.remove('visible');
      void this.refs.notice.offsetWidth;
      this.refs.notice.classList.add('visible');
      if (this.noticeTimer) clearTimeout(this.noticeTimer);
      this.noticeTimer = setTimeout(() => this.refs.notice.classList.remove('visible'), 3800);
    }
    if (!title) this.drawMap(snapshot);
    this.drawEnemyHealth(snapshot);
    const hasModal = screen !== 'title' && screen !== 'play';
    this.refs.hud.inert = hasModal;
    this.modal.hidden = !hasModal;
    if (!hasModal) { this.modalKey = ''; return; }
    const signature = screen === 'settings' || screen === 'pause' ? screen : JSON.stringify([screen, p.inventory, p.equipment, p.potions, p.gold, p.level, p.skillPoints, p.talents, state.quest, state.world.openedChests, state.world.visited, stats, snapshot.dialogue, this.selected]);
    if (signature !== this.modalKey) {
      this.modalKey = signature;
      this.modal.innerHTML = this.renderModal(snapshot);
      if (previousScreen !== screen) this.modal.querySelector<HTMLElement>('button:not(:disabled), input, select')?.focus({ preventScroll: true });
    }
  }

  private setText(id: string, value: unknown) {
    const element = this.refs[id];
    if (element && element.textContent !== String(value)) element.textContent = String(value);
  }
  private setFill(id: string, ratio: number) { this.refs[id].style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`; }
  private frame(eyebrow: string, title: string, body: string, cls = '', subtitle = '') {
    return `<section class="game-panel ${cls}" role="dialog" aria-modal="true" aria-label="${escape(title)}"><header class="panel-header"><div><span class="eyebrow">${eyebrow}</span><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${btn('close', icon('close'), 'close-button')}</header>${body}<div class="panel-bottom"><span>✦ ASTRALIA · LEGACY OF STARS</span><span><kbd>ESC</kbd> 돌아가기 · 메뉴에서 시간은 멈춥니다</span></div></section>`;
  }

  private renderModal(s: UiSnapshot): string {
    const p = s.state.player;
    if (s.screen === 'inventory') return this.inventory(s);
    if (s.screen === 'quests') return this.quests(s);
    if (s.screen === 'settings') return this.settings(s);
    if (s.screen === 'shop') return this.shop(s);
    if (s.screen === 'dialogue') {
      return this.frame('KEEPER OF THE STARS', '별의 기록자 · 엘리아', `<div class="dialogue-content"><div class="dialogue-portrait">${emblem}<span>ELIA</span></div><div class="dialogue-copy"><span class="eyebrow">별빛의 거점</span><p>${escape(s.dialogue || '별의 빛이 당신에게 반응하는군요. 숲과 신전에 흩어진 두 개의 파편을 모아 주세요. 그것이 균열을 닫을 유일한 길입니다.').replace(/\n/g, '<br>')}</p><div class="dialogue-actions">${!s.state.quest.accepted ? btn('accept', `별의 부름을 받아들인다 ${icon('arrow')}`, 'primary') : btn('quests', '여정의 기록 보기', 'primary')}${btn('close', '대화 마치기', 'subtle')}</div></div></div>${this.optionalQuests(s, true)}`, 'dialogue-panel');
    }
    if (s.screen === 'death') {
      return `<section class="game-panel result-panel death-panel" role="dialog" aria-modal="true" aria-label="쓰러짐"><div class="result-symbol">${emblem}</div><span class="eyebrow">EVEN STARS FALL</span><h2>빛은 아직 꺼지지 않았다</h2><p>별의 샘이 당신의 이름을 기억합니다.<br>숨을 고르고, 다시 여정을 이어가세요.</p><div class="result-buttons">${btn('retry', `별의 샘에서 다시 깨어나기 ${icon('arrow')}`, 'primary')}${btn('title', '타이틀로 돌아가기', 'subtle')}</div><span class="result-footnote">장비와 여정의 기록은 보존됩니다.</span></section>`;
    }
    if (s.screen === 'ending') {
      const minutes = Math.max(1, Math.floor(s.state.stats.playTime / 60));
      return `<section class="game-panel result-panel ending-panel" role="dialog" aria-modal="true" aria-label="여정 완료"><div class="result-symbol">${emblem}</div><span class="eyebrow">THE STARS REMEMBER</span><h2>별은, 다시 빛난다</h2><p>수호자의 오랜 맹세는 끝났고, 균열 너머로 새벽이 찾아왔다.<br>당신이 이어 낸 작은 빛을, 이 세계는 오래 기억할 것이다.</p><div class="ending-stats"><div><strong>${p.level}</strong><span>도달한 레벨</span></div><div><strong>${s.state.stats.kills}</strong><span>물리친 적</span></div><div><strong>${minutes}<small>분</small></strong><span>당신의 여정</span></div><div><strong>${s.state.world.openedChests.length}</strong><span>발견한 보물</span></div></div><div class="reward-callout">${icon('crystal')}<span>수호자의 유산 <strong>전설 장신구 · 별의 왕관</strong></span></div><div class="result-buttons">${btn('restart-boss', '수호자에게 다시 도전하기', 'primary')}${btn('title', '타이틀로 돌아가기', 'subtle')}</div></section>`;
    }
    return this.frame('A MOMENT OF STILLNESS', '잠시, 별을 바라보며', `<div class="pause-emblem">${emblem}</div><p class="pause-description">당신의 여정은 이곳에서 잠시 쉬어 갑니다.</p><nav class="pause-menu">${btn('resume', `여정 계속하기 ${icon('arrow')}`, 'primary')}${btn('inventory', `${icon('bag')} 소지품과 장비`)}${btn('quests', `${icon('book')} 여정의 기록`)}${btn('settings', '환경 설정')}${btn('save', '현재 여정 저장')}${btn('title', '타이틀로 돌아가기', 'subtle')}</nav>`, 'pause-panel');
  }

  private inventory(s: UiSnapshot) {
    const p = s.state.player;
    if (!p.inventory.includes(this.selected)) this.selected = p.equipment.weapon || p.inventory[0] || '';
    const selected = ITEMS[this.selected];
    const equipped = Object.values(p.equipment).includes(this.selected);
    const stats = s.stats;
    const equipment = (Object.keys(slots) as Slot[]).map(slot => {
      const item = ITEMS[p.equipment[slot] || ''];
      return `<button class="equipment-slot ${item?.rarity || ''}" data-select="${item?.id || ''}"${item ? '' : ' disabled'}><span class="equipment-icon">${icon(item ? itemIcon(item) : slot === 'weapon' ? 'sword' : slot === 'armor' ? 'shield' : 'crystal')}</span><span><small>${slots[slot]}</small><strong>${item ? escape(item.name) : '장착된 장비 없음'}</strong></span><i>${item ? '◆' : '◇'}</i></button>`;
    }).join('');
    const itemList = p.inventory.map(id => {
      const item = ITEMS[id];
      if (!item) return '';
      return `<button class="inventory-item ${item.rarity} ${this.selected === id ? 'selected' : ''}" data-select="${escape(id)}" aria-pressed="${this.selected === id}"><span class="item-icon">${icon(itemIcon(item))}</span><span><strong>${escape(item.name)}</strong><small>${rarity[item.rarity]} · ${item.kind === 'quest' ? '여정의 파편' : slots[item.kind]}</small></span>${Object.values(p.equipment).includes(id) ? `<i class="equipped-badge">장착</i>` : ''}</button>`;
    }).join('');
    const detail = selected ? `<div class="item-detail ${selected.rarity}"><span class="eyebrow">${rarity[selected.rarity]} · ${selected.kind === 'quest' ? '퀘스트 아이템' : slots[selected.kind]}</span><div class="detail-art">${icon(itemIcon(selected))}<span></span></div><h3>${escape(selected.name)}</h3><p class="item-description">${escape(selected.description)}</p><div class="detail-stats">${itemStats(selected) || '별의 핵을 복원하는 데 필요한 파편'}</div>${selected.style ? `<div class="style-note">${selected.style === 'staff' ? '마법 지팡이 · 원거리 마법탄' : '한손검 · 빠른 근접 3연격'}</div>` : ''}<div class="item-actions">${selected.kind === 'quest' ? '<div class="protected-item">✦ 여정에 필요한 아이템은 보호됩니다.</div>' : equipped ? btn('unequip', '장착 해제', 'primary', selected.kind) : btn('equip', '이 장비 장착하기', 'primary', selected.id)}${selected.kind !== 'quest' ? btn('discard', '아이템 버리기', 'subtle danger', selected.id, equipped) : ''}</div></div>` : '<div class="empty-inventory">여정을 떠나 새로운 유산을 발견하세요.</div>';
    return this.frame('CHARACTER & INVENTORY', '별을 잇는 자', `<div class="inventory-meta"><span>LEVEL <b>${p.level}</b> <i>·</i> ${stats.style === 'staff' ? '별의 술사' : '별의 검사'}</span><span>${icon('coin')} ${number(p.gold)} <small>GOLD</small></span></div><div class="inventory-layout"><aside class="character-sheet"><h3 class="section-label">장착 장비</h3><div class="equipment-list">${equipment}</div><h3 class="section-label">능력치</h3><dl class="stat-list"><div><dt>최대 체력</dt><dd>${stats.maxHp}</dd></div><div><dt>최대 마나</dt><dd>${stats.maxMana}</dd></div><div><dt>공격력</dt><dd>${stats.attack}</dd></div><div><dt>방어력</dt><dd>${stats.defense}</dd></div><div><dt>치명타 확률</dt><dd>${Math.round(stats.crit * 100)}%</dd></div></dl><div class="talent-header"><h3 class="section-label">별의 재능</h3><span>${p.skillPoints} POINTS</span></div><div class="talent-row"><span><strong>검의 의지 <small>${p.talents.power}/10</small></strong><small>공격 +3 · 치명타 +1%</small></span>${btn('talent', '+', 'talent-add', 'power', p.skillPoints < 1 || p.talents.power >= 10)}</div><div class="talent-row"><span><strong>별의 숨결 <small>${p.talents.spirit}/10</small></strong><small>마나 +10 · 체력 +5 · 방어 +1</small></span>${btn('talent', '+', 'talent-add', 'spirit', p.skillPoints < 1 || p.talents.spirit >= 10)}</div></aside><div class="inventory-bag"><div class="bag-heading"><h3 class="section-label">소지품 <span>${p.inventory.length}</span></h3>${btn('sort', '정렬', 'small-button')}</div><div class="inventory-list">${itemList}</div><div class="potion-inventory">${icon('potion')}<div><strong>별빛 회복 물약 <span>×${p.potions}</span></strong><small>체력과 마나 회복</small></div>${btn('potion', '사용', 'small-button', '', p.potions < 1)}</div></div><aside class="item-details">${detail}</aside></div>`, 'inventory-panel');
  }

  private optionalQuests(s: UiSnapshot, compact = false) {
    const q = s.state.quest;
    const entries = [
      { id: 'forest-clear', name: '숲의 고요를 되찾아', desc: '에메랄드 숲의 적 5마리를 물리치세요.', amount: q.forestKills, max: 5, reward: '80 금화 · 65 경험치', glyph: 'sword' },
      { id: 'treasure', name: '잊힌 유산의 발견자', desc: '세계에 숨겨진 보물함 3개를 여세요.', amount: s.state.world.openedChests.length, max: 3, reward: '100 금화 · 70 경험치', glyph: 'bag' },
      { id: 'explorer', name: '별이 닿는 모든 곳', desc: '네 지역에 모두 발자취를 남기세요.', amount: s.state.world.visited.length, max: 4, reward: '130 금화 · 90 경험치', glyph: 'compass' },
    ];
    const list = compact ? entries.filter(entry => entry.amount >= entry.max && !q.claimed.includes(entry.id)) : entries;
    return list.length ? `<div class="optional-quests ${compact ? 'compact' : ''}">${list.map(entry => {
      const claimed = q.claimed.includes(entry.id);
      const ready = entry.amount >= entry.max;
      return `<article class="quest-card ${claimed ? 'completed' : ''}"><div class="quest-card-icon">${icon(claimed ? 'check' : entry.glyph)}</div><div class="quest-card-copy"><h3>${entry.name}</h3><p>${entry.desc}</p><small>${entry.reward}</small></div><div class="quest-card-progress"><strong>${Math.min(entry.amount, entry.max)} <span>/ ${entry.max}</span></strong>${btn('claim', claimed ? '완료' : ready ? '보상 수령' : '진행 중', 'small-button', entry.id, claimed || !ready)}</div></article>`;
    }).join('')}</div>` : '';
  }

  private quests(s: UiSnapshot) {
    const q = s.state.quest;
    const steps = [
      { title: '별의 부름', text: '거점의 엘리아와 대화하기', done: q.accepted },
      { title: '숲에 잠든 빛', text: '에메랄드 숲에서 첫 번째 파편 찾기', done: q.forestShard },
      { title: '잊힌 별의 언어', text: '태양 → 별 → 달의 석판을 깨우고 신전의 파편 찾기', done: q.templeShard },
      { title: '수호자의 마지막 맹세', text: '별의 균열에서 아르켄을 물리치기', done: q.bossDefeated },
    ];
    return this.frame('JOURNAL OF THE STARBOUND', '여정의 기록', `<div class="journal-layout"><div class="main-quest"><span class="eyebrow">MAIN CHRONICLE</span><h3>흩어진 별을 잇는 여정</h3><p>별의 핵이 부서진 뒤, 세상은 천천히 빛을 잃어 갔다. 숲과 신전에 흩어진 두 파편을 모으고, 마지막 수호자의 진실을 마주하라.</p><ol class="quest-timeline">${steps.map((step, index) => `<li class="${step.done ? 'done' : index === steps.findIndex(st => !st.done) ? 'current' : ''}"><span>${step.done ? '✓' : `0${index + 1}`}</span><div><strong>${step.title}</strong><small>${step.text}</small></div></li>`).join('')}</ol><div class="quest-current"><span>현재 목표</span><strong>${escape(s.objective.title)}</strong><p>${escape(s.objective.progress)}</p></div></div><div class="side-quests"><span class="eyebrow">STORIES ALONG THE WAY</span><h3>별길 위의 작은 이야기</h3>${this.optionalQuests(s)}</div></div>`, 'journal-panel');
  }

  private shop(s: UiSnapshot) {
    const p = s.state.player;
    const stock = Object.values(ITEMS).filter(item => item.price && item.kind !== 'quest');
    return this.frame('THE WANDERING MERCHANT', '로엔의 작은 상점', `<div class="shop-intro"><p>“좋은 장비는 돌아올 길도 지켜 주는 법이지.”</p><span>${icon('coin')} ${number(p.gold)} <small>GOLD</small></span></div><div class="shop-grid"><article class="shop-item potion-item"><div class="shop-item-icon">${icon('potion')}</div><div><span class="eyebrow">CONSUMABLE</span><h3>별빛 회복 물약</h3><p>체력과 마나를 회복합니다.</p><small>현재 보유 ${p.potions}개</small></div>${btn('buy', `${icon('coin')} 25 <span>구매</span>`, 'shop-buy', 'potion', p.gold < 25)}</article>${stock.map(item => {
      const owned = p.inventory.includes(item.id);
      return `<article class="shop-item ${item.rarity}"><div class="shop-item-icon">${icon(itemIcon(item))}</div><div><span class="eyebrow">${rarity[item.rarity]} · ${item.kind === 'quest' ? '파편' : slots[item.kind]}</span><h3>${escape(item.name)}</h3><p>${escape(item.description)}</p><small>${itemStats(item)}</small></div>${btn('buy', owned ? '보유 중' : `${icon('coin')} ${item.price} <span>구매</span>`, 'shop-buy', item.id, owned || p.gold < item.price!)}</article>`;
    }).join('')}</div>`, 'shop-panel');
  }

  private settings(s: UiSnapshot) {
    const settings = s.state.settings;
    const slider = (key: 'music' | 'effects' | 'ambience' | 'sensitivity', title: string, text: string, min: number, max: number, step: number) => `<label class="setting-row"><span><strong>${title}</strong><small>${text}</small></span><div class="slider-control"><input aria-label="${title}" type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}" data-setting="${key}"><output data-output="${key}">${key === 'sensitivity' ? `${settings[key].toFixed(1)}×` : `${Math.round(settings[key] * 100)}%`}</output></div></label>`;
    return this.frame('MAKE THIS WORLD YOURS', '환경 설정', `<div class="settings-body"><h3 class="section-label">소리</h3>${slider('music', '배경 음악', '지역의 선율과 분위기 · 0%에서 음소거', 0, 1, .05)}${slider('effects', '효과음', '전투, 발걸음과 상호작용 · 0%에서 음소거', 0, 1, .05)}${slider('ambience', '환경음', '바람과 지역의 자연 소리 · 0%에서 음소거', 0, 1, .05)}<h3 class="section-label settings-section">화면과 조작</h3><label class="setting-row"><span><strong>그래픽 품질</strong><small>그림자와 렌더링 해상도</small></span><select aria-label="그래픽 품질" data-setting="quality"><option value="high"${settings.quality === 'high' ? ' selected' : ''}>높음</option><option value="low"${settings.quality === 'low' ? ' selected' : ''}>성능 우선</option></select></label>${slider('sensitivity', '카메라 감도', '마우스 시점 회전 속도', .3, 2, .1)}<label class="setting-row"><span><strong>화면 흔들림</strong><small>타격과 마법의 충격 효과</small></span><input class="toggle" type="checkbox" aria-label="화면 흔들림" data-setting="shake"${settings.shake ? ' checked' : ''}></label><div class="setting-row"><span><strong>전체 화면</strong><small>넓은 화면으로 여정을 즐기세요</small></span>${btn('fullscreen', '전체 화면 전환', 'small-button')}</div><div class="controls-reference"><h3 class="section-label">모험가의 조작 안내</h3><div><span><kbd>WASD</kbd> 이동</span><span><kbd>Space</kbd> 점프</span><span><kbd>LMB</kbd> 기본 공격</span><span><kbd>RMB</kbd> 방어</span><span><kbd>Shift</kbd> 회피</span><span><kbd>Q</kbd> 별빛 폭발</span><span><kbd>R</kbd> 별의 창 · Lv.3</span><span><kbd>1</kbd> 회복 물약</span><span><kbd>E</kbd> 상호작용</span><span><kbd>I / J</kbd> 소지품 / 여정</span><span><kbd>휠 드래그</kbd> 시점 회전</span><span><kbd>V</kbd> 시점 고정 / 해제</span></div></div></div>`, 'settings-panel');
  }

  private drawMap(s: UiSnapshot) {
    const ctx = this.map.getContext('2d');
    if (!ctx) return;
    const size = this.map.width;
    const center = size / 2;
    const scale = (center - 19) / ZONES[s.zone].radius;
    const x = (world: number) => center + world * scale;
    const y = (world: number) => center + world * scale;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath(); ctx.arc(center, center, center - 5, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = s.zone === 'rift' ? '#202232' : s.zone === 'temple' ? '#28332f' : '#193a35';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#a1b79c14'; ctx.lineWidth = 1;
    for (let offset = 0; offset <= size; offset += 40) { ctx.beginPath(); ctx.moveTo(offset, 0); ctx.lineTo(offset, size); ctx.moveTo(0, offset); ctx.lineTo(size, offset); ctx.stroke(); }
    ctx.strokeStyle = '#b6b3942d'; ctx.lineWidth = s.zone === 'temple' ? 48 : 28;
    ctx.beginPath(); ctx.moveTo(center, size); ctx.lineTo(center, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(center * .35, center * 1.3); ctx.lineTo(center, center); ctx.lineTo(center * 1.65, center * 1.2); ctx.stroke();
    ctx.strokeStyle = '#cfc8a92a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(center, center, center * .76, 0, Math.PI * 2); ctx.stroke();
    for (const object of s.objects) {
      if (object.kind === 'chest' && s.state.world.openedChests.includes(object.id)) continue;
      if (object.id === 'forest-shard' && s.state.quest.forestShard || object.id === 'temple-shard' && s.state.quest.templeShard) continue;
      const ox = x(object.x), oy = y(object.z);
      ctx.fillStyle = object.kind === 'portal' ? '#84d8dc' : object.kind === 'npc' ? '#e6cc87' : object.kind === 'shop' ? '#e9c085' : object.kind === 'rest' ? '#c0f6d5' : object.kind === 'chest' ? '#d8b66a' : '#c3a3f3';
      if (object.kind === 'portal') { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox, oy, 7, 0, Math.PI * 2); ctx.stroke(); }
      else if (object.kind === 'chest') ctx.fillRect(ox - 4, oy - 3, 8, 6);
      else { ctx.beginPath(); ctx.moveTo(ox, oy - 6); ctx.lineTo(ox + 4, oy); ctx.lineTo(ox, oy + 6); ctx.lineTo(ox - 4, oy); ctx.closePath(); ctx.fill(); }
    }
    for (const enemy of s.enemies) {
      if (enemy.hp <= 0) continue;
      ctx.fillStyle = enemy.kind === 'boss' ? '#ff8b93' : '#da817a';
      ctx.beginPath(); ctx.arc(x(enemy.x), y(enemy.z), enemy.kind === 'boss' ? 7 : 3.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.translate(x(s.player.x), y(s.player.z));
    ctx.rotate(-s.heading);
    ctx.shadowColor = '#b0fff0'; ctx.shadowBlur = 9;
    ctx.fillStyle = '#ecfff3'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  private drawEnemyHealth(s: UiSnapshot) {
    const layer = this.refs['enemy-health-layer'];
    layer.hidden = s.screen !== 'play';
    if (layer.hidden) return;
    const visible = new Set<string>();
    for (const enemy of s.enemies) {
      if (enemy.kind === 'boss' || enemy.hp <= 0 || enemy.screenX === undefined || enemy.screenY === undefined) continue;
      if (!Number.isFinite(enemy.screenX) || !Number.isFinite(enemy.screenY)) continue;
      if (enemy.screenX < 22 || enemy.screenX > innerWidth - 22 || enemy.screenY < 20 || enemy.screenY > innerHeight - 70) continue;
      if (enemy.hp >= enemy.maxHp && Math.hypot(enemy.x - s.player.x, enemy.z - s.player.z) > 8) continue;
      visible.add(enemy.id);
      let bar = this.enemyBars.get(enemy.id);
      if (!bar) {
        bar = document.createElement('div');
        bar.className = `enemy-health ${enemy.kind === 'sentinel' ? 'elite' : ''}`;
        bar.setAttribute('role', 'progressbar');
        bar.setAttribute('aria-label', '적 체력');
        bar.setAttribute('aria-valuemin', '0');
        bar.innerHTML = '<span></span>';
        this.enemyBars.set(enemy.id, bar);
        layer.appendChild(bar);
      }
      bar.style.left = `${enemy.screenX}px`;
      bar.style.top = `${enemy.screenY}px`;
      bar.style.opacity = enemy.hp < enemy.maxHp ? '1' : '.68';
      bar.setAttribute('aria-valuemax', String(enemy.maxHp));
      bar.setAttribute('aria-valuenow', String(Math.round(enemy.hp)));
      (bar.firstElementChild as HTMLElement).style.width = `${Math.max(0, Math.min(1, enemy.hp / enemy.maxHp)) * 100}%`;
    }
    for (const [id, bar] of this.enemyBars) {
      if (!visible.has(id)) { bar.remove(); this.enemyBars.delete(id); }
    }
  }

  floating(text: string, x: number, y: number, color = '#f5e8ba') {
    const element = document.createElement('span');
    element.className = 'floating-number'; element.textContent = text;
    element.style.left = `${x}px`; element.style.top = `${y}px`; element.style.color = color;
    this.refs['floating-layer'].appendChild(element);
    const timer = setTimeout(() => { element.remove(); this.floatingTimers.delete(timer); }, 1250);
    this.floatingTimers.add(timer);
  }

  dispose() {
    this.root.removeEventListener('click', this.clickHandler);
    this.root.removeEventListener('input', this.inputHandler);
    this.root.removeEventListener('change', this.inputHandler);
    this.root.removeEventListener('keydown', this.keyHandler);
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    for (const timer of this.floatingTimers) clearTimeout(timer);
    this.enemyBars.clear();
    this.root.innerHTML = '';
  }
}
