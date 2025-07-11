import { ItemView, WorkspaceLeaf } from "obsidian";
import { OpenAIService, ChatMessage } from "./openai-service";

export const VIEW_TYPE_CHATBOT = "chatbot-view";

export class ChatbotView extends ItemView {
    private openaiService: OpenAIService;
    private isProcessing: boolean = false; // 중복 처리 방지 플래그
    private plugin: any; // 플러그인 인스턴스 참조
    private messageInput: HTMLTextAreaElement | null = null; // 입력 필드 참조
    private sendButton: HTMLButtonElement | null = null; // 전송 버튼 참조

    constructor(leaf: WorkspaceLeaf, plugin?: any) {
        super(leaf);
        this.openaiService = new OpenAIService();
        this.plugin = plugin;
        
        // 플러그인이 있으면 초기 API 키 설정
        if (this.plugin && this.plugin.settings) {
            this.openaiService.setApiKey(this.plugin.settings.openaiApiKey);
        }
    }

    // API 키 업데이트 메서드
    updateApiKey(apiKey: string) {
        this.openaiService.setApiKey(apiKey);
        console.log('API key updated in ChatbotView:', apiKey ? 'Key set' : 'Key cleared');
    }

    getViewType() {
        return VIEW_TYPE_CHATBOT;
    }

    getDisplayText() {
        return "AI Chatbot";
    }

