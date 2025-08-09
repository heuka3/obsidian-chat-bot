import { 
    get_wiki_content, 
    get_wiki_intro, 
    get_wiki_summary, 
    get_wiki_search 
} from '../src/index.js';

async function testWikipediaFunctions(query: string) {
    console.log(`\n=== Testing Wikipedia functions with query: "${query}" ===\n`);
    
    try {
        // 1. 검색 결과 테스트
        console.log('1. Testing get_wiki_search...');
        console.log('-----------------------------------');
        const searchResults = await get_wiki_search(query);
        console.log('Search Results:');
        console.log('- Results found:', searchResults.results?.length || 0);
        console.log('- Suggestion:', searchResults.suggestion || 'None');
        if (searchResults.results && searchResults.results.length > 0) {
            console.log('- All results:');
            searchResults.results.forEach((result, index) => {
                console.log(`  ${index + 1}. ${result.title}`);
                console.log(`     ${result.snippet || 'No snippet'}`);
            });
        }
        
        const testTitle = searchResults.results?.[0]?.title || query;
        
        // 검색 결과가 있으면 첫 번째 결과로 나머지 함수들 테스트
        console.log('\n2. Testing get_wiki_intro...');
        console.log('-----------------------------------');
        try {
            const intro = await get_wiki_intro(testTitle);
            console.log('Intro length:', intro.length);
            console.log('First 200 characters:', intro.substring(0, 200) + '...');
        } catch (error) {
            console.error('Error in get_wiki_intro:', error);
        }
        
        console.log('\n3. Testing get_wiki_summary...');
        console.log('-----------------------------------');
        try {
            const summary = await get_wiki_summary(testTitle);
            console.log('Summary length:', summary.length);
            console.log('First 200 characters:', summary.substring(0, 200) + '...');
        } catch (error) {
            console.error('Error in get_wiki_summary:', error);
        }
        
        console.log('\n4. Testing get_wiki_content...');
        console.log('-----------------------------------');
        try {
            const content = await get_wiki_content(testTitle);
            console.log('Content length:', content.length);
            console.log('First 300 characters:', content.substring(0, 300) + '...');
        } catch (error) {
            console.error('Error in get_wiki_content:', error);
        }
        
    } catch (error) {
        console.error('Error in main test function:', error);
    }
}

// 메인 실행 함수
async function main() {
    const query = process.argv[2] || 'What is the most important thing in life?';
    
    console.log('Wikipedia Functions Test');
    console.log('======================');
    console.log('Usage: npm run test [query]');
    console.log('Example: npm run test "Machine Learning"');
    
    await testWikipediaFunctions(query);
    
    console.log('\n=== Test completed ===');
}

// 스크립트가 직접 실행될 때만 main 함수 실행
if (require.main === module) {
    main().catch(console.error);
}

export { testWikipediaFunctions };
