import { GoogleGenAI, Type } from "@google/genai";
import { GeminiTool } from "./gemini-service";

export interface ToolInfo {
    name: string;
    description: string;
    parameters: any;
    serverName?: string;
    originalName?: string;
}

export interface PlanStep {
    stepNumber: number;
    toolName: string;
    purpose: string;
    reasoning: string;
    expectedOutput: string;
    // arguments는 실행 시점에 결정됨
}

export interface ExecutionPlan {
    overallGoal: string;
    plan: string; // 사용자 답변에 어떤 tool의 어떤 결과를 이용할지에 대한 계획
    steps: PlanStep[];
    finalResponseGuidance: string;
}

export class PlanToolSelectService {
    private genAI: GoogleGenAI;
    private availableTools: ToolInfo[] = [];

    constructor(apiKey: string) {
        this.genAI = new GoogleGenAI({ apiKey: apiKey });
    }

    // 사용 가능한 도구 정보 업데이트
    updateAvailableTools(mcpTools: GeminiTool[], toolMapping: Map<string, { serverName: string, toolName: string }>) {
        this.availableTools = [];

        // MCP 도구들 추가
        mcpTools.forEach(tool => {
            const mappingInfo = toolMapping.get(tool.name);

            this.availableTools.push({
                name: tool.name,
                description: tool.description || "No description available",
                parameters: tool.parameters,
                serverName: mappingInfo?.serverName,
                originalName: mappingInfo?.toolName
            });
        });

        // Google Search 도구 추가
        this.availableTools.push({
            name: "google_search",
            description: "Search the web using Google to find current information, news, articles, and general knowledge about any topic. This tool provides search results with relevant URLs and content snippets.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The search query to execute"
                    },
                    num_results: {
                        type: "integer",
                        description: "Number of results to return (default: 5, max: 10)"
                    }
                },
                required: ["query"]
            }
        });
    }

    // 계획 수립 및 도구 선택
    async createExecutionPlan(userQuery: string, conversationContext: string = "", environmentContext: string = ""): Promise<ExecutionPlan> {
        // 사용 가능한 도구 목록을 문자열로 변환 (파라미터 설명 포함)
        const toolsDescription = this.availableTools.map(tool => {
            let paramInfo = 'No parameters';
            
            if (tool.parameters?.properties) {
                const paramDetails = Object.entries(tool.parameters.properties).map(([paramName, paramData]: [string, any]) => {
                    const type = paramData.type || 'unknown';
                    const desc = paramData.description || 'No description';
                    const required = tool.parameters?.required?.includes(paramName) ? ' (required)' : ' (optional)';
                    return `    - ${paramName} (${type}${required}): ${desc}`;
                }).join('\n');
                paramInfo = `\n${paramDetails}`;
            }
            
            return `• ${tool.name}: ${tool.description}\n  Parameters:${paramInfo}`;
        }).join('\n');

        const prompt = `
당신은 고급 AI 어시스턴트의 계획 수립 전문가입니다. 사용자의 질문을 분석하고 최적의 실행 계획을 세워야 합니다.

${environmentContext ? `${environmentContext}\n` : ''}**사용자 질문:** ${userQuery}

**대화 맥락:** ${conversationContext || '없음'}

**사용 가능한 도구들:**
${toolsDescription}

**계획 수립 지침:**
1. 사용자의 질문을 깊이 분석하고 핵심 목표를 파악하세요.
2. 어떤 도구들을 사용하여 어떤 결과를 얻고, 그 결과들을 어떻게 조합하여 사용자에게 최적의 답변을 제공할지 계획하세요.
3. 필요한 도구들을 선택하고 논리적인 실행 순서를 결정하세요.
4. 각 단계의 목적과 이유를 명확히 하세요.
5. **각 도구에 전달할 구체적이고 정확한 인자(arguments)를 미리 완전히 결정하세요.**
6. 최종 응답에서 각 도구의 결과를 어떻게 활용할지 고려하세요.
7. 이전 단계의 예상 결과를 바탕으로 다음 단계의 매개변수를 결정하세요.

**매개변수 결정 시 필수 규칙:**
- **매개변수는 실행 시점에 이전 단계의 결과를 바탕으로 동적으로 결정됩니다.**
- **각 도구의 파라미터 스키마를 정확히 준수해야 합니다.**
- **필수 매개변수(required)는 반드시 포함하고, 올바른 데이터 타입을 사용하세요.**
- **이전 단계의 결과에 의존하는 경우, 해당 결과를 적절히 활용하세요.**
- **파일 경로가 필요한 경우 환경 컨텍스트를 참고하여 정확한 경로를 제공하세요.**

**일반 규칙:**
- **toolName은 반드시 위의 '사용 가능한 도구들' 목록에서만 선택해야 합니다.**
- **존재하지 않는 도구 이름이나 "None", "null" 등은 절대 사용하지 마세요.**
- 각 도구는 명확한 목적이 있어야 합니다.
- 이전 단계의 결과가 다음 단계에 영향을 줄 수 있습니다.
- 불필요한 도구 사용은 피하세요.
- 도구 없이 답변할 수 있다면 빈 steps 배열을 반환하세요.
- 사용자의 의도를 정확히 파악하여 관련 있는 도구만 사용하세요.
`;

        const response = await this.genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        overallGoal: {
                            type: Type.STRING,
                            description: "사용자 질문의 전반적인 목표"
                        },
                        plan: {
                            type: Type.STRING,
                            description: "어떤 도구들을 사용하여 어떤 결과를 얻고, 그 결과들을 어떻게 조합하여 사용자에게 최적의 답변을 제공할지에 대한 계획"
                        },
                        steps: {
                            type: Type.ARRAY,
                            description: "실행할 단계들",
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    stepNumber: {
                                        type: Type.INTEGER,
                                        description: "단계 번호"
                                    },
                                    toolName: {
                                        type: Type.STRING,
                                        description: "사용할 도구 이름 (반드시 사용 가능한 도구 목록에서 선택)",
                                        enum: this.availableTools.map(tool => tool.name)
                                    },
                                    purpose: {
                                        type: Type.STRING,
                                        description: "이 단계의 목적"
                                    },
                                    reasoning: {
                                        type: Type.STRING,
                                        description: "이 도구를 선택한 이유"
                                    },
                                    expectedOutput: {
                                        type: Type.STRING,
                                        description: "예상되는 출력"
                                    }
                                },
                                required: ["stepNumber", "toolName", "purpose", "reasoning", "expectedOutput"]
                            }
                        },
                        finalResponseGuidance: {
                            type: Type.STRING,
                            description: "최종 응답 작성을 위한 지침"
                        }
                    },
                    required: ["overallGoal", "plan", "steps", "finalResponseGuidance"]
                }
            }
        });

        const planData = JSON.parse(response.text || "{}");
        
        if (!planData.steps) {
            throw new Error("Invalid plan response: missing steps");
        }
        
        // 도구 이름 검증
        console.log("🔧 사용 가능한 도구들:", this.availableTools.map(t => t.name).join(', '));
        for (const step of planData.steps) {
            if (!step.toolName || step.toolName.trim() === '' || step.toolName === 'None' || step.toolName === 'null') {
                console.error(`❌ 잘못된 도구 이름: "${step.toolName}"`);
                console.error(`📋 계획된 단계들:`, planData.steps.map((s: any) => `${s.stepNumber}: ${s.toolName}`));
                throw new Error(`Invalid tool name: ${step.toolName}`);
            }
            
            const tool = this.availableTools.find(t => t.name === step.toolName);
            if (!tool) {
                console.error(`❌ 알 수 없는 도구 이름: "${step.toolName}"`);
                console.error(`📋 계획된 단계들:`, planData.steps.map((s: any) => `${s.stepNumber}: ${s.toolName}`));
                throw new Error(`Unknown tool: ${step.toolName}`);
            }
        }

        console.log("🎯 실행 계획 수립 완료:");
        console.log("   목표:", planData.overallGoal);
        console.log("   계획:", planData.plan);
        console.log("   단계 수:", planData.steps.length);
        console.log(""); // 빈 줄 추가
        
        planData.steps.forEach((step: PlanStep) => {
            console.log(`📍 단계 ${step.stepNumber}: ${step.toolName}`);
            console.log(`   목적: ${step.purpose}`);
            console.log(`   이유: ${step.reasoning}`);
            console.log(`   예상 출력: ${step.expectedOutput}`);
            console.log(`   💡 매개변수는 실행 시점에 동적으로 결정됩니다`);
            
            // 도구 정보 표시
            const tool = this.getToolInfo(step.toolName);
            if (tool && tool.parameters) {
                const required = tool.parameters.required || [];
                console.log(`   📋 필수 매개변수: ${required.join(', ') || '없음'}`);
            }
            console.log(""); // 단계 간 구분을 위한 빈 줄
        });

        return planData as ExecutionPlan;
    }

    // 특정 도구 정보 조회
    getToolInfo(toolName: string): ToolInfo | undefined {
        return this.availableTools.find(tool => tool.name === toolName);
    }

    // 사용 가능한 모든 도구 정보 반환
    getAllTools(): ToolInfo[] {
        return this.availableTools;
    }
}
