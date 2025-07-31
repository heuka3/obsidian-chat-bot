import { ChatMessage, MCPServer, PlanProgressData } from "./types";
import { GoogleGenAI, Type, FunctionCallingConfigMode } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from 'child_process';
import { PlanToolSelectService } from "./plan-tool-select";
import { PlanExecutionService } from "./plan-execution";

export interface GeminiTool {
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
    private app: any = null; // Obsidian App 인스턴스
    
    // 함수 이름 매핑: sanitized 이름 -> 원본 서버 이름과 도구 이름
    private toolNameMapping: Map<string, { serverName: string, toolName: string }> = new Map();
    
    // 도구 이름 매핑: 원본 도구 이름 -> sanitized 이름 (역방향 매핑)
    private originalToSanitizedMapping: Map<string, string> = new Map();

    // 새로운 Plan & Execute 서비스
    private planToolSelectService: PlanToolSelectService | null = null;
    private planExecutionService: PlanExecutionService | null = null;
    private usePlanExecute: boolean = false; // 기본값은 false (기존 방식 사용)

    // search tool 설정
    private isGoogleSearchOn: boolean = false;
    private isPerplexitySearchOn: boolean = false;

    constructor(apiKey?: string, app?: any) {
        if (apiKey) {
            this.setApiKey(apiKey);
        }
        if (app) {
            this.app = app;
        }
    }

