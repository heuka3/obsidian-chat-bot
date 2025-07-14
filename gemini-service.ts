import { ChatMessage } from "./types";
import { GoogleGenAI, Type } from "@google/genai";
//genai라이브러리 기반으로 docs참고해서 mcp연결 및 function calling 기능 구현하기

export class GeminiService {
    private apiKey: string = '';
    private conversationHistory: ChatMessage[] = [];
    private apiUrl: string = 'https://generativelanguage.googleapis.com/v1beta/models/';

    constructor(apiKey?: string) {
        if (apiKey) {
            this.setApiKey(apiKey);
        }
    }

    setApiKey(apiKey: string) {
        this.apiKey = apiKey;
    }

    isConfigured(): boolean {
        return this.apiKey !== '';
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

    /**
     * Gemini API를 사용해서 메시지 전송
     * model: string - 사용할 모델명 (예: "gemini-2.5-pro")
     */
    async sendMessage(
        model: string = 'gemini-2.5-flash'
    ): Promise<string> {
        if (!this.isConfigured()) {
            throw new Error('Gemini API key가 설정되지 않았습니다.');
        }

        // 최근 user/assistant 메시지 10쌍(21개) 추출
        const filtered = this.conversationHistory.filter(m => m.role === 'user' || m.role === 'assistant');
        const latest_context = filtered.slice(-21);

        // 가장 최근 user 메시지 추출 (항상 마지막 메시지라고 가정)
        if (latest_context.length === 0) throw new Error("No user message found.");
        const lastUserMsgRealIdx = latest_context.length - 1;
        const lastUserMsg = latest_context[lastUserMsgRealIdx];

        // instruction용 대화 맥락(latest_context에서 마지막 user 메시지 제외)
        const contextForInstruction = latest_context.slice(0, lastUserMsgRealIdx);
        
        // Gemini용 메시지 형식으로 변환
        const contents = [];
        
        // 시스템 프롬프트 추가
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
            // 첫 메시지인 경우
            contents.push({
                role: "user",
                parts: [{ text: lastUserMsg.content }]
            });
        }

        try {
            const response = await fetch(`${this.apiUrl}${model}:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: contents,
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 2048,
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Gemini API 오류: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            
            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
                const text = data.candidates[0].content.parts[0].text;
                return text;
            }

            throw new Error('Gemini로부터 응답을 받지 못했습니다.');
        } catch (error) {
            console.error('Gemini API Error:', error);
            if (error instanceof Error) {
                throw new Error(`Gemini API 오류: ${error.message}`);
            }
            throw new Error('알 수 없는 Gemini API 오류가 발생했습니다.');
        }
    }
}
