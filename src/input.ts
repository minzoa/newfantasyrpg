export class Input {
  readonly keys = new Set<string>();
  private pressed = new Set<string>();
  attack = false;
  guard = false;
  orbit = false;
  deltaX = 0;
  deltaY = 0;
  zoom = 0;
  pointerX = 0;
  pointerY = 0;
  pointerUsed = false;
  private abort = new AbortController();
  private wasLocked=false;
  private releaseRequested=false;

  constructor(readonly canvas: HTMLCanvasElement, private onPause: () => void) {
    const options = { signal: this.abort.signal };
    window.addEventListener('keydown', event => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) event.preventDefault();
      if (!this.keys.has(event.code)) this.pressed.add(event.code);
      this.keys.add(event.code);
    }, options);
    window.addEventListener('keyup', event => this.keys.delete(event.code), options);
    canvas.addEventListener('pointerdown', event => {
      if(event.button === 0) {this.attack = true; this.pressed.add('Attack');}
      if(event.button === 2) this.guard = true;
      if(event.button === 1) {this.orbit = true; event.preventDefault();}
      this.pointerX = event.clientX; this.pointerY = event.clientY;
    }, options);
    window.addEventListener('pointerup', event => {
      if(event.button === 0) this.attack = false;
      if(event.button === 2) this.guard = false;
      if(event.button === 1) this.orbit = false;
    }, options);
    window.addEventListener('pointermove', event => {
      this.pointerX = event.clientX; this.pointerY = event.clientY; this.pointerUsed = true;
      if(document.pointerLockElement === canvas || this.orbit) {
        this.deltaX += event.movementX; this.deltaY += event.movementY;
      }
    }, options);
    canvas.addEventListener('wheel', event => {this.zoom += event.deltaY * 0.008; event.preventDefault();}, {...options,passive:false});
    canvas.addEventListener('contextmenu', event => event.preventDefault(), options);
    window.addEventListener('blur', () => {this.clear(); this.onPause();}, options);
    document.addEventListener('visibilitychange', () => {if(document.hidden) {this.clear(); this.onPause();}}, options);
    document.addEventListener('pointerlockchange', () => {
      const locked=document.pointerLockElement===canvas;
      if(!locked){this.clear();if(this.wasLocked&&!this.releaseRequested)this.onPause();}
      this.wasLocked=locked;this.releaseRequested=false;
    }, options);
  }
  take(code: string) { const result = this.pressed.has(code); this.pressed.delete(code); return result; }
  clear() {this.keys.clear(); this.pressed.clear(); this.attack=false; this.guard=false; this.orbit=false; this.deltaX=0;this.deltaY=0;}
  flush() {this.pressed.clear();this.deltaX=0;this.deltaY=0;this.zoom=0;}
  toggleLock() {
    if(document.pointerLockElement){this.releaseRequested=true;document.exitPointerLock();}
    else this.canvas.requestPointerLock()?.catch(() => {});
  }
  dispose() {this.abort.abort();this.clear();}
}