    setApiKey(apiKey: string) {
        this.apiKey = apiKey;
        if (apiKey) {
            this.genAI = new GoogleGenAI({ apiKey: apiKey });
            
            // Plan & Execute 서비스 초기화
            this.planToolSelectService = new PlanToolSelectService(apiKey);
            this.planExecutionService = new PlanExecutionService(apiKey, this, this.planToolSelectService);
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
        this.originalToSanitizedMapping.clear(); // 역방향 매핑도 초기화
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
        
        // 모든 서버 연결 완료 후 Plan & Execute 서비스 업데이트
        this.updatePlanExecuteServices();
    }

    // 단일 MCP 서버에 연결
    private async connectToMCPServer(server: MCPServer) {
        try {
            console.log(`🔗 MCP 서버 연결 시도: ${server.name}`);
            
            // 서버 파일의 디렉토리 추출
            const path = require('path');
            const fs = require('fs');
            
            // 명령어 파싱 (먼저 수행)
            const commandParts = server.command.split(' ');
            const command = commandParts[0];
            
            let serverDir = path.dirname(server.path);
            const serverFile = path.basename(server.path);
            
            // Node.js 서버인 경우 package.json이 있는 디렉토리 찾기
            const isNodeServer = command === 'node' || command.endsWith('node');
            if (isNodeServer) {
                let currentDir = serverDir;
                while (currentDir !== path.dirname(currentDir)) {
                    const packageJsonPath = path.join(currentDir, 'package.json');
                    if (fs.existsSync(packageJsonPath)) {
                        console.log(`📦 package.json 발견: ${packageJsonPath}`);
                        serverDir = currentDir;
                        break;
                    }
                    currentDir = path.dirname(currentDir);
                }
            }
            
            // 서버 파일의 상대 경로 계산
            const relativeServerPath = path.relative(serverDir, server.path);
            
            let args = [...commandParts.slice(1), relativeServerPath];
            
            // 추가 인자가 있으면 파싱해서 서버 파일 뒤에 추가
            if (server.args) {
                const additionalArgs = server.args.split(' ').filter(arg => arg.trim() !== '');
                args = [...commandParts.slice(1), relativeServerPath, ...additionalArgs];
            }
            
            console.log(`💻 실행 명령어: ${command} ${args.join(' ')}`);
            console.log(`📁 작업 디렉토리: ${serverDir}`);
            
            // Node.js 기반 서버인 경우 NODE_PATH 설정
            const env = {
                ...process.env,
                PATH: `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${process.env.PATH || ''}`
            } as Record<string, string>;
            
            if (isNodeServer) {
                // Node.js 서버의 경우 node_modules 경로 설정
                const nodeModulesPath = `${serverDir}/node_modules`;
                env.NODE_PATH = nodeModulesPath;
                console.log(`🟢 Node.js 서버 감지 - NODE_PATH 설정: ${nodeModulesPath}`);
            }
            
            const transport = new StdioClientTransport({
                command,
                args,
                cwd: serverDir, // 서버 스크립트의 디렉토리에서 실행
                env
            });

            const client = new Client({ name: "obsidian-chatbot", version: "1.0.0" });
            
            await client.connect(transport);
            
            const toolsResult = await client.listTools();
            
            // MCP 도구를 Gemini Function Calling 형태로 변환
            const tools = toolsResult.tools.map((tool) => {
                const originalName = `${server.name}_${tool.name}`;
                const validName = this.sanitizeFunctionName(originalName);
                
                // 양방향 매핑 정보 저장
                this.toolNameMapping.set(validName, {
                    serverName: server.name,
                    toolName: tool.name
                });
                this.originalToSanitizedMapping.set(tool.name, validName);
                
                console.log(`🔧 도구 이름 변환:`);
                console.log(`   원본 도구: "${tool.name}"`);
                console.log(`   조합된 이름: "${originalName}"`);
                console.log(`   정리된 이름: "${validName}"`);
                console.log(`   서버: ${server.name}`);
                console.log(`   매핑 저장: "${validName}" -> {serverName: "${server.name}", toolName: "${tool.name}"}`);
                
                if (originalName !== validName) {
                    console.log(`   ⚠️  이름 변경됨: "${originalName}" -> "${validName}"`);
                }
                
                return {
                    name: validName,
                    description: tool.description || `Tool from ${server.name}`,
                    parameters: tool.inputSchema,
                };
            });

            // 매핑 테이블 전체 출력 (디버깅용)
            console.log(`📋 도구 매핑 테이블 (${server.name}):`);
            for (const [key, value] of this.toolNameMapping.entries()) {
                console.log(`   "${key}" -> 서버="${value.serverName}", 도구="${value.toolName}"`);
            }

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
        // - 영숫자, 밑줄만 허용 (하이픈은 허용되지 않음)
        // - 최대 64자
        
        let sanitized = name
            .replace(/[^a-zA-Z0-9_]/g, '_')    // 허용되지 않는 문자를 밑줄로 변경 (하이픈 포함)
            .replace(/^[^a-zA-Z_]/, '_')       // 첫 문자가 문자나 밑줄이 아니면 밑줄 추가
            .replace(/_{2,}/g, '_')            // 연속된 밑줄을 하나로 정리
            .substring(0, 64);                 // 최대 64자로 제한
        
        return sanitized;
    }

    // Obsidian vault 이름 추출
    private getVaultName(): string {
        try {
            // Obsidian App API 사용 (가장 정확한 방법)
            if (this.app && this.app.vault) {
                const vaultName = this.app.vault.getName();
                if (vaultName && vaultName !== '') {
                    return vaultName;
                }
                
                // 대안: vault adapter의 basePath 사용
                const basePath = (this.app.vault.adapter as any)?.basePath;
                if (basePath) {
                    const path = require('path');
                    return path.basename(basePath);
                }
            }
            
            // 폴백: 기본값 반환
            return 'unknown-vault';
        } catch (error) {
            console.error('Error getting vault name:', error);
            return 'unknown-vault';
        }
    }

    // 시스템 컨텍스트 생성
    private buildSystemContext(vaultName: string, mentionedItems: Array<{name: string, path: string, type?: 'note' | 'webview' | 'pdf', url?: string}> = []): string {
        const availableToolsList = this.availableTools.length > 0 
            ? this.availableTools.map(tool => {
                const params = tool.parameters && tool.parameters.properties 
                    ? Object.keys(tool.parameters.properties).join(', ')
                    : '매개변수 없음';
                const required = tool.parameters && tool.parameters.required 
                    ? ` (필수: ${tool.parameters.required.join(', ')})`
                    : '';
                
                // 원본 도구 이름 찾기
                const mappingInfo = this.toolNameMapping.get(tool.name);
                const originalToolName = mappingInfo ? mappingInfo.toolName : 'unknown';
                const serverName = mappingInfo ? mappingInfo.serverName : 'unknown';
                
                return `- ${tool.name} [원본: ${originalToolName}@${serverName}]: ${tool.description}\n  매개변수: ${params}${required}`;
            }).join('\n')
            : '사용 가능한 도구가 없습니다.';

        const mentionedItemsText = mentionedItems.length > 0 
            ? `\n- 사용자가 언급한 항목: ${mentionedItems.map(item => {
                if (item.type === 'webview') {
                    return `"${item.name}" (웹뷰: ${item.url})`;
                } else if (item.type === 'pdf') {
                    // PDF 파일의 경우 절대 경로를 생성하여 전달
                    const absolutePath = this.getFileAbsolutePath(item.path);
                    console.log(`📄 buildSystemContext - PDF 경로 생성:
                      - 파일명: ${item.name}
                      - 원본 경로: ${item.path}  
                      - 절대 경로: ${absolutePath}`);
                    return `"${item.name}" (PDF 파일: ${item.path}, 절대경로: ${absolutePath})`;
                } else {
                    return `"${item.name}" (노트: ${item.path})`;
                }
            }).join(', ')}`
            : '';

        console.log('📝 buildSystemContext - 처리된 멘션 아이템:', mentionedItemsText);

        return `=== SYSTEM CONTEXT ===
당신은 Obsidian의 AI Chatbot 플러그인에서 작동하는 AI 어시스턴트입니다.

**현재 환경:**
- Obsidian Vault: "${vaultName}"
- 플러그인: AI Chatbot
- 위치: Obsidian 내부 플러그인 환경${mentionedItemsText}

**사용 가능한 도구 (MCP 서버를 통한 Function Calling):**
${availableToolsList}

**중요한 지침:**
1. 당신은 Obsidian vault "${vaultName}" 내에서 작동하고 있습니다.
2. 필요시 위의 도구들을 사용하여 사용자의 요청을 수행할 수 있습니다.
3. 파일 경로나 vault 관련 작업을 수행할 때는 현재 vault 이름을 고려하세요.
4. 도구를 사용할 때는 적절한 매개변수를 전달하여 정확한 결과를 얻도록 하세요.
5. 사용자가 vault나 노트에 대한 질문을 할 때는 현재 "${vaultName}" vault 컨텍스트에서 답변하세요.
6. 사용자가 언급한 노트들이 있다면 해당 노트들의 내용을 참고하여 답변하세요.
7. 사용자가 웹뷰를 언급한 경우, 해당 웹사이트의 URL을 참고하여 답변하세요.
8. 사용자가 PDF 파일을 언급한 경우, 제공된 절대경로를 통해 해당 PDF 파일에 접근하여 내용을 참고하세요.

**⚠️ Function Calling 필수 규칙:**
- 도구를 호출할 때는 반드시 해당 도구의 정확한 스키마에 정의된 매개변수만 사용하세요.
- 스키마에 없는 매개변수를 임의로 추가하거나 생성하지 마세요.
- 각 도구의 description을 정확히 읽고 용도에 맞게만 사용하세요.
- 매개변수 타입(string, number, boolean 등)을 정확히 지켜주세요.
- 필수 매개변수(required)는 반드시 포함하고, 선택적 매개변수만 생략 가능합니다.
- 확실하지 않은 매개변수는 사용하지 말고, 사용자에게 명확히 요청하세요.
- 도구 이름에 하이픈(-)이 언더스코어(_)로 변경되어 표시되지만, 실제 도구는 원본 이름으로 실행됩니다.

=======================`;
    }

    // MCP 도구 호출 (외부에서 접근 가능)
    async callMCPTool(toolName: string, args: any): Promise<any> {
        console.log(`🔧 MCP 도구 호출 요청: "${toolName}"`);
        
        // 매핑된 정보 조회
        const mappingInfo = this.toolNameMapping.get(toolName);
        if (!mappingInfo) {
            console.error(`❌ 도구 매핑 정보를 찾을 수 없음: "${toolName}"`);
            console.error(`📋 현재 사용 가능한 매핑:`);
            for (const [key, value] of this.toolNameMapping.entries()) {
                console.error(`   "${key}" -> 서버="${value.serverName}", 도구="${value.toolName}"`);
            }
            throw new Error(`Tool mapping not found for ${toolName}`);
        }
        
        const { serverName, toolName: actualToolName } = mappingInfo;
        console.log(`📝 매핑 정보 해석:`);
        console.log(`   Gemini 도구 이름: "${toolName}"`);
        console.log(`   → 서버: "${serverName}"`);
        console.log(`   → 실제 도구 이름: "${actualToolName}"`);
        
        const client = this.mcpClients.get(serverName);
        if (!client) {
            console.error(`❌ MCP 서버를 찾을 수 없음: "${serverName}"`);
            console.error(`📋 사용 가능한 MCP 클라이언트:`);
            for (const [key, value] of this.mcpClients.entries()) {
                console.error(`   "${key}"`);
            }
            throw new Error(`MCP server ${serverName} not found`);
        }

        console.log(`🚀 MCP 도구 실행:`);
        console.log(`   서버: "${serverName}"`);
        console.log(`   도구: "${actualToolName}"`);
        console.log(`   매개변수: ${JSON.stringify(args)}`);
        
        // PDF 파일 경로 특별 디버깅
        if (args.path && args.path.includes('.pdf')) {
            console.log(`📄 PDF 파일 경로 디버깅:`);
            console.log(`   전달된 경로: ${args.path}`);
            console.log(`   경로 길이: ${args.path.length}`);
            console.log(`   한글 포함: ${/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(args.path)}`);
            console.log(`   UTF-8 바이트 수: ${Buffer.byteLength(args.path, 'utf8')}`);
        }
        
        const result = await client.callTool({
            name: actualToolName,
            arguments: args,
        });

        console.log(`✅ MCP 도구 실행 완료: "${actualToolName}"`);
        console.log(`   결과: ${JSON.stringify(result)}`);
        return result.content;
    }

    /**
     * Plan & Execute 모드에서 진행 상황을 콜백으로 알려주면서 메시지 전송
     */
    async sendMessageWithProgress(
        model: string = 'gemini-2.5-flash', 
        mentionedItems: Array<{name: string, path: string, type?: 'note' | 'webview' | 'pdf', url?: string}> = [],
        progressCallback: (data: PlanProgressData) => void
    ): Promise<string> {
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
        const conversationContext = contextForInstruction.map(m => 
            `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
        ).join('\n');

        // Plan & Execute 모드만 지원
        if (!this.usePlanExecute || !this.planToolSelectService || !this.planExecutionService) {
            throw new Error("Plan & Execute 모드가 활성화되지 않았습니다.");
        }

        console.log("🎯 Plan & Execute 모드로 실행 (진행 상황 추적)");
        
        try {
            // 1단계: 계획 수립
            progressCallback({ status: "계획 수립 중..." });
            
            // Obsidian vault 이름 추출
            const vaultName = this.getVaultName();
            
            // 환경 정보 구성 (sendMessage 메서드와 동일한 방식)
            const environmentContext = `=== OBSIDIAN 환경 정보 ===
- Obsidian Vault: "${vaultName}"
- 플러그인: AI Chatbot (Plan & Execute 모드)
- 위치: Obsidian 내부 플러그인 환경
${mentionedItems.length > 0 ? `- 사용자가 언급한 항목: ${mentionedItems.map(item => {
    if (item.type === 'webview') {
        return `"${item.name}" (웹뷰: ${item.url})`;
    } else if (item.type === 'pdf') {
        // PDF 파일의 경우 절대 경로를 생성하여 전달
        const absolutePath = this.getFileAbsolutePath(item.path);
        console.log(`📄 PDF 파일 경로 처리: 
          - 파일명: ${item.name}
          - 원본 경로: ${item.path}
          - 절대 경로: ${absolutePath}
          - 한글 포함: ${/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(item.name)}
          - 공백 포함: ${/\s/.test(item.name)}`);
        return `"${item.name}" (PDF 파일: ${item.path}, 절대경로: ${absolutePath})`;
    } else {
        return `"${item.name}" (경로: ${item.path})`;
    }
}).join(', ')}` : ''}

**중요 컨텍스트:**
- 당신은 Obsidian vault "${vaultName}" 내에서 작동하고 있습니다.
- 파일 경로나 vault 관련 작업을 수행할 때는 현재 vault 이름을 고려하세요.
- 사용자가 vault나 노트에 대한 질문을 할 때는 현재 "${vaultName}" vault 컨텍스트에서 답변하세요.
- 사용자가 웹뷰를 언급한 경우, 해당 웹사이트의 내용을 참고하여 답변하세요.
- 사용자가 PDF 파일을 언급한 경우, 절대경로를 통해 해당 PDF 파일에 접근할 수 있습니다.
- **PDF 파일 경로 처리 시 주의사항:**
  * 위에 제공된 절대경로는 한글 파일명을 포함하여 정확한 전체 경로입니다
  * PDF 도구 호출 시 절대경로를 정확히 그대로 사용해야 합니다
  * 한글, 공백, 특수문자가 포함된 파일명도 절대경로 그대로 전달하세요
===============================`;
            
            const executionPlan = await this.planToolSelectService.createExecutionPlan(
                lastUserMsg.content, 
                conversationContext, 
                environmentContext
            );
            
            if (executionPlan && executionPlan.steps && executionPlan.steps.length > 0) {
                const planSteps = executionPlan.steps.map(step => 
                    `${step.stepNumber}. ${step.purpose} (도구: ${step.toolName})`
                );
                
                progressCallback({ 
                    status: "계획 수립 완료",
                    plan: planSteps,
                    totalSteps: executionPlan.steps.length,
                    currentStep: 0
                });

                // 2단계: 계획 실행
                const result = await this.planExecutionService.executePlan(
                    lastUserMsg.content,
                    executionPlan, 
                    conversationContext, 
                    environmentContext,
                    (stepProgress: PlanProgressData) => {
                        // 계획 정보를 포함하여 전달
                        progressCallback({
                            ...stepProgress,
                            plan: planSteps,
                            totalSteps: executionPlan.steps.length
                        });
                    }
                );
                
                progressCallback({ 
                    status: "완료",
                    plan: planSteps,
                    currentStep: executionPlan.steps.length,
                    totalSteps: executionPlan.steps.length
                });

                return result;
            } else if(executionPlan.steps.length === 0) {
                // 계획 수립이 되었지만 실행할 단계가 없는 경우
                progressCallback({ status: "계획 수립 완료, 실행할 단계가 없으므로 기본 모드(도구 사용 x)로 전환합니다." });
                console.log("계획 수립 완료, 실행할 단계가 없습니다. 기본 모드(도구 사용 x)로 전환합니다.");
                return await this.sendMessageWithoutTools(model, lastUserMsg, conversationContext, executionPlan.overallGoal, executionPlan.plan);
            } else {
                // 계획 수립 실패 시 기존 모드로 폴백
                progressCallback({ status: "계획 수립 실패, 기본 모드로 전환..." });
                return await this.sendMessageLegacy(model, mentionedItems);
            }
        } catch (error) {
            console.error("Plan & Execute 모드 실행 중 오류:", error);
            progressCallback({ status: "오류 발생, 기본 모드(도구 1개만 사용 가능)로 전환..." });
            // 오류 발생 시 기존 모드로 폴백
            return await this.sendMessageLegacy(model, mentionedItems);
        }
    }

    /**
     * 기존 Function Calling 방식 (폴백용)
     */
    async sendMessageLegacy(model: string, mentionedItems: Array<{name: string, path: string, type?: 'note' | 'webview' | 'pdf', url?: string}>): Promise<string> {
        // 최근 user/assistant 메시지 10쌍(21개) 추출
        const filtered = this.conversationHistory.filter(m => m.role === 'user' || m.role === 'assistant');
        const latest_context = filtered.slice(-21);

        // 가장 최근 user 메시지 추출
        if (latest_context.length === 0) throw new Error("No user message found.");
        const lastUserMsgRealIdx = latest_context.length - 1;
        const lastUserMsg = latest_context[lastUserMsgRealIdx];

        // instruction용 대화 맥락
        const contextForInstruction = latest_context.slice(0, lastUserMsgRealIdx);
        
        // Obsidian vault 이름 추출
        const vaultName = this.getVaultName();
        
        // 시스템 컨텍스트 생성
        const systemContext = this.buildSystemContext(vaultName, mentionedItems);
        console.log('🏗️ Legacy 모드 - 시스템 컨텍스트:', systemContext);
        
        // 대화 내용 구성
        let contents = [];
        
        if (contextForInstruction.length > 0) {
            const contextText = contextForInstruction.map(m => 
                `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
            ).join('\n');
            
            contents.push({
                role: "user",
                parts: [{
                    text: `${systemContext}\n\n아래 대화 내용을 참고하여 대화 맥락을 파악하고 User의 메시지에 친절하게 답변하세요.\n\n---\n${contextText}\n---\n\n${lastUserMsg.content}`
                }]
            });
        } else {
            contents.push({
                role: "user",
                parts: [{ text: `${systemContext}\n\n${lastUserMsg.content}` }]
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

                    console.log(`🔍 Function Call 디버깅:`);
                    console.log(`   Gemini가 호출한 도구 이름: "${toolName}"`);
                    console.log(`   매개변수: ${JSON.stringify(toolArgs)}`);
                    
                    // 매핑 정보 확인
                    const mappingInfo = this.toolNameMapping.get(toolName);
                    if (mappingInfo) {
                        console.log(`   ✅ 매핑 찾음: 서버="${mappingInfo.serverName}", 원본 도구="${mappingInfo.toolName}"`);
                    } else {
                        console.log(`   ❌ 매핑 없음! 사용 가능한 매핑:`);
                        for (const [key, value] of this.toolNameMapping.entries()) {
                            console.log(`      "${key}" -> 서버="${value.serverName}", 도구="${value.toolName}"`);
                        }
                    }

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

    async sendMessageWithoutTools(
        model: string,
        lastUserMsg: ChatMessage,
        conversationContext: string,
        overallGoal: string,
        plan: string
    ): Promise<string> {
        // 순수 LLM 답변만 생성 (Function Calling/Tool 사용 X)
        // context, goal, plan, user message를 최대한 활용
        try {
            // 시스템 컨텍스트(도구 안내 등) 없이, 환경/목표/계획/대화 맥락만 포함
            let prompt = `=== 목표(Goal) ===\n${overallGoal}\n` +
                `\n` +
                `=== 계획(Plan) ===\n${plan}\n` +
                `\n`;

            if (conversationContext && conversationContext.trim().length > 0) {
                prompt += `=== 최근 대화 맥락 ===\n${conversationContext}\n\n`;
            }

            prompt += `=== User의 요청 ===\n${lastUserMsg.content}\n`;

            prompt += `\n\n[답변 작성 가이드]\n` +
                `- 반드시 한국어로 답변하세요.\n` +
                `- Obsidian Vault 환경에 맞는 답변을 하세요.\n` +
                `- 최대한 자세하고 친절하게 설명하세요.\n` +
                `- 핵심 정보뿐 아니라, 관련된 배경지식, 원리, 추가 설명, 주의사항, 실전 팁 등도 함께 제공하세요.\n` +
                `- 필요하다면 예시, 근거, 참고자료, 단계별 설명, 표, 리스트 등 다양한 형식으로 답변을 풍부하게 만드세요.\n` +
                `- 사용자가 이해하기 쉽도록 논리적이고 체계적으로 답변을 구성하세요.\n` +
                `- 너무 짧게 요약하지 말고, 충분한 분량으로 설명하세요.\n` +
                `- 만약 추가로 도움이 될 만한 정보가 있다면 마지막에 \"[추가 정보]\" 섹션으로 안내하세요.`;

            const contents = [
                {
                    role: "user",
                    parts: [{ text: prompt }]
                }
            ];

            const result: any = await this.genAI!.models.generateContent({
                model: model,
                contents
            });

            // Gemini API 응답 파싱
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
        } catch (error) {
            console.error('Gemini API Error (sendMessageWithoutTools):', error);
            if (error instanceof Error) {
                throw new Error(`Gemini API 오류: ${error.message}`);
            }
            throw new Error('알 수 없는 Gemini API 오류가 발생했습니다.');
        }
    }

    // Plan & Execute 서비스 업데이트
    private updatePlanExecuteServices() {
        if (this.planToolSelectService) {
            this.planToolSelectService.updateAvailableTools(this.availableTools, this.toolNameMapping, this.isGoogleSearchOn, this.isPerplexitySearchOn);
            console.log(`🔄 Plan & Execute 서비스 업데이트: ${this.availableTools.length}개 도구`);
        }
    }

    // Plan & Execute 모드 설정
    setPlanExecuteMode(enabled: boolean) {
        this.usePlanExecute = enabled;
        console.log(`🎯 Plan & Execute 모드: ${enabled ? '활성화' : '비활성화'}`);
    }

    // Plan & Execute 모드 상태 확인
    isPlanExecuteMode(): boolean {
        return this.usePlanExecute;
    }

    // search tool 설정

    // Google Search와 Perplexity Search 활성화 여부
    isGoogleSearchEnabled(): boolean {
        return this.isGoogleSearchOn;
    }

    isPerplexitySearchEnabled(): boolean {
        return this.isPerplexitySearchOn;
    }

    // Google Search와 Perplexity Search 활성화 및 비활성화
    disableSearchTool(target: string) {
        if (target === 'google-search') {
            this.isGoogleSearchOn = false;
        } else if (target === 'perplexity-search') {
            this.isPerplexitySearchOn = false;
        }
        if (this.planToolSelectService) {
            this.planToolSelectService.updateAvailableTools(this.availableTools, this.toolNameMapping, this.isGoogleSearchOn, this.isPerplexitySearchOn);
        }
    }

    enableSearchTool(target: string) {
        if (target === 'google-search') {
            this.isGoogleSearchOn = true;
        } else if (target === 'perplexity-search') {
            this.isPerplexitySearchOn = true;
        }
        if (this.planToolSelectService) {
            this.planToolSelectService.updateAvailableTools(this.availableTools, this.toolNameMapping, this.isGoogleSearchOn, this.isPerplexitySearchOn);
        }
    }

    // 서비스 정리
    async cleanup() {
        await this.disconnectAllMCPServers();
    }
    
    // 특정 도구의 정보를 가져오는 메서드
    getToolInfo(toolName: string): GeminiTool | null {
        return this.availableTools.find(tool => tool.name === toolName) || null;
    }
    
    // 모든 사용 가능한 도구 정보를 가져오는 메서드  
    getAllToolsInfo(): GeminiTool[] {
        return [...this.availableTools];
    }
    
    // PDF 파일의 절대 경로를 생성하는 메서드 (PDF 전용)
    private getFileAbsolutePath(relativePath: string): string {
        try {
            if (this.app && this.app.vault) {
                const basePath = (this.app.vault.adapter as any)?.basePath;
                if (basePath && relativePath) {
                    const path = require('path');
                    return path.join(basePath, relativePath);
                }
            }
            return relativePath; // 절대 경로를 얻을 수 없으면 상대 경로 그대로 반환
        } catch (error) {
            console.error('Error creating absolute path for PDF:', error);
            return relativePath;
        }
    }

    // 도구 이름 매핑 정보 반환 (Plan & Execute에서 사용)
    getToolNameMapping(): Map<string, { serverName: string, toolName: string }> {
        return this.toolNameMapping;
    }
}
