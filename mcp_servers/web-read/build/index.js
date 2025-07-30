#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';
import TurndownService from 'turndown';
// vertexaisearch.cloud.google.com 중개 URL을 실제 URL로 변환 (HEAD 요청)
async function resolveFinalUrlHead(groundingUrl) {
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
export async function urlToMarkdown(url) {
    try {
        let resolvedURL = "";
        // url에 vertexaisearch.cloud.google.com이 포함되어 있으면 실제 URL로 변환
        if (url.includes('vertexaisearch.cloud.google.com')) {
            console.log('Resolving URL from vertexaisearch.cloud.google.com...');
            try {
                const resolved = await resolveFinalUrlHead(url);
                if (resolved && resolved !== url) {
                    resolvedURL = resolved;
                    console.log(`Resolved URL: ${resolvedURL}`);
                }
            }
            catch (e) {
                // 변환 실패 시 원래 url 사용
            }
        }
        let html = await fetchHtml(url);
        // HTML 전처리 - 불필요한 요소들 제거
        html = cleanHtml(html);
        // DOM 파싱 및 메인 컨텐츠 추출
        const dom = new JSDOM(html);
        const mainContent = extractMainContent(dom.window.document);
        // Turndown을 사용하여 HTML을 Markdown으로 변환
        const turndownService = createTurndownService();
        let markdown = turndownService.turndown(mainContent);
        // 두 번 이상 연속된 개행을 한 번으로 치환
        markdown = markdown.replace(/\n{2,}/g, '\n');
        // resolvedURL이 있으면 마크다운의 헤더/Source 부분을 새로 작성
        let headerBlock = '';
        if (resolvedURL) {
            const generatedDate = new Date().toISOString();
            headerBlock = `# ${resolvedURL}\n\nSource: ${resolvedURL}\nGenerated: ${generatedDate}\n\n---\n`;
        }
        else {
            const generatedDate = new Date().toISOString();
            headerBlock = `# ${url}\n\nSource: ${url}\nGenerated: ${generatedDate}\n\n---\n`;
        }
        markdown = headerBlock + markdown.trim();
        return { markdown: markdown.trim(), resolvedURL: resolvedURL ? resolvedURL : url };
    }
    catch (error) {
        throw new Error(`Failed to convert URL to markdown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
// HTML 가져오기 (정적/동적 페이지 자동 판단)
async function fetchHtml(url) {
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
        isDynamic = dynamicIndicators.some(indicator => lowerHtml.includes(indicator.toLowerCase()));
        const textContent = html.replace(/<[^>]*>/g, '').trim();
        if (textContent.length < 500 && html.includes('<script')) {
            isDynamic = true;
        }
    }
    catch (fetchError) {
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
async function fetchWithPuppeteer(url) {
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
            }
            else {
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
    }
    finally {
        await browser.close();
    }
}
// HTML 전처리 함수 - 불필요한 태그들 완전 제거
function cleanHtml(html) {
    const tagsToRemove = [
        'script', 'style', 'noscript', 'iframe', 'embed', 'object',
        'form', 'input', 'button', 'select', 'textarea',
        'svg', 'canvas', 'video', 'audio', 'img', 'picture', 'source', 'track'
    ];
    let cleaned = html;
    // 태그와 내용 모두 제거
    tagsToRemove.forEach(tag => {
        const regex = new RegExp(`<${tag}[^>]*>.*?<\/${tag}>`, 'gis');
        cleaned = cleaned.replace(regex, '');
        // 자체 닫힘 태그도 제거
        const selfClosingRegex = new RegExp(`<${tag}[^>]*\/?>`, 'gi');
        cleaned = cleaned.replace(selfClosingRegex, '');
    });
    // a 태그는 내용만 유지하고 태그는 제거
    cleaned = cleaned.replace(/<a[^>]*>(.*?)<\/a>/gis, '$1');
    // 주석 제거
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
    return cleaned;
}
// Turndown 서비스 설정
function createTurndownService() {
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
    // 표 전체: 헤더와 구분선 자동 추가
    turndownService.addRule('tables', {
        filter: ['table'],
        replacement: function (content, node) {
            // 표의 행 추출
            const rows = Array.from(node.querySelectorAll('tr'));
            if (rows.length === 0)
                return '';
            // 첫 번째 행이 헤더인지 확인
            const headerCells = Array.from(rows[0].children).filter(child => child.nodeName === 'TH' || child.nodeName === 'TD');
            const header = headerCells.map(cell => cell.textContent?.trim() || '');
            const headerLine = '| ' + header.join(' | ') + ' |';
            const separatorLine = '| ' + header.map(() => '---').join(' | ') + ' |';
            // 나머지 행들
            const bodyLines = rows.slice(1).map(row => {
                const cells = Array.from(row.children).filter(child => child.nodeName === 'TD' || child.nodeName === 'TH');
                const cellTexts = cells.map(cell => cell.textContent?.trim() || '');
                return '| ' + cellTexts.join(' | ') + ' |';
            }).filter(line => line.replace(/\|/g, '').trim().length > 0);
            return '\n' + headerLine + '\n' + separatorLine + '\n' + bodyLines.join('\n') + '\n';
        }
    });
    // 표 행/셀 규칙 제거 (tables에서 직접 처리)
    return turndownService;
}
// 메인 컨텐츠 추출 함수
function extractMainContent(document) {
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
        '#article'
    ];
    // 메인 컨텐츠 찾기
    for (const selector of mainSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent && element.textContent.trim().length > 200) {
            return element.outerHTML;
        }
    }
    // 메인 컨텐츠를 찾지 못했으면 body에서 불필요한 부분 제거 후 사용
    const body = document.body;
    if (body) {
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
        return body.outerHTML;
    }
    return document.documentElement.outerHTML;
}
// Define a tool that converts web pages to markdown
server.tool('web-to-markdown', 'Tool to convert a web page URL to markdown format', {
    url: z.string().url().describe("The URL of the web page to convert to markdown")
}, async ({ url }) => {
    try {
        const { markdown, resolvedURL } = await urlToMarkdown(url);
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
