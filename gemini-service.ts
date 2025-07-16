import { ChatMessage, MCPServer } from "./types";
import { GoogleGenAI, Type, FunctionCallingConfigMode } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from 'child_process';

interface GeminiTool {
    name: string;
    description?: string;
    parameters: any;
}

// JSON Schema를 Gemini Type으로 변환하는 함수
function convertJsonSchemaToGeminiType(schema: any): any {
    if (!schema || typeof schema !== 'object') {
        return schema;
    }

    // 기본 타입 매핑
    const typeMapping: { [key: string]: any } = {
        'string': Type.STRING,
        'number': Type.NUMBER,
        'integer': Type.INTEGER,
        'boolean': Type.BOOLEAN,
        'array': Type.ARRAY,
        'object': Type.OBJECT
    };

    const convertedSchema: any = {};

    // type 변환
    if (schema.type && typeMapping[schema.type]) {
        convertedSchema.type = typeMapping[schema.type];
    }

    // properties 변환
    if (schema.properties) {
        convertedSchema.properties = {};
        for (const [key, value] of Object.entries(schema.properties)) {
            convertedSchema.properties[key] = convertJsonSchemaToGeminiType(value);
        }
    }

    // items 변환 (배열의 경우)
    if (schema.items) {
        convertedSchema.items = convertJsonSchemaToGeminiType(schema.items);
    }

    // 다른 속성들 복사
    const otherProps = ['description', 'required', 'title', 'enum'];
    otherProps.forEach(prop => {
        if (schema[prop] !== undefined) {
            convertedSchema[prop] = schema[prop];
        }
    });

    return convertedSchema;
}

export class GeminiService {
    private apiKey: string = '';
    private conversationHistory: ChatMessage[] = [];
    private genAI: GoogleGenAI | null = null;
    private mcpClients: Map<string, Client> = new Map();
    private mcpTransports: Map<string, StdioClientTransport> = new Map();
    private availableTools: GeminiTool[] = [];
    private mcpServers: MCPServer[] = [];
    
    // 함수 이름 매핑: sanitized 이름 -> 원본 서버 이름과 도구 이름
    private toolNameMapping: Map<string, { serverName: string, toolName: string }> = new Map();

    constructor(apiKey?: string) {
        if (apiKey) {
            this.setApiKey(apiKey);
        }
    }

    setApiKey(apiKey: string) {
        this.apiKey = apiKey;
        if (apiKey) {
            this.genAI = new GoogleGenAI({ apiKey: apiKey });
        }
    }

    isConfigured(): boolean {
        return this.apiKey !== '' && this.genAI !== null;
    }

    // 대화 내역 전체 반환
    getHistory(): ChatMessage[] {
        return this.conversationHistory;
    }

    // 대화 내역에 메시지 추가
    addMessage(role: 'user' | 'assistant' | 'system', content: string) {
        this.conversationHistory.push({ role, content });
    }

    // 대화 내역 초기화
    clearHistory() {
        this.conversationHistory = [];
    }

    // MCP 서버 설정 업데이트
    async updateMCPServers(servers: MCPServer[]) {
        this.mcpServers = servers;
        await this.disconnectAllMCPServers();
        await this.connectToMCPServers();
    }

    // 모든 MCP 서버 연결 해제
    private async disconnectAllMCPServers() {
        for (const [name, client] of this.mcpClients) {
            try {
                await client.close();
            } catch (error) {
                console.error(`Error closing MCP client ${name}:`, error);
            }
        }
        
        for (const [name, transport] of this.mcpTransports) {
            try {
                await transport.close();
            } catch (error) {
                console.error(`Error closing MCP transport ${name}:`, error);
            }
        }
        
        this.mcpClients.clear();
        this.mcpTransports.clear();
        this.availableTools = [];
        this.toolNameMapping.clear(); // 매핑 정보도 초기화
    }

    // MCP 서버들에 연결
    private async connectToMCPServers() {
        const enabledServers = this.mcpServers.filter(server => server.enabled);
        
        for (const server of enabledServers) {
            try {
                await this.connectToMCPServer(server);
            } catch (error) {
                console.error(`Failed to connect to MCP server ${server.name}:`, error);
            }
        }
    }

