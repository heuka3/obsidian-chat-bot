import { GoogleGenAI, Type, FunctionCallingConfigMode } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import dotenv from "dotenv";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set");
}

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

class MCPClient {
    private mcp: Client;
    private genAI: GoogleGenAI;
    private transport: StdioClientTransport | null = null;
    private tools: GeminiTool[] = [];

    constructor() {
    this.genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY! });
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    }
    // methods will go here
    async connectToServer(serverScriptPath: string) {
    try {
        const isJs = serverScriptPath.endsWith(".js");
        const isPy = serverScriptPath.endsWith(".py");
        if (!isJs && !isPy) {
        throw new Error("Server script must be a .js or .py file");
        }
        const command = isPy
        ? process.platform === "win32"
            ? "python"
            : "python3"
        : process.execPath;

        this.transport = new StdioClientTransport({
        command,
        args: [serverScriptPath],
        });

        await this.mcp.connect(this.transport);

        const toolsResult = await this.mcp.listTools();
        
        // MCP 도구를 Gemini Function Calling 형태로 변환
        this.tools = toolsResult.tools.map((tool) => {
        return {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema, // Gemini는 parameters를 사용
            };
        });

        console.log(
        "Connected to server with tools:",
        this.tools.map(({ name }) => name)
        );
    } catch (e) {
        console.log("Failed to connect to MCP server: ", e);
        throw e;
        }
    }
    async processQuery(query: string) {
        try {
            // Function Calling을 위한 도구 정의
            const functionDeclarations = this.tools.map(tool => {
                const convertedParameters = convertJsonSchemaToGeminiType(tool.parameters);
                
                return {
                    name: tool.name,
                    description: tool.description || "",
                    parameters: convertedParameters
                };
            });

            const tools = functionDeclarations.length > 0 ? [{
                functionDeclarations: functionDeclarations
            }] : [];

            // 대화 내용 구성
            let contents = [
                {
                    role: "user",
                    parts: [{ text: query }]
                }
            ];

            // 반복적으로 함수 호출 처리 (compositional function calling)
            while (true) {
                const result = await this.genAI.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents,
                    config: { 
                        tools,
                        toolConfig: {
                            functionCallingConfig: {
                                mode: FunctionCallingConfigMode.MODE_UNSPECIFIED //이렇게 해야 항상 function calling 활성화 하지 않을 수 있음.
                            }
                        },
                        thinkingConfig: {   // thinking 모드 비활성화로 비용 절약
                            thinkingBudget: 0
                        }
                    }
                });

                console.log("=== GEMINI RESULT ===");
                console.log(JSON.stringify(result, null, 2));
                console.log("=== END RESULT ===");

                // Function Call이 있는지 확인
                if (result.functionCalls && result.functionCalls.length > 0) {
                    const functionCall = result.functionCalls[0];
                    const toolName = functionCall.name;
                    const toolArgs = functionCall.args;

                    console.log(`[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`);

                    // MCP 서버에 도구 요청
                    const toolResult = await this.mcp.callTool({
                        name: toolName || "unknown",
                        arguments: toolArgs as { [x: string]: unknown },
                    });

                    // Function Response 준비
                    const functionResponsePart = {
                        name: toolName || "unknown",
                        response: { result: toolResult.content }
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
                } else {
                    // 전체 응답을 처리 (thoughtSignature 포함)
                    let responseText = "";
                    
                    // 텍스트 부분 추출
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
            console.error("Error processing query:", error);
            return "Sorry, I encountered an error while processing your request.";
        }
    }
    async chatLoop() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        try {
            console.log("\nMCP Client Started with Gemini 2.5 Flash!");
            console.log("Type your queries or 'quit' to exit.");

            while (true) {
            const message = await rl.question("\nQuery: ");
            if (message.toLowerCase() === "quit") {
                break;
            }
            const response = await this.processQuery(message);
            console.log("\n" + response);
            }
        } finally {
            rl.close();
        }
    }

    async cleanup() {
        await this.mcp.close();
    }
}

async function main() {
  if (process.argv.length < 3) {
    console.log("Usage: node index.ts <path_to_server_script>");
    return;
  }
  const mcpClient = new MCPClient();
  try {
    await mcpClient.connectToServer(process.argv[2]);
    await mcpClient.chatLoop();
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main();