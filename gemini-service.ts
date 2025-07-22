import { ChatMessage, MCPServer } from "./types";
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
            this.planExecutionService = new PlanExecutionService(apiKey, this);
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

            // Plan & Execute 서비스에 도구 정보 업데이트
            if (this.planToolSelectService) {
                this.planToolSelectService.updateAvailableTools(this.availableTools, this.toolNameMapping);
            }
            
            this.availableTools.push(...tools);
            this.mcpClients.set(server.name, client);
            this.mcpTransports.set(server.name, transport);

            console.log(`✅ MCP 서버 ${server.name} 연결 완료 (${tools.length}개 도구)`);
            
            // 모든 서버 연결 완료 후 Plan & Execute 서비스 업데이트
            this.updatePlanExecuteServices();
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

    // Vault의 절대 경로를 얻는 메서드
    private getVaultAbsolutePath(): string {
        try {
            if (this.app && this.app.vault) {
                // vault adapter의 basePath 사용 (절대 경로)
                const basePath = (this.app.vault.adapter as any)?.basePath;
                if (basePath) {
                    return basePath;
                }
            }
            
            // 폴백: 빈 문자열 반환
            return '';
        } catch (error) {
            console.error('Error getting vault absolute path:', error);
            return '';
        }
    }

    // 파일의 절대 경로를 생성하는 메서드
    private getFileAbsolutePath(relativePath: string): string {
        try {
            const vaultPath = this.getVaultAbsolutePath();
            if (vaultPath && relativePath) {
                const path = require('path');
                return path.join(vaultPath, relativePath);
            }
            return relativePath; // 절대 경로를 얻을 수 없으면 상대 경로 그대로 반환
        } catch (error) {
            console.error('Error creating absolute path:', error);
            return relativePath;
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
                    const absolutePath = this.getFileAbsolutePath(item.path);
                    return `"${item.name}" (PDF 파일: ${item.path}, 절대경로: ${absolutePath})`;
                } else {
                    return `"${item.name}" (노트: ${item.path})`;
                }
            }).join(', ')}`
            : '';

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
     * mentionedNotes: Array<{name: string, path: string}> - 언급된 노트 목록 (이름과 경로)
     */
    async sendMessage(model: string = 'gemini-2.5-flash', mentionedItems: Array<{name: string, path: string, type?: 'note' | 'webview' | 'pdf', url?: string}> = []): Promise<string> {
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

        // Plan & Execute 모드 확인
        if (this.usePlanExecute && this.planToolSelectService && this.planExecutionService) {
            console.log("🎯 Plan & Execute 모드로 실행");
            
            try {
                // Obsidian vault 이름 추출
                const vaultName = this.getVaultName();
                
                // 환경 정보 구성
                const environmentContext = `=== OBSIDIAN 환경 정보 ===
- Obsidian Vault: "${vaultName}"
- 플러그인: AI Chatbot (Plan & Execute 모드)
- 위치: Obsidian 내부 플러그인 환경
${mentionedItems.length > 0 ? `- 사용자가 언급한 항목: ${mentionedItems.map(item => {
    if (item.type === 'webview') {
        return `"${item.name}" (웹뷰: ${item.url})`;
    } else if (item.type === 'pdf') {
        const absolutePath = this.getFileAbsolutePath(item.path);
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
===============================`;

                // 1. 계획 수립
                const plan = await this.planToolSelectService.createExecutionPlan(
                    lastUserMsg.content,
                    conversationContext,
                    environmentContext
                );

                // 2. 계획 실행
                const response = await this.planExecutionService.executePlan(
                    lastUserMsg.content,
                    plan,
                    conversationContext,
                    environmentContext
                );

                return response;
            } catch (error) {
                console.error('Plan & Execute 모드 실행 실패:', error);
                console.log('기존 모드로 폴백합니다.');
                // 기존 모드로 폴백
            }
        }

        // 기존 Function Calling 모드
        console.log("🔧 기존 Function Calling 모드로 실행");
        return await this.sendMessageLegacy(model, mentionedItems, conversationContext);
    }

    /**
     * 기존 Function Calling 방식 (폴백용)
     */
    private async sendMessageLegacy(model: string, mentionedItems: Array<{name: string, path: string, type?: 'note' | 'webview' | 'pdf', url?: string}>, conversationContext: string): Promise<string> {
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

    // Plan & Execute 서비스 업데이트
    private updatePlanExecuteServices() {
        if (this.planToolSelectService) {
            this.planToolSelectService.updateAvailableTools(this.availableTools, this.toolNameMapping);
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
}