    // 단일 MCP 서버에 연결
    private async connectToMCPServer(server: MCPServer) {
        try {
            console.log(`🔗 MCP 서버 연결 시도: ${server.name}`);
            
            // 서버 파일의 디렉토리 추출
            const path = require('path');
            const serverDir = path.dirname(server.path);
            const serverFile = path.basename(server.path);
            
            // 명령어 파싱
            const commandParts = server.command.split(' ');
            const command = commandParts[0];
            const args = [...commandParts.slice(1), serverFile];
            
            console.log(`💻 실행 명령어: ${command} ${args.join(' ')}`);
            console.log(`📁 작업 디렉토리: ${serverDir}`);
            
            const transport = new StdioClientTransport({
                command,
                args,
                cwd: serverDir, // 서버 스크립트의 디렉토리에서 실행
                env: {
                    ...process.env,
                    PATH: `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${process.env.PATH || ''}`
                } as Record<string, string>
            });

            const client = new Client({ name: "obsidian-chatbot", version: "1.0.0" });
            
            await client.connect(transport);
            
            const toolsResult = await client.listTools();
            
            // MCP 도구를 Gemini Function Calling 형태로 변환
            const tools = toolsResult.tools.map((tool) => {
                const originalName = `${server.name}_${tool.name}`;
                const validName = this.sanitizeFunctionName(originalName);
                
                // 매핑 정보 저장
                this.toolNameMapping.set(validName, {
                    serverName: server.name,
                    toolName: tool.name
                });
                
                console.log(`🔧 도구 이름 변환: "${originalName}" -> "${validName}"`);
                
                return {
                    name: validName,
                    description: tool.description || `Tool from ${server.name}`,
                    parameters: tool.inputSchema,
                };
            });

            this.availableTools.push(...tools);
            this.mcpClients.set(server.name, client);
            this.mcpTransports.set(server.name, transport);

            console.log(`✅ MCP 서버 ${server.name} 연결 완료 (${tools.length}개 도구)`);
        } catch (e) {
            const error = e as Error;
            if (error.message.includes('ENOENT')) {
                console.error(`❌ MCP 서버 ${server.name} 연결 실패: 명령어 '${server.command.split(' ')[0]}'를 찾을 수 없습니다.`);
                console.error(`💡 해결 방법: 올바른 명령어 경로를 확인하거나 전체 경로를 사용하세요.`);
            } else {
                console.error(`❌ MCP 서버 ${server.name} 연결 실패:`, error);
            }
            throw error;
        }
    }

    // 함수 이름을 Gemini 규칙에 맞게 정리
    private sanitizeFunctionName(name: string): string {
        // Gemini 함수 이름 규칙:
        // - 문자 또는 밑줄로 시작
        // - 영숫자, 밑줄, 점, 대시만 허용
        // - 최대 64자
        
        let sanitized = name
            .replace(/[^a-zA-Z0-9_.-]/g, '_')  // 허용되지 않는 문자를 밑줄로 변경
            .replace(/^[^a-zA-Z_]/, '_')       // 첫 문자가 문자나 밑줄이 아니면 밑줄 추가
            .substring(0, 64);                // 최대 64자로 제한
        
        return sanitized;
    }

    // MCP 도구 호출
    private async callMCPTool(toolName: string, args: any): Promise<any> {
        console.log(`🔧 MCP 도구 호출 요청: "${toolName}"`);
        
        // 매핑된 정보 조회
        const mappingInfo = this.toolNameMapping.get(toolName);
        if (!mappingInfo) {
            console.error(`❌ 도구 매핑 정보를 찾을 수 없음: "${toolName}"`);
            throw new Error(`Tool mapping not found for ${toolName}`);
        }
        
        const { serverName, toolName: actualToolName } = mappingInfo;
        console.log(`📝 매핑 정보: 서버="${serverName}", 도구="${actualToolName}"`);
        
        const client = this.mcpClients.get(serverName);
        if (!client) {
            console.error(`❌ MCP 서버를 찾을 수 없음: "${serverName}"`);
            throw new Error(`MCP server ${serverName} not found`);
        }

        console.log(`🚀 MCP 도구 실행: 서버="${serverName}", 도구="${actualToolName}"`);
        const result = await client.callTool({
            name: actualToolName,
            arguments: args,
        });

        console.log(`✅ MCP 도구 실행 완료: "${actualToolName}"`);
        return result.content;
    }

