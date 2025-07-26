#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { convertHtmlToMarkdown } from 'dom-to-semantic-markdown';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';
// Create the MCP server instance
const server = new McpServer({
    name: "Web Read Server",
    version: "1.0.0"
});
export async function urlToMarkdown(url) {
    try {
        // 먼저 fetch로 시도 (빠른 방법)
        let html = '';
        let isDynamic = false;
        try {
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            html = await res.text();
            // 동적 페이지 감지 - React, Vue, Angular 등의 흔적을 찾음
            const dynamicIndicators = [
                'react', 'vue', 'angular', 'ng-app', 'ng-version',
                '__NEXT_DATA__', '_app', 'nuxt', 'gatsby',
                'data-reactroot', 'data-vue', 'spa-loading',
                'id="root"', 'id="app"', 'id="__nuxt"'
            ];
            const lowerHtml = html.toLowerCase();
            isDynamic = dynamicIndicators.some(indicator => lowerHtml.includes(indicator.toLowerCase()));
            // 페이지 내용이 매우 적거나 JavaScript 의존적인 경우도 동적으로 판단
            const textContent = html.replace(/<[^>]*>/g, '').trim();
            if (textContent.length < 500 && html.includes('<script')) {
                isDynamic = true;
            }
        }
        catch (fetchError) {
            // fetch가 실패하면 Puppeteer로 시도
            isDynamic = true;
        }
        // 동적 페이지이거나 fetch가 실패한 경우 Puppeteer 사용
        if (isDynamic) {
            console.log('Dynamic page detected, using Puppeteer...');
            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            try {
                const page = await browser.newPage();
                // User-Agent 설정으로 봇 차단 우회
                await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
                // 불필요한 리소스 차단으로 성능 향상
                await page.setRequestInterception(true);
                page.on('request', (req) => {
                    const resourceType = req.resourceType();
                    if (['stylesheet', 'font', 'image', 'media'].includes(resourceType)) {
                        req.abort();
                    }
                    else {
                        req.continue();
                    }
                });
                // 페이지 로드 및 JavaScript 실행 대기
                await page.goto(url, {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });
                // 불필요한 요소들 제거
                await page.evaluate(() => {
                    const selectorsToRemove = [
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
                    selectorsToRemove.forEach(selector => {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => el.remove());
                    });
                    // script, style, noscript 태그 제거
                    const unwantedTags = ['script', 'style', 'noscript', 'iframe'];
                    unwantedTags.forEach(tag => {
                        const elements = document.querySelectorAll(tag);
                        elements.forEach(el => el.remove());
                    });
                });
                // 추가로 동적 콘텐츠 로딩을 위해 잠시 대기
                await new Promise(resolve => setTimeout(resolve, 1000));
                // 렌더링된 HTML 가져오기
                html = await page.content();
            }
            finally {
                await browser.close();
            }
        }
        // html이 여전히 비어있다면 에러
        if (!html) {
            throw new Error('Failed to retrieve HTML content from the URL');
        }
        // HTML 전처리 - 불필요한 요소들 제거
        html = cleanHtml(html);
        // 2. parse HTML to DOM
        const dom = new JSDOM(html);
        const document = dom.window.document;
        // 메인 컨텐츠 추출
        const mainContent = extractMainContent(document);
        // 3. convert DOM to Markdown with aggressive cleanup
        const markdown = convertHtmlToMarkdown(mainContent, {
            overrideDOMParser: new dom.window.DOMParser(),
            websiteDomain: new URL(url).origin,
            extractMainContent: true,
        });
        // 마크다운 후처리
        return cleanMarkdown(markdown);
    }
    catch (error) {
        throw new Error(`Failed to convert URL to markdown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
// HTML 전처리 함수
function cleanHtml(html) {
    // 불필요한 태그들 완전 제거
    const tagsToRemove = [
        'script', 'style', 'noscript', 'iframe', 'embed', 'object',
        'form', 'input', 'button', 'select', 'textarea',
        'svg', 'canvas', 'video', 'audio'
    ];
    let cleaned = html;
    tagsToRemove.forEach(tag => {
        const regex = new RegExp(`<${tag}[^>]*>.*?<\/${tag}>`, 'gis');
        cleaned = cleaned.replace(regex, '');
        // 자체 닫힘 태그도 제거
        const selfClosingRegex = new RegExp(`<${tag}[^>]*\/?>`, 'gi');
        cleaned = cleaned.replace(selfClosingRegex, '');
    });
    // 주석 제거
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
    return cleaned;
}
// 메인 컨텐츠 추출 함수
function extractMainContent(document) {
    // 메인 컨텐츠를 담고 있을 가능성이 높은 선택자들 (우선순위 순)
    const mainSelectors = [
        'main',
        '[role="main"]',
        'article',
        '.article',
        '.content',
        '.main-content',
        '.post-content',
        '.entry-content',
        '.page-content',
        '#content',
        '#main-content',
        '#article',
        '.container .content',
        '.wrapper .content'
    ];
    // 제목을 찾기 위한 선택자들
    const titleSelectors = ['h1', 'title', '.title', '.headline', '[class*="title"]'];
    let mainElement = null;
    // 메인 컨텐츠 찾기
    for (const selector of mainSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent && element.textContent.trim().length > 200) {
            mainElement = element;
            break;
        }
    }
    // 메인 컨텐츠를 찾지 못했으면 body에서 불필요한 부분 제거 후 사용
    if (!mainElement) {
        const body = document.body;
        if (body) {
            // 불필요한 요소들 제거
            const unwantedSelectors = [
                'nav', 'header', 'footer', 'aside',
                '.nav', '.navbar', '.navigation', '.menu',
                '.header', '.footer', '.sidebar', '.aside',
                '.advertisement', '.ad', '.ads', '.banner',
                '.social', '.share', '.sharing',
                '.cookie', '.popup', '.modal',
                '.newsletter', '.subscription',
                '.related', '.recommended', '.suggestions',
                '.comments', '.comment-section'
            ];
            unwantedSelectors.forEach(selector => {
                const elements = body.querySelectorAll(selector);
                elements.forEach(el => el.remove());
            });
            mainElement = body;
        }
    }
    if (!mainElement) {
        return document.documentElement.outerHTML;
    }
    // 제목 추가 (메인 컨텐츠에 없는 경우)
    let title = '';
    for (const selector of titleSelectors) {
        const titleElement = document.querySelector(selector);
        if (titleElement && titleElement.textContent) {
            title = titleElement.textContent.trim();
            break;
        }
    }
    // 제목이 메인 컨텐츠에 없으면 추가
    if (title && !mainElement.textContent?.includes(title)) {
        const titleHtml = `<h1>${title}</h1>`;
        return titleHtml + mainElement.outerHTML;
    }
    return mainElement.outerHTML;
}
// 마크다운 후처리 함수
function cleanMarkdown(markdown) {
    let cleaned = markdown;
    // 연속된 빈 줄을 최대 2개로 제한
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    // 불필요한 링크 텍스트 패턴 제거
    const unwantedPatterns = [
        /\[Skip to .*?\]\(.*?\)/gi,
        /\[Menu\]\(.*?\)/gi,
        /\[Home\]\(.*?\)/gi,
        /\[Login\]\(.*?\)/gi,
        /\[Sign up\]\(.*?\)/gi,
        /\[Subscribe\]\(.*?\)/gi,
        /\[Newsletter\]\(.*?\)/gi,
        /\[Cookie.*?\]\(.*?\)/gi,
        /\[Privacy.*?\]\(.*?\)/gi,
        /\[Terms.*?\]\(.*?\)/gi,
    ];
    unwantedPatterns.forEach(pattern => {
        cleaned = cleaned.replace(pattern, '');
    });
    // 단독으로 있는 특수문자들 제거
    cleaned = cleaned.replace(/^[•\-\*\+]\s*$/gm, '');
    // 짧은 줄들 (3글자 이하) 중 의미없는 것들 제거
    cleaned = cleaned.replace(/^.{1,3}$/gm, (match) => {
        if (/^[a-zA-Z\s]*$/.test(match) && !['Yes', 'No', 'OK'].includes(match.trim())) {
            return '';
        }
        return match;
    });
    // 연속된 빈 줄 다시 정리
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    // 앞뒤 공백 제거
    cleaned = cleaned.trim();
    return cleaned;
}
// Define a tool that converts web pages to markdown
server.tool('web-to-markdown', 'Tool to convert a web page URL to markdown format', {
    url: z.string().url().describe("The URL of the web page to convert to markdown")
}, async ({ url }) => {
    try {
        const markdown = await urlToMarkdown(url);
        return {
            content: [
                {
                    type: "text",
                    text: markdown
                }
            ]
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : 'Failed to convert URL to markdown'}`
                }
            ]
        };
    }
});
// Set up communication over stdio
const transport = new StdioServerTransport();
server.connect(transport);