    async onOpen() {
        // 플러그인 설정에서 API 키 재설정 (뷰가 열릴 때마다)
        if (this.plugin && this.plugin.settings) {
            this.openaiService.setApiKey(this.plugin.settings.openaiApiKey);
        }
        
        // 디버깅을 위한 로그
        // console.log('contentEl:', this.contentEl);
        // console.log('contentEl children length:', this.contentEl.children.length);
        // console.log('contentEl children:', this.contentEl.children);
        
        // contentEl이 비어있다면 직접 사용
        let container: HTMLElement;
        if (this.contentEl.children.length > 1) {
            container = this.contentEl.children[1] as HTMLElement;
        } else {
            // children[1]이 없으면 contentEl 자체를 사용
            container = this.contentEl;
        }
        
        container.empty();
        
        // 채팅 컨테이너 생성 (제목도 포함)
        const chatContainer = container.createEl("div", {
            cls: "chatbot-container"
        });
        
        // 제목을 컨테이너 안으로 이동
        chatContainer.createEl("h2", { text: "AI Chatbot", cls: "chatbot-title" });

        // 메시지 영역
        const messagesContainer = chatContainer.createEl("div", {
            cls: "chatbot-messages"
        });

        // 입력 영역 전체 컨테이너
        const inputSection = chatContainer.createEl("div", {
            cls: "chatbot-input-section"
        });

        // 메시지 입력창 컨테이너
        const inputContainer = inputSection.createEl("div", {
            cls: "chatbot-input-container"
        });

        // 메시지 입력창 (textarea로 변경)
        const messageInput = inputContainer.createEl("textarea", {
            placeholder: "메시지를 입력하세요... (Enter: 전송, Shift+Enter: 줄바꿈)",
            cls: "chatbot-input"
        }) as HTMLTextAreaElement;
        
        // 클래스 멤버로 참조 저장
        this.messageInput = messageInput;

        // 하단 버튼 영역
        const buttonContainer = inputSection.createEl("div", {
            cls: "chatbot-button-container"
        });

        // 빠른 설정 버튼
        const settingsButton = buttonContainer.createEl("button", {
            text: "⚙️",
            cls: "chatbot-settings-button"
        });

        // 설정 버튼 클릭 이벤트
        settingsButton.addEventListener("click", () => {
            // 플러그인 설정 탭 열기, 일단 편의를 위해 전체 설정 페이지만 열게함, 나중에 이 플러그인 설정 탭으로 이동하게끔 수정해야함.
            (this.app as any).setting.open();
            //(this.app as any).setting.openTabById('openai-chatbot');
        });

        // 전송 버튼 (이모지 사용)
        const sendButton = buttonContainer.createEl("button", {
            text: "➤",
            cls: "chatbot-send-button"
        });
        
        // 클래스 멤버로 참조 저장
        this.sendButton = sendButton;

        // 자동 높이 조절 함수
        const adjustTextareaHeight = () => {
            // 높이를 최소값으로 리셋
            messageInput.style.height = '28px'; // 32px → 28px로 변경
            
            // 내용이 있을 때만 높이 재계산
            if (messageInput.value) {
                const scrollHeight = messageInput.scrollHeight;
                const maxHeight = 120;
                
                if (scrollHeight <= maxHeight) {
                    messageInput.style.height = scrollHeight + 'px';
                    messageInput.style.overflowY = 'hidden';
                } else {
                    messageInput.style.height = maxHeight + 'px';
                    messageInput.style.overflowY = 'auto';
                }
            } else {
                // 내용이 없으면 최소 높이 유지
                messageInput.style.overflowY = 'hidden';
            }
        };

        // 입력할 때마다 높이 조절
        messageInput.addEventListener("input", adjustTextareaHeight);
        
        // 초기 높이 설정
        adjustTextareaHeight();

        // 메시지 전송 함수 (중복 방지)
        const handleSendMessage = () => {
            const message = messageInput.value.trim();
            if (!message || this.isProcessing) return; // 중복 방지 조건 추가
            
            this.sendMessage(message, messagesContainer);
            messageInput.value = "";
            adjustTextareaHeight(); // 높이 초기화
        };

        // 전송 버튼 클릭 이벤트
        sendButton.addEventListener("click", (e) => {
            e.preventDefault();
            handleSendMessage();
        });

        // Enter 키 이벤트 (Shift+Enter는 줄바꿈, Enter는 전송)
        messageInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                if (e.shiftKey) {
                    // Shift+Enter: 줄바꿈 (기본 동작 허용)
                    return;
                } else {
                    // Enter만: 전송
                    e.preventDefault();
                    handleSendMessage();
                }
            }
        });
    }

    // UI 요소들을 비활성화/활성화하는 메서드
    private setUIEnabled(enabled: boolean) {
        if (this.messageInput) {
            this.messageInput.disabled = !enabled;
        }
        if (this.sendButton) {
            this.sendButton.disabled = !enabled;
        }
    }

    private async sendMessage(message: string, messagesContainer: HTMLElement) {
        if (!message.trim() || this.isProcessing) return;
        
        this.isProcessing = true; // 처리 시작
        this.setUIEnabled(false); // UI 비활성화

        try {
            // 사용자 메시지 추가 (UI)
            this.addMessage("user", message, messagesContainer);
            // 대화 내역에 메시지 추가 (서비스)
            this.openaiService.addMessage("user", message);

            // API 키가 설정되었는지 확인
            if (!this.openaiService.isConfigured()) {
                this.addMessage("assistant", "⚠️ OpenAI API 키가 설정되지 않았습니다. 상단의 키 아이콘을 클릭해서 API 키를 설정해주세요.", messagesContainer);
                return;
            }

            // 로딩 메시지 표시
            const loadingMessage = this.addMessage("assistant", "🤔 생각중...", messagesContainer);

            try {
                // OpenAI API 호출
                const response = await this.openaiService.sendMessage();

                // 로딩 메시지 제거
                loadingMessage.remove();

                // AI 응답 추가 (UI)
                this.addMessage("assistant", response, messagesContainer);
                // 대화 내역에 AI 응답 추가 (서비스)
                this.openaiService.addMessage("assistant", response);
            } catch (error) {
                // 로딩 메시지 제거
                loadingMessage.remove();
                // 에러 메시지 표시
                const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
                this.addMessage("assistant", `❌ 오류: ${errorMessage}`, messagesContainer);
            }
        } finally {
            this.isProcessing = false; // 처리 완료
            this.setUIEnabled(true); // UI 활성화
        }
    }

    private addMessage(sender: "user" | "assistant", message: string, container: HTMLElement): HTMLElement {
        const messageEl = container.createEl("div", {
            cls: `chatbot-message chatbot-message-${sender}`
        });

        const senderEl = messageEl.createEl("div", {
            text: sender === "user" ? "You" : "AI",
            cls: "chatbot-message-sender"
        });

        const contentEl = messageEl.createEl("div", {
            text: message,
            cls: "chatbot-message-content"
        });

        // 스크롤을 맨 아래로
        container.scrollTop = container.scrollHeight;
        
        return messageEl;
    }

    private clearChat(messagesContainer: HTMLElement) {
        messagesContainer.empty();
        this.openaiService.clearHistory(); // 대화 기록도 초기화
    }

    async onClose() {
        // 정리 작업이 필요하면 여기에 추가
    }
}