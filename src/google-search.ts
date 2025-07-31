import { GoogleGenAI } from "@google/genai";
import { GeminiService } from "./gemini-service";

// TODO: 각 url에 대해 마크다운으로 변환하여 그 소스를 제공하는건 mcp 도구를 이용해 구현해보자.

export interface GoogleSearchResult {
    title: string;
    url: string;
    snippet: string;
    pageContent?: string; // MCP로 가져온 웹페이지 마크다운 내용
}

export interface GoogleSearchResponse {
    query: string;
    responseText: string; // 전체 응답 텍스트
    groundResults: GoogleSearchResult[];
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

            // grounding chunks에서 웹 결과 추출 (groundingUrl 그대로 사용)
            for (let i = 0; i < Math.min(groundingChunks.length, numResults); i++) {
                const chunk = groundingChunks[i];
                if (chunk.web?.uri && chunk.web?.title) {
                    // 해당 chunk를 참조하는 text segment 찾기
                    const relatedSupport = groundingSupports.find(support => 
                        support.groundingChunkIndices?.includes(i)
                    );
                    const snippet = relatedSupport?.segment?.text || 
                                  "grounding chunk에서 관련된 텍스트를 찾을 수 없습니다.";

                    results.push({
                        title: chunk.web.title,
                        url: chunk.web.uri,
                        snippet: snippet
                    });
                }
            }

            const searchResult: GoogleSearchResponse = {
                query: query,
                responseText: responseText,
                groundResults: results,
                total_results: results.length
            };

            console.log(`✅ Google Search 완료: ${searchResult.groundResults.length}개 결과`);
            return searchResult;
            
        } catch (error) {
            console.error("Google Search 실행 실패:", error);
            
            // 폴백: 기본 응답 반환
            return {
                query: query,
                responseText: "검색 결과를 가져올 수 없습니다.",
                groundResults: [{
                    title: "검색 결과를 가져올 수 없습니다",
                    url: "https://www.google.com/search?q=" + encodeURIComponent(query),
                    snippet: "google search 기능에 문제가 발생했습니다."
                }],
                total_results: 0
            };
        }
    }

    /**
     * 검색 결과를 텍스트로 변환 + 각 URL의 웹페이지 내용을 MCP tool로 가져와 pageContent에 추가
     * @param searchResponse GoogleSearchResponse
     * @param geminiService GeminiService 인스턴스
     */
    async formatSearchResultsWithPageContent(
        searchResponse: GoogleSearchResponse,
        geminiService: GeminiService,
        mode: 'light' | 'heavy' = 'heavy'
    ): Promise<string> {
        let resultsWithContent: string[];
        if (mode === 'light') {
            // 각 결과에 대해 웹페이지 내용을 추가하지 않음
            resultsWithContent = searchResponse.groundResults.map((result, index) => {
                return `${index + 1}. ${result.title}\nURL: ${result.url}\nURL 내용 요약: ${result.snippet}`;
            });
        } else {
            // heavy 모드: 각 결과에 대해 웹페이지 내용을 가져와 pageContent에 추가
            resultsWithContent = await Promise.all(
                searchResponse.groundResults.map(async (result, index) => {
                    let pageContent = "";
                    let resolvedURL = result.url; // 기본 URL
                    try {
                        // MCP tool 호출
                        const mcpResult = await geminiService.callMCPTool(
                            "web_read_web_to_markdown", // TODO 이 도구 이름은 나중에 설정으로 넣어줄 수 있게끔 만들어주기.
                            { url: result.url }
                        );
                        // callMCPTool이 result.content를 반환한다면, mcpResult는 배열임
                        let rawContent = mcpResult?.[0]?.text || "(페이지 내용을 가져올 수 없습니다)";
                        resolvedURL = mcpResult?.[1]?.text || resolvedURL;
                        // 2000자 제한, 너무 길면 자르고 안내 추가
                        if (rawContent.length > 2000) {
                            pageContent = rawContent.substring(0, 2000) + "\n...(이하 생략)";
                        } else {
                            pageContent = rawContent;
                        }
                    } catch (err) {
                        pageContent = "(페이지 내용을 가져오는 중 오류 발생)";
                    }
                    return `${index + 1}. ${result.title}\nURL: ${resolvedURL}\nURL 내용 요약: ${result.snippet}\n---\n[페이지 내용]\n${pageContent}\n---`;
                })
            );
        }

        const finalResult = `검색어: "${searchResponse.query}"\n총 ${searchResponse.total_results}개 결과\n출력 응답: ${searchResponse.responseText}\n\n출처:\n\n${resultsWithContent.join('\n\n')}`;
        return finalResult;
    }
}


