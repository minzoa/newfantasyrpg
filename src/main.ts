import './style.css';
import { Game } from './game';

const canvas=document.querySelector<HTMLCanvasElement>('#game')!;
const root=document.querySelector<HTMLElement>('#ui')!;
try {
  const game=new Game(canvas,root);
  if(import.meta.env.DEV && new URLSearchParams(location.search).has('test')) {
    (window as unknown as {__ASTRALIA_TEST__:ReturnType<Game['testing']>}).__ASTRALIA_TEST__=game.testing();
  }
  if(import.meta.hot)import.meta.hot.dispose(()=>game.dispose());
} catch(error) {
  console.error(error);
  root.innerHTML='<main class="fatal-error"><h1>별빛을 불러오지 못했습니다</h1><p>WebGL 2를 지원하는 데스크톱 브라우저에서 하드웨어 가속을 켜고 다시 실행해 주세요.</p><button id="reload">다시 시도</button></main>';
  document.querySelector('#reload')?.addEventListener('click',()=>location.reload());
}
