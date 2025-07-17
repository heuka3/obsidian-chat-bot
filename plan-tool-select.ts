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
            description: "Search the web using Google to find current information, news, articles, and general knowledge about any topic",
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
        // 사용 가능한 도구 목록을 문자열로 변환
        const toolsDescription = this.availableTools.map(tool => {
            const params = tool.parameters?.properties 
                ? Object.keys(tool.parameters.properties).join(', ')
                : 'No parameters';
            const required = tool.parameters?.required 
                ? ` (Required: ${tool.parameters.required.join(', ')})`
                : '';
            
            return `• ${tool.name}: ${tool.description}\n  Parameters: ${params}${required}`;
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
5. 최종 응답에서 각 도구의 결과를 어떻게 활용할지 고려하세요.

**중요한 규칙:**
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
                                        description: "사용할 도구 이름"
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
        for (const step of planData.steps) {
            const tool = this.availableTools.find(t => t.name === step.toolName);
            if (!tool) {
                throw new Error(`Unknown tool: ${step.toolName}`);
            }
        }

        console.log("🎯 실행 계획 수립 완료:");
        console.log("   목표:", planData.overallGoal);
        console.log("   계획:", planData.plan);
        console.log("   단계 수:", planData.steps.length);
        
        planData.steps.forEach((step: PlanStep) => {
            console.log(`   ${step.stepNumber}. ${step.toolName} - ${step.purpose}`);
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
