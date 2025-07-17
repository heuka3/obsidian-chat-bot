# Obsidian AI Chatbot Plugin

Obsidian에서 AI 챗봇 기능을 제공하는 플러그인입니다. OpenAI와 Gemini API를 지원하며, MCP (Model Context Protocol) 서버와의 통합을 통해 확장 가능한 AI 기능을 제공합니다.

## 주요 기능

### 1. 다중 AI 제공자 지원
- **OpenAI**: GPT-4.1, GPT-4o, GPT-4o-mini 등 다양한 모델 지원
- **Gemini**: Gemini-2.5-flash, Gemini-2.5-pro 등 Google AI 모델 지원
- 실시간 제공자 및 모델 변경 가능

### 2. 노트 멘션 기능 (@mention)
- 채팅 입력시 `@` 입력으로 노트 자동완성 기능
- 최근 편집된 노트 우선 표시
- 노트 검색 및 키보드 네비게이션 지원
- 선택한 노트 정보가 AI 컨텍스트에 자동 포함

#### 사용 방법:
1. 채팅 입력창에서 `@` 입력
2. 노트 목록에서 원하는 노트 선택 (마우스 클릭 또는 키보드 화살표 + Enter)
3. 선택한 노트가 AI 시스템 컨텍스트에 포함되어 해당 노트 관련 질문 가능

### 3. MCP (Model Context Protocol) 서버 통합
- 외부 MCP 서버와 연결하여 AI 기능 확장
- Function Calling을 통한 동적 도구 사용
- 서버별 도구 관리 및 실행

### 4. 대화 관리
- 대화 내역 저장 및 로드
- 개별 메시지 쌍 삭제
- 대화 내역 초기화
- 마크다운 렌더링 지원

### 5. 사용자 친화적 UI
- 실시간 메시지 입력 (Enter 전송, Shift+Enter 줄바꿈)
- 자동 높이 조절 입력창
- 메시지 복사 기능
- 반응형 디자인

## 설정

### 1. API 키 설정
플러그인 설정에서 다음 API 키를 설정하세요:
- OpenAI API Key (OpenAI 사용시)
- Gemini API Key (Google AI 사용시)

### 2. 볼트 이름 요구사항
⚠️ **중요**: Gemini 서비스를 사용하려면 볼트 이름이 다음 조건을 만족해야 합니다:
- 영어 소문자만 사용
- 공백 없음
- 특수문자는 하이픈(-) 만 허용
- 예: `my-vault`, `obsidian-notes`

### 3. MCP 서버 설정 (선택사항)
Gemini 제공자 사용시 MCP 서버를 설정하여 AI 기능을 확장할 수 있습니다:

```json
{
  "name": "example-server",
  "command": "node",
  "args": ["path/to/server.js"],
  "env": {
    "API_KEY": "your-api-key"
  }
}
```

## 키보드 단축키

### 채팅 입력
- `Enter`: 메시지 전송
- `Shift + Enter`: 줄바꿈
- `Escape`: 노트 자동완성 숨기기

### 노트 자동완성
- `@`: 노트 자동완성 표시
- `↑/↓`: 노트 목록 네비게이션
- `Enter`: 선택한 노트 삽입
- `Escape`: 자동완성 닫기

## 개발 상태

### 완료된 기능
- ✅ 기본 AI 챗봇 UI 구현
- ✅ OpenAI 및 Gemini API 통합
- ✅ MCP 서버 통합
- ✅ 노트 멘션 기능 (@mention)
- ✅ 대화 관리 (저장, 삭제, 초기화)
- ✅ 설정 관리 및 유효성 검사
- ✅ 반응형 UI 및 키보드 지원

### 향후 개선 사항
- 📋 플러그인 설정 탭 직접 열기
- 🔍 노트 내용 미리보기
- 🏷️ 태그 기반 노트 필터링
- 📊 대화 통계 및 분석

## 기술 스택
- TypeScript
- Obsidian API
- Google GenerativeAI SDK
- OpenAI API
- Model Context Protocol (MCP)
- esbuild

## 라이선스
MIT License