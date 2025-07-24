import { GoogleGenAI } from "@google/genai";

export interface GoogleSearchResult {
    title: string;
    url: string;
    snippet: string;
}

export interface GoogleSearchResponse {
    query: string;
    results: GoogleSearchResult[];
    total_results: number;
}

export class GoogleSearchService {
    private genAI: GoogleGenAI;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenAI({ apiKey: apiKey });
    }

    async search(query: string, numResults: number = 5): Promise<GoogleSearchResponse> {
        try {
            console.log(`🔍 Google Search 실행: "${query}"`);
            
            // Google Search grounding tool 설정
            const groundingTool = {
                googleSearch: {},
            };

            const config = {
                tools: [groundingTool],
            };

            // Gemini의 Google Search grounding 기능 사용
            const response = await this.genAI.models.generateContent({
                model: "gemini-2.5-flash",
                contents: query,
                config,
            });

            // grounding metadata에서 검색 결과 추출
            const candidate = response.candidates?.[0];
            const groundingMetadata = candidate?.groundingMetadata;
            const groundingChunks = groundingMetadata?.groundingChunks || [];
            const groundingSupports = groundingMetadata?.groundingSupports || [];
            const responseText = candidate?.content?.parts?.[0]?.text || response.text || "";
            
            const results: GoogleSearchResult[] = [];

            // grounding chunks에서 웹 결과 추출
            for (let i = 0; i < Math.min(groundingChunks.length, numResults); i++) {
                const chunk = groundingChunks[i];
                if (chunk.web?.uri && chunk.web?.title) {
                    // 해당 chunk를 참조하는 text segment 찾기
                    const relatedSupport = groundingSupports.find(support => 
                        support.groundingChunkIndices?.includes(i)
                    );
                    
                    const snippet = relatedSupport?.segment?.text || 
                                  responseText.substring(0, 200) || 
                                  "검색 결과 요약";

                    results.push({
                        title: chunk.web.title,
                        url: chunk.web.uri,
                        snippet: snippet
                    });
                }
            }

            // 결과가 없으면 응답 텍스트를 기반으로 기본 결과 생성
            if (results.length === 0 && responseText) {
                results.push({
                    title: "Google Search 결과",
                    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                    snippet: responseText.substring(0, 300) || "검색 결과를 찾았습니다."
                });
            }

            const searchResult: GoogleSearchResponse = {
                query: query,
                results: results,
                total_results: results.length
            };

            console.log(`✅ Google Search 완료: ${searchResult.results.length}개 결과`);
            return searchResult;
            
        } catch (error) {
            console.error("Google Search 실행 실패:", error);
            
            // 폴백: 기본 응답 반환
            return {
                query: query,
                results: [{
                    title: "검색 결과를 가져올 수 없습니다",
                    url: "https://www.google.com/search?q=" + encodeURIComponent(query),
                    snippet: "인터넷 검색 기능에 문제가 발생했습니다. 직접 검색해보세요."
                }],
                total_results: 0
            };
        }
    }

    // 검색 결과를 텍스트로 변환
    formatSearchResults(searchResponse: GoogleSearchResponse): string {
        const results = searchResponse.results.map((result, index) => {
            return `${index + 1}. ${result.title}
   URL: ${result.url}
   요약: ${result.snippet}`;
        }).join('\n\n');

        return `검색어: "${searchResponse.query}"\n총 ${searchResponse.total_results}개 결과\n\n${results}`;
    }
}
