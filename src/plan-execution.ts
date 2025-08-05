import { GoogleGenAI, Type } from "@google/genai";
import { ExecutionPlan, PlanStep, PlanToolSelectService } from "./plan-tool-select";
import { GeminiService } from "./gemini-service";
import { GoogleSearchService } from "./google-search";
import { PlanProgressData } from "./types";

interface ToolCallResult {
    stepNumber: number;
    toolName: string;
    input: any;
    output: any;
    success: boolean;
    error?: string;
    executionTime?: number; // 실행 시간 (ms)
}

interface ToolCallDecision {
    toolName: string;
    arguments: any;
    reasoning: string;
}

export class PlanExecutionService {
    private genAI: GoogleGenAI;
    private geminiService: GeminiService;
    private googleSearchService: GoogleSearchService;
    private planToolSelectService: PlanToolSelectService;

    constructor(apiKey: string, geminiService: GeminiService, planToolSelectService: PlanToolSelectService) {
        this.genAI = new GoogleGenAI({ apiKey: apiKey });
        this.geminiService = geminiService;
        this.googleSearchService = new GoogleSearchService(apiKey);
        this.planToolSelectService = planToolSelectService;
    }

    // 계획 실행
    async executePlan(
        userQuery: string,
        plan: ExecutionPlan,
        conversationContext: string = "",
        environmentContext: string = "",
        progressCallback?: (data: PlanProgressData) => void
    ): Promise<string> {
        console.log("🚀 계획 실행 시작:", plan.overallGoal);
        console.log("📋 실행 계획:", plan.plan);
        
        const toolResults: ToolCallResult[] = [];
        
        // 단계별로 실행
        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];
            const startTime = Date.now();
            
            // 현재 단계 진행 상황 업데이트
            if (progressCallback) {
                progressCallback({
                    status: `단계 ${step.stepNumber}/${plan.steps.length} 실행 중`,
                    currentStep: i,
                    totalSteps: plan.steps.length,
                    currentStepDescription: `${step.purpose}`,
                    toolUsed: `🔧 ${step.toolName} 도구 사용 중...`
                });
            }
            
