import OpenAI from "openai";

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';  //변수가 가질 수 있는 값을 명확히 제한하는 타입
    content: string;
}

export class OpenAIService {
    private openai: OpenAI | null = null;
    private apiKey: string = '';
    private conversationHistory: ChatMessage[] = [];

    constructor(apiKey?: string) {  //?를 통해 apiKey가 필수 매개변수가 아님을 나타냄
        if (apiKey) {
            this.setApiKey(apiKey);
        }
    }

    setApiKey(apiKey: string) {
        this.apiKey = apiKey;
        if (apiKey) {
            this.openai = new OpenAI({
                apiKey: apiKey,
                dangerouslyAllowBrowser: true // Obsidian 플러그인에서 사용하기 위해 필요
            });
        }
    }

    isConfigured(): boolean {   // 반환값이 boolean 타입임을 명시
        return this.openai !== null && this.apiKey !== '';
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
     * model: string - 사용할 모델명 (예: "gpt-4.1")
     */
    async sendMessage(
        model: string = 'gpt-4.1',
        //maxTokens: number = 1000
    ): Promise<string> {    
        // 반환값이 Promise객체이고, Promise가 resolve(성공)될 때 string값이 나옴.
        // 비동기 함수라서 실햄 결과가 바로 나오지 않기 때문.

        if (!this.isConfigured()) {
            throw new Error('OpenAI API key가 설정되지 않았습니다.');
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
        const input = contextForInstruction.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n');

        // instruction(시스템 프롬프트) 생성
        const instruction =
            "아래 대화 내용을 참고하여 대화 맥락을 파악하고 User의 메시지에 친절하게 답변하세요. " +
            "---\n" +
            input +
            "\n---\n";

        try {   // NOTE!! openai api 호출 방식이 업데이트 되었으므로 절대 아래의 호출 방식을 수정하지 말것
            const response = await this.openai!.responses.create({  //!로 null 가능성을 제거
                model: model,
                input: lastUserMsg.content,
                instructions: instruction,
                // maxTokens, temperature 등은 필요에 따라 추가
            });

            // 응답에서 텍스트 추출
            const output = response.output?.[0];
            if (
                output &&
                output.type === "message" &&
                Array.isArray(output.content) &&
                output.content.length > 0 &&
                output.content[0].type === "output_text"
            ) {
                return output.content[0].text;
            }

            throw new Error('OpenAI로부터 응답을 받지 못했습니다.');
        } catch (error) {
            console.error('OpenAI API Error:', error);
            if (error instanceof Error) {
                throw new Error(`OpenAI API 오류: ${error.message}`);
            }
            throw new Error('알 수 없는 OpenAI API 오류가 발생했습니다.');
        }
    }
}
