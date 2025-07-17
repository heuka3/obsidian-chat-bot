import { GoogleGenAI, Type } from "@google/genai";
import { ExecutionPlan, PlanStep } from "./plan-tool-select";
import { GeminiService } from "./gemini-service";
import { GoogleSearchService } from "./google-search";

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

    constructor(apiKey: string, geminiService: GeminiService) {
        this.genAI = new GoogleGenAI({ apiKey: apiKey });
        this.geminiService = geminiService;
        this.googleSearchService = new GoogleSearchService(apiKey);
    }

    // 계획 실행
    async executePlan(
        userQuery: string,
        plan: ExecutionPlan,
        conversationContext: string = "",
        environmentContext: string = ""
    ): Promise<string> {
        console.log("🚀 계획 실행 시작:", plan.overallGoal);
        console.log("� 실행 계획:", plan.plan);
        
        const toolResults: ToolCallResult[] = [];
        
        // 단계별로 실행
        for (const step of plan.steps) {
            const startTime = Date.now();
            
            try {
                console.log(`📋 단계 ${step.stepNumber} 실행 중: ${step.toolName}`);
                
                // 1. 도구 호출 결정 (매개변수 결정)
                const toolDecision = await this.decideToolCall(
                    userQuery,
                    step,
                    plan,
                    toolResults,
                    conversationContext
                );
                
                console.log(`🔧 도구 호출 결정:`, toolDecision.reasoning);
                
                // 2. 실제 도구 호출
                const toolOutput = await this.callTool(step.toolName, toolDecision.arguments);
                
                // 3. 결과 저장
                toolResults.push({
                    stepNumber: step.stepNumber,
                    toolName: step.toolName,
                    input: toolDecision.arguments,
                    output: toolOutput,
                    success: true,
                    executionTime: Date.now() - startTime
                });
                
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
                
                // 도구 호출 실패 시 즉시 계획 실행 중단
                console.log(`🚨 도구 호출 실패로 인해 계획 실행 중단`);
                break;
            }
        }
        
        // 4. 최종 응답 생성
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

    // 도구 호출 결정 (매개변수 결정)
    private async decideToolCall(
        userQuery: string,
        currentStep: PlanStep,
        plan: ExecutionPlan,
        previousResults: ToolCallResult[],
        conversationContext: string
    ): Promise<ToolCallDecision> {
        // 이전 성공 결과들만 필터링 (실패 시 즉시 중단되므로 실패한 결과는 없음)
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
        const currentToolInfo = this.geminiService.getToolInfo(currentStep.toolName);
        const toolDescription = currentToolInfo?.description || "설명 없음";
        const toolParameters = currentToolInfo?.parameters ? JSON.stringify(currentToolInfo.parameters, null, 2) : "매개변수 정보 없음";

        const prompt = `
당신은 AI 어시스턴트의 도구 호출 결정 모듈입니다. 주어진 계획과 이전 결과를 바탕으로 현재 단계의 도구를 어떻게 호출할지 결정해야 합니다.

**사용자 질문:** ${userQuery}

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

**지침:**
1. 현재 단계의 목적을 달성하기 위한 도구 호출 매개변수를 결정하세요.
2. 이전 단계의 성공 결과를 적절히 활용하세요.
3. 도구 호출의 이유를 명확히 설명하세요.
4. 매개변수는 도구의 스키마에 맞춰 정확히 제공하세요.
5. 계획된 모든 도구는 반드시 실행되어야 합니다.
6. arguments는 유효한 JSON 형식의 문자열로 제공하세요.

다음 JSON 형식으로 응답하세요. arguments는 JSON 객체를 문자열로 변환한 형태로 제공하세요:
{
  "toolName": "도구_이름",
  "arguments": "{\"매개변수1\": \"값1\", \"매개변수2\": \"값2\"}",
  "reasoning": "이유 설명"
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
                            type: Type.STRING,
                            description: "도구 호출 매개변수 (JSON 형식의 문자열)"
                        },
                        reasoning: {
                            type: Type.STRING,
                            description: "이 매개변수를 선택한 이유"
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

        // arguments가 문자열이면 JSON으로 파싱
        let parsedArguments;
        try {
            parsedArguments = typeof decision.arguments === 'string' 
                ? JSON.parse(decision.arguments)
                : decision.arguments;
        } catch (error) {
            console.error("Failed to parse arguments:", decision.arguments);
            throw new Error("Invalid arguments format - must be valid JSON");
        }

        return {
            toolName: decision.toolName,
            arguments: parsedArguments,
            reasoning: decision.reasoning
        } as ToolCallDecision;
    }

    // 실제 도구 호출
    private async callTool(toolName: string, args: any): Promise<any> {
        if (toolName === "google_search") {
            // Google Search 도구 호출
            const query = args.query || "";
            const numResults = args.num_results || 5;
            
            const searchResponse = await this.googleSearchService.search(query, numResults);
            return {
                searchResults: searchResponse,
                formattedResults: this.googleSearchService.formatSearchResults(searchResponse)
            };
        } else {
            // MCP 도구 호출
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

${environmentContext ? `${environmentContext}\n` : ''}**사용자 질문:** ${userQuery}

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
1. 도구 실행 결과를 종합하여 사용자의 질문에 명확하고 도움이 되는 답변을 제공하세요.
2. 실패한 도구가 있다면 그 한계를 인정하되, 가능한 정보로 최선의 답변을 제공하세요.
3. 답변은 자연스럽고 이해하기 쉬워야 합니다.
4. 필요하다면 추가 정보나 다음 단계를 제안하세요.
5. 실행 과정에서 얻은 구체적인 정보를 활용하세요.
6. 도구 실행의 기술적 세부사항은 숨기고, 사용자에게 유용한 정보만 제공하세요.
7. 도구 호출이 중단된 경우, 부분적인 결과라도 최대한 활용하여 답변하세요.

사용자에게 친절하고 도움이 되는 응답을 생성하세요:
`;

        const response = await this.genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });

        return response.text || "응답을 생성할 수 없습니다.";
    }
}
