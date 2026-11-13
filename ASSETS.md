# 에셋 및 의존성 출처

게임의 지형·건축·식생·NPC·캐릭터·몬스터·무기·파티클·SVG 인터페이스는 소스 코드에서 직접 만드는 원본 작업입니다. 사전 제작된 상용 게임 에셋, 다운로드한 모델·이미지·음악·폰트는 사용하지 않습니다. 소리는 Web Audio API로 합성하며, 글꼴은 설치된 시스템 글꼴을 사용합니다.

사용한 오픈소스 라이브러리의 라이선스 전문은 해당 `node_modules` 패키지와 아래 저장소에서 확인할 수 있습니다.

| 의존성 | 용도 | 라이선스 / 출처 |
| --- | --- | --- |
| Three.js | WebGL 3D 렌더링, 메시 병합 | [MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE) |
| Vite | 개발 서버, 빌드 | [MIT](https://github.com/vitejs/vite/blob/main/LICENSE) |
| TypeScript | 타입 검사 | [Apache-2.0](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt) |
| Vitest | 규칙 테스트 | [MIT](https://github.com/vitest-dev/vitest/blob/main/LICENSE) |
| Playwright | 브라우저 검증 | [Apache-2.0](https://github.com/microsoft/playwright/blob/main/LICENSE) |

외부 네트워크 요청은 패키지를 설치할 때 필요합니다. 설치와 빌드가 끝난 게임은 로컬 서버에서 외부 콘텐츠 요청 없이 실행됩니다.
