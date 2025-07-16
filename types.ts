export interface MCPServer {
    name: string;
    path: string;
    command: string;
    args?: string;
    enabled: boolean;
}

export interface ChatbotPluginSettings {
    aiProvider: 'openai' | 'gemini';
    openaiApiKey: string;
    geminiApiKey: string;
    model?: string;
    maxTokens?: number;
    chatHistoryFolder?: string;
    mcpServers?: MCPServer[];
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
}