    /**
     * Gemini API를 사용해서 메시지 전송 (MCP Function Calling 지원)
     * model: string - 사용할 모델명 (예: "gemini-2.5-flash")
     */
    async sendMessage(model: string = 'gemini-2.5-flash'): Promise<string> {
        if (!this.isConfigured()) {
            throw new Error('Gemini API key가 설정되지 않았습니다.');
        }

        // 최근 user/assistant 메시지 10쌍(21개) 추출
        const filtered = this.conversationHistory.filter(m => m.role === 'user' || m.role === 'assistant');
        const latest_context = filtered.slice(-21);

        // 가장 최근 user 메시지 추출
        if (latest_context.length === 0) throw new Error("No user message found.");
        const lastUserMsgRealIdx = latest_context.length - 1;
        const lastUserMsg = latest_context[lastUserMsgRealIdx];

        // instruction용 대화 맥락
        const contextForInstruction = latest_context.slice(0, lastUserMsgRealIdx);
        
        // 대화 내용 구성
        let contents = [];
        
        if (contextForInstruction.length > 0) {
            const contextText = contextForInstruction.map(m => 
                `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
            ).join('\n');
            
            contents.push({
                role: "user",
                parts: [{
                    text: `아래 대화 내용을 참고하여 대화 맥락을 파악하고 User의 메시지에 친절하게 답변하세요.\n\n---\n${contextText}\n---\n\n${lastUserMsg.content}`
                }]
            });
        } else {
            contents.push({
                role: "user",
                parts: [{ text: lastUserMsg.content }]
            });
        }

        try {
            // Function Calling을 위한 도구 정의
            const functionDeclarations = this.availableTools.map(tool => {
                const convertedParameters = convertJsonSchemaToGeminiType(tool.parameters);
                
                console.log(`🔧 Gemini 함수 등록: "${tool.name}"`);
                
                return {
                    name: tool.name,
                    description: tool.description || "",
                    parameters: convertedParameters
                };
            });

            const tools = functionDeclarations.length > 0 ? [{
                functionDeclarations: functionDeclarations
            }] : [];

            // 반복적으로 함수 호출 처리 (compositional function calling)
            while (true) {
                const result: any = await this.genAI!.models.generateContent({
                    model: model,
                    contents,
                    config: { 
                        tools,
                        toolConfig: {
                            functionCallingConfig: {
                                mode: FunctionCallingConfigMode.MODE_UNSPECIFIED
                            }
                        },
                        thinkingConfig: {
                            thinkingBudget: 0
                        }
                    }
                });

                // Function Call이 있는지 확인
                if (result.functionCalls && result.functionCalls.length > 0) {
                    const functionCall: any = result.functionCalls[0];
                    const toolName = functionCall.name;
                    const toolArgs = functionCall.args;

                    console.log(`[Calling MCP tool ${toolName} with args ${JSON.stringify(toolArgs)}]`);

                    try {
                        // MCP 서버에 도구 요청
                        const toolResult = await this.callMCPTool(toolName || "unknown", toolArgs);

                        // Function Response 준비
                        const functionResponsePart = {
                            name: toolName || "unknown",
                            response: { result: toolResult }
                        };

                        // 대화 히스토리에 추가
                        contents.push({ 
                            role: "model", 
                            parts: [{ functionCall: functionCall } as any] 
                        });
                        contents.push({ 
                            role: "user", 
                            parts: [{ functionResponse: functionResponsePart } as any] 
                        });
                    } catch (error) {
                        console.error(`Error calling MCP tool ${toolName}:`, error);
                        
                        // 에러 정보를 포함한 Function Response
                        const errorResponse = {
                            name: toolName || "unknown",
                            response: { 
                                error: error instanceof Error ? error.message : "Unknown error occurred" 
                            }
                        };

                        contents.push({ 
                            role: "model", 
                            parts: [{ functionCall: functionCall } as any] 
                        });
                        contents.push({ 
                            role: "user", 
                            parts: [{ functionResponse: errorResponse } as any] 
                        });
                    }
                } else {
                    // 최종 응답 처리
                    let responseText = "";
                    
                    if (result.text) {
                        responseText = result.text;
                    } else if (result.candidates && result.candidates.length > 0) {
                        const candidate = result.candidates[0];
                        if (candidate.content && candidate.content.parts) {
                            const textParts = candidate.content.parts
                                .filter((part: any) => part.text)
                                .map((part: any) => part.text)
                                .join("");
                            responseText = textParts;
                        }
                    }
                    
                    return responseText || "No response received";
                }
            }
        } catch (error) {
            console.error('Gemini API Error:', error);
            if (error instanceof Error) {
                throw new Error(`Gemini API 오류: ${error.message}`);
            }
            throw new Error('알 수 없는 Gemini API 오류가 발생했습니다.');
        }
    }

    // 서비스 정리
    async cleanup() {
        await this.disconnectAllMCPServers();
    }
}