            try {
                console.log(`📋 단계 ${step.stepNumber} 실행 중: ${step.toolName}`);
                console.log(`   목적: ${step.purpose}`);
                console.log(`   이유: ${step.reasoning}`);
                
                // 1. 동적 매개변수 결정
                const toolDecision = await this.decideToolCall(
                    userQuery,
                    step,
                    plan,
                    toolResults,
                    conversationContext,
                    environmentContext
                );
                
                console.log(`🔧 매개변수 결정:`, toolDecision.reasoning);
                console.log(`   결정된 인자:`, JSON.stringify(toolDecision.arguments, null, 2));
                
                // 2. 도구 호출
                const toolOutput = await this.callTool(step.toolName, toolDecision.arguments);
                
                // 전체 도구 출력을 로깅 (MCP 서버 응답을 완전히 확인)
                this.logToolOutput(step.toolName, toolOutput);
                
                // 3. 결과 저장
                toolResults.push({
                    stepNumber: step.stepNumber,
                    toolName: step.toolName,
                    input: toolDecision.arguments,
                    output: toolOutput,
                    success: true,
                    executionTime: Date.now() - startTime
                });
                
                // 도구 실행 완료 상황 업데이트
                if (progressCallback) {
                    const shortResult = typeof toolOutput === 'string' ? 
                        (toolOutput.length > 200 ? toolOutput.substring(0, 200) + '...' : toolOutput) :
                        JSON.stringify(toolOutput).substring(0, 200) + '...';
                    
                    progressCallback({
                        status: `단계 ${step.stepNumber}/${plan.steps.length} 완료`,
                        currentStep: i + 1,
                        totalSteps: plan.steps.length,
                        currentStepDescription: `✅ ${step.purpose} 완료`,
                        toolUsed: `${step.toolName}`,
                        toolResult: shortResult
                    });
                }
                
                console.log(`✅ 단계 ${step.stepNumber} 완료 (${Date.now() - startTime}ms)`);
                
            } catch (error) {
                console.error(`❌ 단계 ${step.stepNumber} 실패:`, error);
                
                toolResults.push({
                    stepNumber: step.stepNumber,
                    toolName: step.toolName,
                    input: null,
                    output: null,
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                    executionTime: Date.now() - startTime
                });
                
                // 실패 상황 업데이트
                if (progressCallback) {
                    progressCallback({
                        status: `단계 ${step.stepNumber} 실패`,
                        currentStep: i,
                        totalSteps: plan.steps.length,
                        currentStepDescription: `❌ ${step.purpose} 실패: ${error instanceof Error ? error.message : "Unknown error"}`,
                        toolUsed: `${step.toolName} (실패)`
                    });
                }
                
                // 도구 호출 실패 시 즉시 계획 실행 중단
                console.log(`🚨 도구 호출 실패로 인해 계획 실행 중단`);
                break;
            }
        }
        
        // 최종 응답 생성
        const finalResponse = await this.generateFinalResponse(
            userQuery,
            plan,
            toolResults,
            conversationContext,
            environmentContext
        );
        
        console.log(`🎉 계획 실행 완료 (총 ${toolResults.length}단계)`);
        
        return finalResponse;
    }

    // 실제 도구 호출
    private async callTool(toolName: string, args: any): Promise<any> {
        console.log(`🔧 도구 호출 시작: "${toolName}"`);
        console.log(`   매개변수:`, JSON.stringify(args, null, 2));
        
        if (toolName === "google_search_light") {
            // Google Search 도구 호출 (light 버전)
            const query = args.query || "";
            const numResults = args.num_results || 5;
            
            console.log(`🔍 Google Search 실행: "${query}" (${numResults}개 결과)`);
            const searchResponse = await this.googleSearchService.search(query, numResults);
            const formattedResults = await this.googleSearchService.formatSearchResultsWithPageContent(searchResponse, this.geminiService, 'light');
            // formatSearchResultsWithPageContent의 결과를 직접 반환 (문자열)
            return formattedResults;
        } else if (toolName === "google_search_heavy") { 
            // Google Search 도구 호출 (heavy 버전)
            const query = args.query || "";
            const numResults = args.num_results || 5;
            
            console.log(`🔍 Google Search 실행: "${query}" (${numResults}개 결과)`);
            const searchResponse = await this.googleSearchService.search(query, numResults);
            const formattedResults = await this.googleSearchService.formatSearchResultsWithPageContent(searchResponse, this.geminiService, 'heavy');
            // formatSearchResultsWithPageContent의 결과를 직접 반환 (문자열)
            return formattedResults;
        } else {
            // MCP 도구 호출
            console.log(`🤖 MCP 도구 호출 준비: "${toolName}"`);
            
            // 도구 이름 매핑 정보 가져오기
            const toolMapping = this.geminiService.getToolNameMapping();
            const mappingInfo = toolMapping.get(toolName);
            
            if (!mappingInfo) {
                console.error(`❌ 도구 매핑 정보를 찾을 수 없음: "${toolName}"`);
                console.error(`📋 사용 가능한 매핑:`);
                for (const [key, value] of toolMapping.entries()) {
                    console.error(`   "${key}" -> 서버="${value.serverName}", 도구="${value.toolName}"`);
                }
                throw new Error(`Tool mapping not found for ${toolName}`);
            }
            
            console.log(`📝 도구 매핑 정보:`);
            console.log(`   계획된 도구 이름: "${toolName}"`);
            console.log(`   → 서버: "${mappingInfo.serverName}"`);
            console.log(`   → 실제 도구 이름: "${mappingInfo.toolName}"`);
            
            // geminiService.callMCPTool()을 통해 올바른 매핑으로 호출
            return await this.geminiService.callMCPTool(toolName, args);
        }
    }

    // 최종 응답 생성
    private async generateFinalResponse(
        userQuery: string,
        plan: ExecutionPlan,
        toolResults: ToolCallResult[],
        conversationContext: string,
        environmentContext: string = ""
    ): Promise<string> {
        const successfulResults = toolResults.filter(result => result.success);
        const failedResults = toolResults.filter(result => !result.success);
        
        const resultsText = successfulResults.map(result => {
            const output = result.output && typeof result.output === 'object' 
                ? JSON.stringify(result.output, null, 2)
                : result.output;
            return `단계 ${result.stepNumber} (${result.toolName}):\n입력: ${JSON.stringify(result.input)}\n출력: ${output}\n`;
        }).join('\n');

        // 실패한 도구가 있는 경우 (최대 1개, 실패 시 즉시 중단됨)
        const failuresText = failedResults.length > 0 
            ? `\n실패한 도구 호출:\n단계 ${failedResults[0].stepNumber} (${failedResults[0].toolName}): ${failedResults[0].error}`
            : "";

        const prompt = `
당신은 AI 어시스턴트입니다. 사용자의 질문에 대해 계획을 세우고 도구들을 사용한 결과를 바탕으로 최종 응답을 생성해야 합니다.

**사용자 질문:** ${userQuery}

**환경 컨텍스트 정보:**
${environmentContext || '환경 정보 없음'}

**대화 맥락:** ${conversationContext || '없음'}

**실행한 계획:**
- 목표: ${plan.overallGoal}
- 계획: ${plan.plan}

**성공한 도구 실행 결과:**
${resultsText || "성공한 도구 실행 없음"}

${failuresText}

**최종 응답 지침:**
${plan.finalResponseGuidance}

**지침:**
1. **환경 컨텍스트 정확성**: 환경 컨텍스트에서 제공된 실제 파일명, 경로, vault 정보를 정확히 활용하세요.

2. **도구 결과 통합 및 확장**: 
   - 도구 실행 결과를 단순히 요약하지 말고, 각 결과의 핵심 내용을 추출하세요
   - 도구 결과에서 얻은 정보에 관련된 배경지식, 원리, 메커니즘을 추가로 설명하세요
   - 여러 도구 결과가 있다면 이들 간의 연관성과 상호보완적 관계를 분석하세요

3. **구조화된 전문 응답 생성**:
   - **핵심 답변**: 사용자 질문에 대한 직접적이고 명확한 답변을 먼저 제시
   - **상세 분석**: 도구 결과를 바탕으로 한 깊이 있는 분석과 해석
   - **전문적 맥락**: 해당 주제의 이론적 배경, 실제 적용 사례, 업계 동향 등 전문지식 보강
   - **실용적 가이드**: 구체적인 활용 방법, 주의사항, 베스트 프랙티스 제시

4. **지식 확장 및 교육적 가치**:
   - 도구에서 얻은 기본 정보를 시작점으로 하여 관련 개념, 원리, 응용 분야까지 확장 설명
   - 초보자도 이해할 수 있도록 복잡한 개념은 단계별로 설명
   - 실제 사례나 비유를 통해 이해도 향상

5. **다각도 분석 제공**:
   - 기술적 측면, 실용적 측면, 비즈니스 측면 등 여러 관점에서 분석
   - 장단점, 한계점, 개선 방향성 등 균형잡힌 시각 제공
   - 대안이나 보완책이 있다면 함께 제시

6. **신뢰성 및 출처 명시**:
   - 도구 결과의 신뢰도를 평가하고 명시
   - 추가 정보의 출처나 근거를 명확히 제시
   - 불확실한 부분은 명시적으로 구분하여 표현

7. **실행 가능한 제안**:
   - 다음 단계나 후속 조치를 구체적으로 제안
   - 추가로 필요한 정보나 도구 활용 방안 제시
   - 실제 적용 시 고려사항이나 주의점 안내

8. **사용자 맞춤형 응답**:
   - 사용자의 질문 의도와 수준에 맞는 설명 깊이 조절
   - 전문용어 사용 시 적절한 설명 병행
   - 질문의 맥락과 목적을 고려한 맞춤형 정보 제공

9. **기술적 세부사항 처리**: 도구 실행의 기술적 세부사항은 숨기고, 사용자에게 유용한 정보와 인사이트만 제공하세요.

10. **정확한 참조**: 파일명이나 경로를 언급할 때는 환경 컨텍스트에서 제공된 정확한 이름을 사용하세요.

11. **외부 자료 연결**: google_search, perplexity_search 도구를 사용한 경우, 관련 URL을 마지막에 명시하고 사용자가 클릭할 수 있도록 링크 형식으로 작성하세요.

12. **실패 대응**: 실패한 도구가 있다면 그 한계를 인정하되, 가능한 정보로 최선의 답변을 제공하고 부분적 결과라도 최대한 활용하세요.

사용자에게 친절하고 도움이 되는 응답을 생성하세요:
`;

        const response = await this.genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });

        return response.text || "응답을 생성할 수 없습니다.";
    }

    // 도구 호출 매개변수 동적 결정
    private async decideToolCall(
        userQuery: string,
        currentStep: PlanStep,
        plan: ExecutionPlan,
        previousResults: ToolCallResult[],
        conversationContext: string,
        environmentContext: string = ""
    ): Promise<ToolCallDecision> {
        // 이전 성공 결과들만 필터링
        const successfulResults = previousResults.filter(result => result.success);
        
        // 이전 결과들을 텍스트로 변환
        const previousResultsText = successfulResults.length > 0 
            ? successfulResults.map(result => {
                const output = result.output && typeof result.output === 'object' 
                    ? JSON.stringify(result.output, null, 2)
                    : result.output;
                return `단계 ${result.stepNumber} (${result.toolName}):\n입력: ${JSON.stringify(result.input)}\n출력: ${output}\n`;
            }).join('\n')
            : "이전 결과 없음";

        // 현재 단계의 도구 정보 가져오기
        const currentToolInfo = this.planToolSelectService.getToolInfo(currentStep.toolName);
        const toolDescription = currentToolInfo?.description || "설명 없음";
        const toolParameters = currentToolInfo?.parameters ? JSON.stringify(currentToolInfo.parameters, null, 2) : "매개변수 정보 없음";
        console.log(`현재 environmentContext: ${environmentContext}`);
        const prompt = `
당신은 AI 어시스턴트의 도구 호출 매개변수 결정 전문가입니다. 주어진 계획과 이전 결과를 바탕으로 현재 단계의 도구에 전달할 정확한 매개변수를 결정해야 합니다.

**사용자 질문:** ${userQuery}

**환경 컨텍스트 정보:**
${environmentContext || '환경 정보 없음'}

**대화 맥락:** ${conversationContext || '없음'}

**전체 계획:**
- 목표: ${plan.overallGoal}
- 계획: ${plan.plan}

**현재 단계:**
- 단계 번호: ${currentStep.stepNumber}
- 도구: ${currentStep.toolName}
- 목적: ${currentStep.purpose}
- 이유: ${currentStep.reasoning}
- 예상 출력: ${currentStep.expectedOutput}

**현재 도구 정보:**
- 설명: ${toolDescription}
- 매개변수 스키마:
${toolParameters}

**이전 단계 결과:**
${previousResultsText}

**매개변수 결정 지침:**
1. **환경 컨텍스트 정보를 정확히 활용하세요:**
   - 파일 경로는 환경 컨텍스트에서 제공된 정확한 경로를 사용하세요
   - "절대경로: /path/to/file" 형식으로 제공된 경로를 그대로 사용하세요
   - 파일명, 폴더명, 경로를 추측하거나 임의로 변경하지 마세요
   - vault 이름, 사용자명 등을 추측하지 말고 환경 컨텍스트에서 제공된 정보만 사용하세요

2. **JSON 응답 구조 최적화 - 매우 중요:**
   - 짧은 매개변수(path, filename, query 등)를 먼저 배치하세요
   - 긴 매개변수(content, body, text 등)는 마지막에 배치하세요
   - 이는 JSON 응답 길이 제한으로 인한 매개변수 손실을 방지합니다

3. 현재 단계의 목적을 달성하기 위한 도구 호출 매개변수를 정확히 결정하세요.
4. 이전 단계의 성공 결과를 적절히 활용하세요 (특히 파일 내용, 검색 결과 등).
5. 도구의 스키마에 정의된 매개변수만 사용하세요.
6. 필수 매개변수(required)는 반드시 포함하세요.
7. 매개변수 값은 구체적이고 실행 가능해야 합니다.
8. 매개변수 타입(string, number, boolean 등)을 정확히 지켜주세요.

**파일 경로 처리 규칙:**
- PDF/이미지/기타 파일: 환경 컨텍스트의 절대경로를 정확히 사용
- 노트 파일: 환경 컨텍스트에서 제공된 경로 정보를 우선 사용
- 한글, 공백, 특수문자가 포함된 파일명도 환경 컨텍스트의 경로를 그대로 사용
- 경로를 인코딩하거나 변경하지 마세요

다음 JSON 형식으로 응답하세요 (짧은 매개변수부터 순서대로):
{
  "toolName": "도구_이름",
  "arguments": {
    // 짧은 매개변수들 먼저 (path, filename, query, mode 등)
    // 긴 매개변수들 나중에 (content, body, text 등)
  },
  "reasoning": "이 매개변수를 선택한 이유"
}
`;

        const response = await this.genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        toolName: {
                            type: Type.STRING,
                            description: "호출할 도구 이름"
                        },
                        arguments: {
                            description: "도구 호출 매개변수 (JSON 객체)"
                        },
                        reasoning: {
                            type: Type.STRING,
                            description: "이 매개변수를 선택한 이유와 환경 컨텍스트 활용 방법"
                        }
                    },
                    required: ["toolName", "arguments", "reasoning"]
                }
            }
        });

        const decision = JSON.parse(response.text || "{}");
        
        if (!decision.toolName || !decision.arguments) {
            throw new Error("Invalid tool call decision: toolName and arguments are required");
        }

        return {
            toolName: decision.toolName,
            arguments: decision.arguments,
            reasoning: decision.reasoning
        } as ToolCallDecision;
    }

    private logToolOutput(toolName: string, output: any): void {
        console.log(`\n=== ${toolName} Tool Output ===`);
        
        if (typeof output === 'string') {
            console.log(output);
        } else if (output && typeof output === 'object') {
            try {
                // Format JSON output nicely
                const formatted = JSON.stringify(output, null, 2);
                console.log(formatted);
            } catch (error) {
                // Fallback to toString if JSON.stringify fails
                console.log(output.toString());
            }
        } else {
            console.log(output);
        }
        
        console.log(`=== End ${toolName} Output ===\n`);
    }
}
