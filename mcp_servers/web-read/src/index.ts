#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {JSDOM} from 'jsdom';
import puppeteer from 'puppeteer';
import TurndownService from 'turndown';
import { Readability } from "@mozilla/readability";

// vertexaisearch.cloud.google.com 중개 URL을 실제 URL로 변환 (HEAD 요청)
async function resolveFinalUrlHead(groundingUrl: string): Promise<string> {
  const response = await fetch(groundingUrl, {
    method: "HEAD",
    redirect: "follow"
  });
  return response.url;
}

// Create the MCP server instance
const server = new McpServer({
  name: "Web Read Server",
  version: "1.0.0"
});


export async function urlToMarkdown(url: string): Promise<{ markdown: string, resolvedURL: string }> {
  try {
    let resolvedURL: string = "";
    // url에 vertexaisearch.cloud.google.com이 포함되어 있으면 실제 URL로 변환
    if (url.includes('vertexaisearch.cloud.google.com')) {
      console.log('Resolving URL from vertexaisearch.cloud.google.com...');
      try {
        const resolved = await resolveFinalUrlHead(url);
        if (resolved && resolved !== url) {
          resolvedURL = resolved;
          console.log(`Resolved URL: ${resolvedURL}`);
        }
      } catch (e) {
        // 변환 실패 시 원래 url 사용
      }
    }

    let html = '';
    if (resolvedURL) {
      console.log(`Fetching HTML from resolved URL: ${resolvedURL}`);
      html = await fetchHtml(resolvedURL);
    } else {
      console.log(`Fetching HTML from original URL: ${url}`);
      html = await fetchHtml(url);
    }

    // DOM 파싱
    const doc = new JSDOM(html);
    const reader = new Readability(doc.window.document);
    const article = reader.parse();

    // Turndown을 사용하여 HTML을 Markdown으로 변환
    const turndownService = createTurndownService();
    let markdown = '';
    if (article?.content) {
      markdown = turndownService.turndown(article.content);
    } else {
      markdown = article?.textContent || '';
    }

    // 두 번 이상 연속된 개행을 한 번으로 치환
    markdown = markdown.replace(/\n{2,}/g, '\n');

    return {markdown: markdown!.trim(), resolvedURL: resolvedURL ? resolvedURL : url};
  } catch (error) {
    throw new Error(`Failed to convert URL to markdown: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// HTML 가져오기 (정적/동적 페이지 자동 판단)
async function fetchHtml(url: string): Promise<string> {
  let html = '';
  let isDynamic = false;
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    html = await res.text();
    
    // 동적 페이지 감지
    const dynamicIndicators = [
      'react', 'vue', 'angular', 'ng-app', 'ng-version',
      '__NEXT_DATA__', '_app', 'nuxt', 'gatsby',
      'data-reactroot', 'data-vue', 'spa-loading',
      'id="root"', 'id="app"', 'id="__nuxt"'
    ];
    
    const lowerHtml = html.toLowerCase();
    isDynamic = dynamicIndicators.some(indicator => 
      lowerHtml.includes(indicator.toLowerCase())
    );
    
    const textContent = html.replace(/<[^>]*>/g, '').trim();
    if (textContent.length < 500 && html.includes('<script')) {
      isDynamic = true;
    }
  } catch (fetchError) {
    isDynamic = true;
  }
  
  // 동적 페이지인 경우 Puppeteer 사용
  if (isDynamic) {
    console.log('Dynamic page detected, using Puppeteer...');
    html = await fetchWithPuppeteer(url);
  }

  if (!html) {
    throw new Error('Failed to retrieve HTML content from the URL');
  }

  return html;
}

// Puppeteer로 동적 페이지 처리
async function fetchWithPuppeteer(url: string): Promise<string> {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // 불필요한 리소스 차단
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['stylesheet', 'font', 'image', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // 페이지에서 불필요한 요소들 제거
    await page.evaluate(() => {
      // 제거할 요소들
      const unwantedSelectors = [
        'nav', 'header', 'footer', 'aside', 'sidebar',
        '.nav', '.navbar', '.navigation', '.menu',
        '.header', '.footer', '.sidebar', '.aside',
        '.advertisement', '.ad', '.ads', '.banner',
        '.social', '.share', '.sharing',
        '.cookie', '.popup', '.modal',
        '.newsletter', '.subscription',
        '.related', '.recommended', '.suggestions',
        '.comments', '.comment-section',
        '[class*="nav"]', '[class*="menu"]',
        '[class*="ad"]', '[class*="banner"]',
        '[id*="nav"]', '[id*="menu"]',
        '[id*="ad"]', '[id*="banner"]'
      ];
      
      unwantedSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      });
      
      // 미디어 및 스크립트 요소 제거
      const tagsToRemove = [
        'img', 'video', 'audio', 'picture', 'source', 'track',
        'script', 'style', 'noscript', 'iframe', 'embed', 'object'
      ];
      
      tagsToRemove.forEach(tag => {
        const elements = document.querySelectorAll(tag);
        elements.forEach(el => el.remove());
      });
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await page.content();
  } finally {
    await browser.close();
  }
}

// Turndown 서비스 설정
function createTurndownService(): TurndownService {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined'
  });

  // 링크는 텍스트만 유지
  turndownService.addRule('links', {
    filter: 'a',
    replacement: function (content) {
      return content;
    }
  });

  // 이미지 완전 제거
  turndownService.addRule('images', {
    filter: 'img',
    replacement: function () {
      return '';
    }
  });

  // ========================
  // 유틸리티 (테이블 변환용)
  // ========================
  function isHidden(el: Element | null): boolean {
    if (!el) return false;
    if (el.hasAttribute('hidden')) return true;
    const style = (el.getAttribute('style') || '').toLowerCase();
    return /display\s*:\s*none/.test(style);
  }

  function mdFromCell(cell: Element): string {
    // 셀 내부의 마크업을 turndown으로 변환 (링크/강조/코드 등 보존)
    let md = turndownService.turndown((cell as HTMLElement).innerHTML || '').trim();
    
    // 불필요한 UI 요소 제거
    md = md.replace(/\[\s*펼치기[^]]*접기\s*\]/g, '');
    md = md.replace(/\[\s*접기[^]]*펼치기\s*\]/g, '');
    
    // GFM 테이블 안전화: 파이프 이스케이프 
    md = md.replace(/\|/g, '\\|');
    
    // 줄바꿈 처리: 연속된 줄바꿈을 하나로 줄이고, 공백으로 치환
    md = md.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    
    // 셀 내용 길이 제한 (너무 긴 내용은 축약)
    if (md.length > 100) {
      md = md.substring(0, 97) + '...';
    }
    
    return md;
  }

  function getAlign(cell: Element): 'left' | 'center' | 'right' {
    const alignAttr = (cell.getAttribute('align') || '').toLowerCase();
    const style = (cell.getAttribute('style') || '').toLowerCase();
    const match = style.match(/text-align\s*:\s*(left|center|right)/);
    const align = (alignAttr || (match ? match[1] : '')) as 'left' | 'center' | 'right' | '';
    if (align === 'center') return 'center';
    if (align === 'right') return 'right';
    return 'left';
  }

  function alignToSep(align: 'left' | 'center' | 'right'): string {
    // GFM: --- | :--- | :---: | ---:
    if (align === 'center') return ':---:';
    if (align === 'right') return '---:';
    return ':---'; // 왼쪽 정렬 (가독성 위해 :--- 채택)
  }

  type GridCell = { el: Element; align: 'left' | 'center' | 'right' };

  // colspan/rowspan을 확장하여 2D 그리드 구성
  function tableToGrid(table: Element): GridCell[][] {
    const grid: GridCell[][] = [];
    const trs = Array.from(table.querySelectorAll('tr')).filter(tr => !isHidden(tr));

    trs.forEach((tr, rIndex) => {
      grid[rIndex] = grid[rIndex] || [];
      let cIndex = 0;

      // 이미 채워진 칸 건너뛰기
      while (grid[rIndex][cIndex] !== undefined) cIndex++;

      const cells = Array.from(tr.children).filter(td =>
        (td.nodeName === 'TD' || td.nodeName === 'TH') && !isHidden(td)
      );

      cells.forEach(td => {
        // 현재 행에서 비어있는 다음 칸 찾기
        while (grid[rIndex][cIndex] !== undefined) cIndex++;

        const colspan = Math.max(parseInt(td.getAttribute('colspan') || '1', 10) || 1, 1);
        const rowspan = Math.max(parseInt(td.getAttribute('rowspan') || '1', 10) || 1, 1);

        const cell: GridCell = {
          el: td,
          align: getAlign(td)
        };

        // 가로 확장
        for (let i = 0; i < colspan; i++) {
          grid[rIndex][cIndex + i] = cell;
        }

        // 세로 확장(rowspan): 아래 행에도 같은 참조를 배치
        for (let j = 1; j < rowspan; j++) {
          const rr = rIndex + j;
          grid[rr] = grid[rr] || [];
          for (let i = 0; i < colspan; i++) {
            grid[rr][cIndex + i] = cell;
          }
        }

        cIndex += colspan;
      });
    });

    return grid;
  }

  function computeColumnAligns(grid: GridCell[][]): Array<'left' | 'center' | 'right'> {
    const colCount = Math.max(...grid.map(row => row.length));
    const aligns: Array<'left' | 'center' | 'right'> = new Array(colCount).fill('left') as any;

    for (let c = 0; c < colCount; c++) {
      // center > right > left 우선
      for (let r = 0; r < grid.length; r++) {
        const cell = grid[r][c];
        if (cell?.align === 'center') {
          aligns[c] = 'center';
          break;
        }
      }
      if (aligns[c] === 'left') {
        for (let r = 0; r < grid.length; r++) {
          const cell = grid[r][c];
          if (cell?.align === 'right') {
            aligns[c] = 'right';
            break;
          }
        }
      }
    }
    return aligns;
  }

  // ========================
  // 테이블 규칙
  // ========================
  turndownService.addRule('tables', {
    filter: ['table'],
    replacement: function (_content: string, node: Node): string {
      const table = node as HTMLTableElement;

      // 테이블 필터링: 너무 작거나 레이아웃용 테이블 제외
      const rows = Array.from(table.querySelectorAll('tr')).filter(tr => !isHidden(tr));
      if (rows.length < 2) return ''; // 최소 2행 이상
      
      // 데이터 테이블 여부 확인
      const hasDataCells = rows.some(row => {
        const cells = Array.from(row.children).filter(cell => 
          (cell.nodeName === 'TD' || cell.nodeName === 'TH') && !isHidden(cell)
        );
        return cells.length >= 2 && cells.some(cell => {
          const text = cell.textContent?.trim() || '';
          return text.length > 0 && !text.includes('펼치기') && !text.includes('접기');
        });
      });
      
      if (!hasDataCells) return ''; // 의미있는 데이터가 없으면 건너뛰기

      // 캡션(있으면 이탤릭으로 표 위에 표시)
      const captionEl = table.querySelector('caption');
      const caption = captionEl ? turndownService.turndown(captionEl.innerHTML || '').trim() : '';

      // span 확장 그리드 생성
      const grid = tableToGrid(table);
      if (!grid.length) return '';

      // 헤더 행 결정: thead 우선, 없으면 첫 행에 TH 있으면 헤더
      let headerRowIndex = -1;
      const visibleTrs = Array.from(table.querySelectorAll('tr')).filter(tr => !isHidden(tr));
      const theadTr = table.querySelector('thead tr');
      if (theadTr) {
        const idx = visibleTrs.indexOf(theadTr as HTMLTableRowElement);
        if (idx >= 0) headerRowIndex = idx;
      } else {
        const firstRow = visibleTrs[0];
        if (firstRow && firstRow.querySelector('th')) headerRowIndex = 0;
      }

      const colCount = Math.max(...grid.map(row => row.length));
      if (colCount > 10) return ''; // 너무 많은 컬럼은 레이아웃용일 가능성

      // 같은 셀을 여러 칸에서 참조할 수 있으므로 결과 캐시
      const cache = new WeakMap<GridCell, string>();
      const getCellText = (cell?: GridCell): string => {
        if (!cell) return '';
        if (cache.has(cell)) return cache.get(cell)!;
        const md = mdFromCell(cell.el);
        cache.set(cell, md);
        return md;
      };

      // 헤더 라인 (없으면 빈 헤더 강제)
      const headerCells: string[] =
        headerRowIndex >= 0
          ? Array.from({ length: colCount }, (_, i) => getCellText(grid[headerRowIndex][i]) || '')
          : Array.from({ length: colCount }, () => '');

      const headerLine = '| ' + headerCells.map(s => (s || ' ')).join(' | ') + ' |';

      // 정렬 라인
      const aligns = computeColumnAligns(grid);
      const separatorLine = '| ' + aligns.map(a => alignToSep(a)).join(' | ') + ' |';

      // 바디 라인
      const startBody = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
      const bodyLines: string[] = [];
      for (let r = startBody; r < grid.length; r++) {
        const row = grid[r];
        const texts = Array.from({ length: colCount }, (_, c) => getCellText(row[c]) || '');
        
        // 의미있는 데이터가 있는 행만 포함
        const hasData = texts.some(t => {
          const cleanText = t.replace(/\\\|/g, '').replace(/<br>/g, '').trim();
          return cleanText.length > 0 && !cleanText.includes('펼치기') && !cleanText.includes('접기');
        });
        
        if (!hasData) continue;
        bodyLines.push('| ' + texts.join(' | ') + ' |');
      }

      if (bodyLines.length === 0) return ''; // 의미있는 바디 행이 없으면 건너뛰기

      // 최종 출력
      let out = '\n';
      if (caption) out += `*${caption}*\n\n`;
      out += headerLine + '\n' + separatorLine + '\n' + bodyLines.join('\n') + '\n';
      return out;
    }
  });

  // 주의: tr/td/th 개별 규칙을 추가하지 마세요(tables 규칙이 전체 치환)
  // 주의: turndown-plugin-gfm의 table 플러그인을 함께 쓰지 말 것(중복)

  return turndownService;
}


// Define a tool that converts web pages to markdown
server.tool(
  'web-to-markdown',
  'Tool to convert a web page URL to markdown format',
  {
    url: z.string().url().describe("The URL of the web page to convert to markdown")
  },
  async ({ url }) => {
    try {
      const {markdown, resolvedURL} = await urlToMarkdown(url);
      return {
        content: [
          {
            type: "text",
            text: markdown
          },
          {
            type: "text",
            text: resolvedURL
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : 'Failed to convert URL to markdown'}`
          }
        ]
      };
    }
  }
);

// Set up communication over stdio
const transport = new StdioServerTransport();
server.connect(transport);
