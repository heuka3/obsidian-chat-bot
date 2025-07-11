export interface ChatbotPluginSettings {
    openaiApiKey: string;
    model?: string;
    maxTokens?: number;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
}