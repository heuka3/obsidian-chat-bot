export interface ChatbotPluginSettings {
    aiProvider: 'openai' | 'gemini';
    openaiApiKey: string;
    geminiApiKey: string;
    model?: string;
    maxTokens?: number;
    chatHistoryFolder?: string;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
}