"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.get_wiki_content = get_wiki_content;
exports.get_wiki_intro = get_wiki_intro;
exports.get_wiki_summary = get_wiki_summary;
exports.get_wiki_search = get_wiki_search;
// 전체적인 flow: 
// 1. mcp서버에서 쿼리를 포함한 요청이 들어옴
// 2. 쿼리를 기반으로 get_wiki_search 함수를 호출
// 3. 검색 결과에 해당하는 검색 키워드 확인
// 4. 검색 키워드를 기반으로 get_wiki_content 함수 호출
// 5. 결과 반환
// 확인해봐야 할 것:
// - get_wiki_search, get_wiki_content, get_wiki_intro, get_wiki_summary 함수가 각각 어떤 결과들을 반환하는지 확인해봐야함
async function get_wiki_content(query) {
    const wiki = require('wikipedia');
    try {
        const page = await wiki.page(query);
        const content = await page.content();
        console.log(`Content for ${query}:`, content);
        return content;
    }
    catch (error) {
        console.error(`Error fetching content for ${query}:`, error);
        throw error;
    }
}
async function get_wiki_intro(query) {
    const wiki = require('wikipedia');
    try {
        const page = await wiki.page(query);
        const intro = await page.intro();
        console.log(`Intro for ${query}:`, intro);
        return intro;
    }
    catch (error) {
        console.error(`Error fetching intro for ${query}:`, error);
        throw error;
    }
}
async function get_wiki_summary(query) {
    const wiki = require('wikipedia');
    try {
        const page = await wiki.page(query);
        const summary = await page.summary();
        console.log(`Summary for ${query}:`, summary);
        return summary;
    }
    catch (error) {
        console.error(`Error fetching summary for ${query}:`, error);
        throw error;
    }
}
async function get_wiki_search(query) {
    const wiki = require('wikipedia');
    const searchOptions = {
        limit: 10,
        suggestion: true
    };
    try {
        const searchResults = await wiki.search(query, searchOptions);
        console.log(`Search results for ${query}:`, searchResults);
        return searchResults;
    }
    catch (error) {
        console.error(`Error fetching search results for ${query}:`, error);
        throw error;
    }
}
