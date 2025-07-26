# Web URL to Markdown Converter Test

이 테스트 폴더는 `urlToMarkdown` 함수를 사용하여 여러 URL을 마크다운 파일로 변환하는 기능을 테스트합니다.

## 폴더 구조

```
test/
├── urls.txt          # 변환할 URL 목록 (한 줄에 하나씩)
├── process-urls.ts   # TypeScript 처리 스크립트
├── tsconfig.json     # TypeScript 설정
├── package.json      # 의존성 및 스크립트 설정
├── build/            # 빌드된 파일들 (tsc 사용시)
├── output/           # 생성된 마크다운 파일들이 저장되는 폴더
└── README.md         # 이 파일
```

## 사용 방법

### 1. 프로젝트 빌드
먼저 상위 디렉토리에서 프로젝트를 빌드해야 합니다:

```bash
cd ..
npm run build
```

### 2. URL 파일 편집
`urls.txt` 파일을 편집하여 변환하고 싶은 URL들을 추가하세요:

```
https://www.example.com
https://github.com
https://stackoverflow.com
```

### 3. 스크립트 실행

#### 방법 1: 메인 프로젝트에서 실행 (추천)
```bash
# 메인 디렉토리에서
npm run test:process-urls
```

#### 방법 2: 테스트 디렉토리에서 실행
```bash
# test 디렉토리에서
cd test
npm run dev
```

## 개발시 process-urls.ts 수정하기

`process-urls.ts`를 수정하고 바로 실행하려면:
```bash
npm run test:process-urls
```

## 출력

- 각 URL에 대해 별도의 마크다운 파일이 `output/` 폴더에 생성됩니다
- 파일명은 도메인과 경로를 기반으로 안전한 형태로 생성됩니다
- 처리에 실패한 URL은 `ERROR_` 접두사가 붙은 파일로 생성됩니다

## 주의사항

- 서버에 과부하를 주지 않기 위해 각 요청 사이에 2초의 지연시간이 있습니다
- 일부 사이트는 봇 차단 정책으로 인해 처리되지 않을 수 있습니다
- Puppeteer를 사용하는 동적 페이지의 경우 처리 시간이 더 오래 걸릴 수 있습니다
