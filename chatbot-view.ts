import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer } from "obsidian";
import { OpenAIService, ChatMessage } from "./openai-service";
import { GeminiService } from "./gemini-service";

export const VIEW_TYPE_CHATBOT = "chatbot-view";

// 멘션된 아이템 정보 타입 확장
interface MentionedItemInfo {
    name: string;
    path: string;
    type?: 'note' | 'webview' | 'pdf';
    url?: string;
}

export class ChatbotView extends ItemView {
    private openaiService: OpenAIService;
    private geminiService: GeminiService;
    private currentProvider: 'openai' | 'gemini' = 'openai';
    private isProcessing: boolean = false; // 중복 처리 방지 플래그
    private plugin: any; // 플러그인 인스턴스 참조
    private messageInput: HTMLTextAreaElement | null = null; // 입력 필드 참조
    private sendButton: HTMLButtonElement | null = null; // 전송 버튼 참조
    private mentionedNotes: string[] = []; // 언급된 노트들
    private mentionedNotesInfo: MentionedItemInfo[] = []; // 언급된 노트들의 상세 정보 (웹뷰 포함)
    private noteAutocomplete: HTMLElement | null = null; // 노트 자동완성 UI
    private selectedNoteIndex: number = -1; // 선택된 노트 인덱스
    private isShowingNoteAutocomplete: boolean = false; // 자동완성 표시 여부
    private currentMentionStart: number = -1; // '@' 시작 위치
    private updatePlanExecuteButtonState: () => void = () => {}; // Plan & Execute 버튼 상태 업데이트 함수

    constructor(leaf: WorkspaceLeaf, plugin?: any) {
        super(leaf);
        this.openaiService = new OpenAIService();
        this.geminiService = new GeminiService(undefined, this.app); // app 인스턴스 전달
        this.plugin = plugin;
        
        // 플러그인이 있으면 초기 설정
        if (this.plugin && this.plugin.settings) {
            this.currentProvider = this.plugin.settings.aiProvider || 'openai';
            this.openaiService.setApiKey(this.plugin.settings.openaiApiKey);
            this.geminiService.setApiKey(this.plugin.settings.geminiApiKey);
            
            // MCP 서버 설정은 onOpen에서만 수행
        }
    }

    // API 키 업데이트 메서드
    updateApiKey(apiKey: string, provider: 'openai' | 'gemini') {
        if (provider === 'openai') {
            this.openaiService.setApiKey(apiKey);
        } else {
            this.geminiService.setApiKey(apiKey);
        }
        console.log(`${provider} API key updated in ChatbotView:`, apiKey ? 'Key set' : 'Key cleared');
    }

    // AI 제공자 업데이트 메서드
    updateProvider(provider: 'openai' | 'gemini') {
        this.currentProvider = provider;
        console.log('AI provider updated in ChatbotView:', provider);
        
        // 대화 기록을 현재 제공자의 서비스로 동기화
        const currentService = this.getCurrentService();
        const history = this.getCurrentService().getHistory();
        if (history.length > 0) {
            // 이전 제공자의 대화 기록을 새 제공자로 복사
            currentService.clearHistory();
            history.forEach(msg => {
                currentService.addMessage(msg.role, msg.content);
            });
        }
        
        // Gemini로 변경 시 MCP 서버 설정
        if (provider === 'gemini' && this.plugin?.settings?.mcpServers) {
            this.geminiService.updateMCPServers(this.plugin.settings.mcpServers).catch(error => {
                console.error('Error updating MCP servers on provider change:', error);
            });
        }
        
        // Plan & Execute 버튼 상태 업데이트
        this.updatePlanExecuteButtonState();
    }

    // 현재 활성화된 AI 서비스 반환
    private getCurrentService(): OpenAIService | GeminiService {
        return this.currentProvider === 'openai' ? this.openaiService : this.geminiService;
    }

    // 모델 변경 시 호출되는 메서드 (대화 내역 초기화)
    onModelChanged(model: string) {
        console.log('Model changed in ChatbotView:', model);
        
        // 현재 활성화된 서비스의 대화 내역 초기화
        this.getCurrentService().clearHistory();
        
        // UI에서 메시지 컨테이너 찾아서 초기화
        const messagesContainer = this.containerEl.querySelector('.chatbot-messages') as HTMLElement;
        if (messagesContainer) {
            messagesContainer.empty();
        }
        
        // 사용자에게 알림
        if (messagesContainer) {
            const notificationEl = messagesContainer.createEl("div", {
                cls: "chatbot-message chatbot-message-system",
                text: `모델이 ${model}로 변경되었습니다. 대화 내역이 초기화되었습니다.`
            });
            
            // 3초 후 알림 메시지 제거
            setTimeout(() => {
                notificationEl.remove();
            }, 3000);
        }
    }

    // MCP 서버 설정 업데이트 메서드
    async updateMCPServers() {
        console.log('MCP servers updated in ChatbotView');
        
        if (this.currentProvider === 'gemini' && this.plugin?.settings?.mcpServers) {
            try {
                await this.geminiService.updateMCPServers(this.plugin.settings.mcpServers);
                
                // 사용자에게 알림
                const messagesContainer = this.containerEl.querySelector('.chatbot-messages') as HTMLElement;
                if (messagesContainer) {
                    const notificationEl = messagesContainer.createEl("div", {
                        cls: "chatbot-message chatbot-message-system",
                        text: "MCP 서버 설정이 업데이트되었습니다."
                    });
                    
                    // 3초 후 알림 메시지 제거
                    setTimeout(() => {
                        notificationEl.remove();
                    }, 3000);
                }
            } catch (error) {
                console.error('Error updating MCP servers:', error);
                new Notice('MCP 서버 업데이트 중 오류가 발생했습니다.');
            }
        }
    }

    getViewType() {
        return VIEW_TYPE_CHATBOT;
    }

    getDisplayText() {
        return "AI Chatbot";
    }

    async onOpen() {
        // 플러그인 설정에서 제공자와 API 키 재설정 (뷰가 열릴 때마다)
        if (this.plugin && this.plugin.settings) {
            this.currentProvider = this.plugin.settings.aiProvider || 'openai';
            this.openaiService.setApiKey(this.plugin.settings.openaiApiKey);
            this.geminiService.setApiKey(this.plugin.settings.geminiApiKey);
            
            // Gemini 서비스에 MCP 서버 설정
            if (this.currentProvider === 'gemini' && this.plugin.settings.mcpServers) {
                this.geminiService.updateMCPServers(this.plugin.settings.mcpServers).catch(error => {
                    console.error('Error updating MCP servers on open:', error);
                });
            }
        }
        
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
            // 플러그인 설정 탭 열기, 일단 편의를 위해 전체 설정 페이지만 열게함
            (this.app as any).setting.open();
            // TODO: 나중에 플러그인 설정 탭으로 이동하게끔 수정해야함.
            //(this.app as any).setting.openTabById('openai-chatbot');
        });

        // 대화 내역 저장 버튼
        const saveButton = buttonContainer.createEl("button", {
            text: "💾",
            cls: "chatbot-save-button"
        });

        // 저장 버튼 클릭 이벤트
        saveButton.addEventListener("click", async () => {
            await this.saveChatHistory();
        });

        // 대화 내역 초기화 버튼
        const clearButton = buttonContainer.createEl("button", {
            text: "🗑️",
            cls: "chatbot-clear-button"
        });

        // 초기화 버튼 클릭 이벤트
        clearButton.addEventListener("click", () => {
            this.clearChatHistory(messagesContainer);
        });

        // Plan & Execute 모드 토글 버튼 (Gemini 제공자일 때만 표시)
        const planExecuteButton = buttonContainer.createEl("button", {
            text: "🧠",
            cls: "chatbot-plan-execute-button"
        });

        // Plan & Execute 모드 토글 이벤트
        planExecuteButton.addEventListener("click", () => {
            if (this.currentProvider === 'gemini') {
                const currentMode = this.geminiService.isPlanExecuteMode();
                this.geminiService.setPlanExecuteMode(!currentMode);
                
                // 버튼 스타일 업데이트
                if (this.geminiService.isPlanExecuteMode()) {
                    planExecuteButton.addClass("active");
                    planExecuteButton.title = "Plan & Execute 모드 활성화됨 (클릭하여 비활성화)";
                } else {
                    planExecuteButton.removeClass("active");
                    planExecuteButton.title = "Plan & Execute 모드 비활성화됨 (클릭하여 활성화)";
                }
                
                new Notice(`Plan & Execute 모드 ${this.geminiService.isPlanExecuteMode() ? '활성화' : '비활성화'}`);
            } else {
                new Notice("Plan & Execute 모드는 Gemini 제공자에서만 사용할 수 있습니다.");
            }
        });

        // 초기 Plan & Execute 버튼 상태 설정
        const updatePlanExecuteButton = () => {
            if (this.currentProvider === 'gemini') {
                planExecuteButton.style.display = "block";
                if (this.geminiService.isPlanExecuteMode()) {
                    planExecuteButton.addClass("active");
                    planExecuteButton.title = "Plan & Execute 모드 활성화됨 (클릭하여 비활성화)";
                } else {
                    planExecuteButton.removeClass("active");
                    planExecuteButton.title = "Plan & Execute 모드 비활성화됨 (클릭하여 활성화)";
                }
            } else {
                planExecuteButton.style.display = "none";
            }
        };

        // 초기 상태 설정
        updatePlanExecuteButton();

        // 제공자 변경 시 버튼 상태 업데이트를 위한 메서드 추가
        this.updatePlanExecuteButtonState = updatePlanExecuteButton;

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

        // 입력할 때마다 높이 조절 및 멘션 처리
        messageInput.addEventListener("input", (e) => {
            adjustTextareaHeight();
            this.handleMentionInput(e);
        });
        
        // 초기 높이 설정
        adjustTextareaHeight();

        // 메시지 전송 함수 (중복 방지)
        const handleSendMessage = () => {
            const message = messageInput.value.trim();
            if (!message || this.isProcessing) return; // 중복 방지 조건 추가
            
            // 언급된 노트 추출
            this.extractMentionedNotes(message);
            
            this.sendMessage(message, messagesContainer);
            messageInput.value = "";
            adjustTextareaHeight(); // 높이 초기화
            this.hideNoteAutocomplete(); // 자동완성 숨기기
        };

        // 전송 버튼 클릭 이벤트
        sendButton.addEventListener("click", (e) => {
            e.preventDefault();
            handleSendMessage();
        });

        // Enter 키 이벤트 (Shift+Enter는 줄바꿈, Enter는 전송)
        messageInput.addEventListener("keydown", (e) => {
            // 노트 자동완성이 표시된 상태에서의 키보드 네비게이션
            if (this.isShowingNoteAutocomplete) {
                this.handleNoteAutocompleteNavigation(e);
                return;
            }
            
            if (e.key === "Enter") {
                if (e.shiftKey) {
                    // Shift+Enter: 줄바꿈 (기본 동작 허용)
                    return;
                } else {
                    // Enter만: 전송
                    e.preventDefault();
                    handleSendMessage();
                }
            } else if (e.key === "Escape") {
                // ESC 키로 자동완성 숨기기
                this.hideNoteAutocomplete();
            }
        });

        // 입력 필드에서 포커스 잃을 때 자동완성 숨기기
        messageInput.addEventListener("blur", () => {
            // 약간의 지연을 주어 클릭 이벤트가 처리되도록 함
            setTimeout(() => {
                this.hideNoteAutocomplete();
            }, 200);
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
            // 현재 활성화된 AI 서비스 가져오기
            const currentService = this.getCurrentService();
            
            // 사용자 메시지 추가 (UI)
            this.addMessage("user", message, messagesContainer);
            // 대화 내역에 메시지 추가 (서비스)
            currentService.addMessage("user", message);

            // API 키가 설정되었는지 확인
            if (!currentService.isConfigured()) {
                const providerName = this.currentProvider === 'openai' ? 'OpenAI' : 'Gemini';
                this.addMessage("assistant", `⚠️ ${providerName} API 키가 설정되지 않았습니다. 설정에서 API 키를 설정해주세요.`, messagesContainer);
                return;
            }

            // 로딩 메시지 표시
            const loadingMessage = this.addMessage("assistant", "🤔 생각중...", messagesContainer);

            try {
                // 현재 설정된 모델 가져오기
                const model = this.plugin?.settings?.model || 
                    (this.currentProvider === 'openai' ? 'gpt-4.1' : 'gemini-2.5-flash');
                
                // AI API 호출
                let response: string;
                if (this.currentProvider === 'gemini') {
                    response = await this.geminiService.sendMessage(model, this.mentionedNotesInfo);
                } else {
                    response = await currentService.sendMessage(model);
                }

                // 로딩 메시지 제거
                loadingMessage.remove();

                // AI 응답 추가 (UI)
                this.addMessage("assistant", response, messagesContainer);
                // 대화 내역에 AI 응답 추가 (서비스)
                currentService.addMessage("assistant", response);
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

        // 원본 메시지 텍스트를 데이터 속성으로 저장
        messageEl.setAttribute('data-original-message', message);

        const senderEl = messageEl.createEl("div", {
            text: sender === "user" ? "You" : "AI",
            cls: "chatbot-message-sender"
        });

        const contentEl = messageEl.createEl("div", {
            cls: "chatbot-message-content"
        });

        // 마크다운 렌더링 적용
        if (sender === "assistant") {
            // AI 메시지의 경우 마크다운 렌더링 (새로운 API 사용)
            MarkdownRenderer.render(this.app, message, contentEl, '', this);
        } else {
            // 사용자 메시지는 일반 텍스트로 표시
            contentEl.textContent = message;
        }

        // 액션 버튼 컨테이너 추가
        const actionsEl = messageEl.createEl("div", {
            cls: "chatbot-message-actions"
        });

        // 복사 버튼 (모든 메시지에 추가)
        const copyBtn = actionsEl.createEl("button", {
            text: "📋",
            cls: "chatbot-message-action-btn copy-btn"
        });
        
        copyBtn.addEventListener("click", () => {
            // 원본 메시지 텍스트 사용
            const originalMessage = messageEl.getAttribute('data-original-message') || message;
            this.copyMessageToClipboard(originalMessage);
        });

        // 삭제 버튼 (사용자 메시지에만 추가)
        if (sender === "user") {
            const deleteBtn = actionsEl.createEl("button", {
                text: "🗑️",
                cls: "chatbot-message-action-btn delete-btn"
            });
            
            deleteBtn.addEventListener("click", () => {
                this.deleteMessagePair(messageEl, container);
            });
        }

        // 스크롤을 맨 아래로
        container.scrollTop = container.scrollHeight;
        
        return messageEl;
    }

    private clearChat(messagesContainer: HTMLElement) {
        messagesContainer.empty();
        this.getCurrentService().clearHistory(); // 현재 활성화된 서비스의 대화 기록 초기화
    }

    // 대화 내역 저장 메서드
    private async saveChatHistory() {
        const history = this.getCurrentService().getHistory();
        
        if (history.length === 0) {
            new Notice("저장할 대화 내역이 없습니다.");
            return;
        }

        try {
            // 저장할 폴더 경로 가져오기
            const folderPath = this.plugin?.settings?.chatHistoryFolder || "ChatHistory";
            
            // 폴더가 존재하지 않으면 생성
            const folder = this.app.vault.getAbstractFileByPath(folderPath);
            if (!folder) {
                await this.app.vault.createFolder(folderPath);
            }

            // 파일명 생성 (YYYY_MM_DD_HH_MM 형식)
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hour = String(now.getHours()).padStart(2, '0');
            const minute = String(now.getMinutes()).padStart(2, '0');
            
            let baseFileName = `${year}_${month}_${day}_${hour}_${minute}`;
            let fileName = `${baseFileName}.md`;
            let filePath = `${folderPath}/${fileName}`;
            
            // 파일명 중복 체크 및 처리
            let counter = 0;
            while (this.app.vault.getAbstractFileByPath(filePath)) {
                counter++;
                fileName = `${baseFileName}_${counter}.md`;
                filePath = `${folderPath}/${fileName}`;
            }

            // 대화 내역을 마크다운 형식으로 변환
            const content = this.formatChatHistory(history);
            
            // 파일 생성
            await this.app.vault.create(filePath, content);
            
            new Notice(`대화 내역이 ${fileName}로 저장되었습니다.`);
            
        } catch (error) {
            console.error('대화 내역 저장 중 오류 발생:', error);
            new Notice("대화 내역 저장 중 오류가 발생했습니다.");
        }
    }

    // 대화 내역을 마크다운 형식으로 변환
    private formatChatHistory(history: ChatMessage[]): string {
        const formattedMessages = history.map(msg => {
            const roleLabel = msg.role === 'user' ? 'User' : 
                             msg.role === 'assistant' ? 'AI' : 
                             'System';
            return `**${roleLabel}**:\n${msg.content}\n`;
        });
        
        const now = new Date();
        const dateStr = now.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        return `# 대화 내역\n\n저장 시간: ${dateStr}\n\n---\n\n${formattedMessages.join('\n')}`;
    }

    async onClose() {
        // MCP 서버 연결 정리
        if (this.geminiService) {
            await this.geminiService.cleanup();
        }
    }

    // 대화 내역 초기화 메서드 (사용자 확인 포함)
    private clearChatHistory(messagesContainer: HTMLElement) {
        const history = this.getCurrentService().getHistory();
        
        if (history.length === 0) {
            new Notice("초기화할 대화 내역이 없습니다.");
            return;
        }

        // 사용자 확인 창 표시
        const confirmModal = document.createElement('div');
        confirmModal.className = 'chatbot-modal-container';
        confirmModal.innerHTML = `
            <div class="chatbot-modal">
                <div class="chatbot-modal-bg"></div>
                <div class="chatbot-modal-content">
                    <div class="chatbot-modal-header">
                        <h2>대화 내역 초기화</h2>
                    </div>
                    <div class="chatbot-modal-body">
                        <p>현재 대화 내역을 모두 삭제하시겠습니까?</p>
                        <p style="color: var(--text-muted); font-size: 12px;">이 작업은 되돌릴 수 없습니다.</p>
                    </div>
                    <div class="chatbot-modal-footer">
                        <button class="mod-cta" id="confirm-clear">삭제</button>
                        <button id="cancel-clear">취소</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(confirmModal);

        // 확인 버튼 클릭 이벤트
        const confirmBtn = confirmModal.querySelector('#confirm-clear');
        const cancelBtn = confirmModal.querySelector('#cancel-clear');

        confirmBtn?.addEventListener('click', () => {
            this.clearChat(messagesContainer);
            new Notice("대화 내역이 초기화되었습니다.");
            document.body.removeChild(confirmModal);
        });

        // 취소 버튼 클릭 이벤트
        cancelBtn?.addEventListener('click', () => {
            document.body.removeChild(confirmModal);
        });

        // 배경 클릭 시 모달 닫기
        const modalBg = confirmModal.querySelector('.chatbot-modal-bg');
        modalBg?.addEventListener('click', () => {
            document.body.removeChild(confirmModal);
        });
    }

    // 메시지를 클립보드에 복사하는 메서드
    private async copyMessageToClipboard(message: string) {
        try {
            await navigator.clipboard.writeText(message);
            new Notice("메시지가 클립보드에 복사되었습니다.");
        } catch (error) {
            console.error('클립보드 복사 실패:', error);
            new Notice("클립보드 복사에 실패했습니다.");
        }
    }

    // 대화쌍을 삭제하는 메서드
    private deleteMessagePair(userMessageEl: HTMLElement, container: HTMLElement) {
        // 사용자 메시지의 원본 내용 가져오기
        const userContent = userMessageEl.getAttribute('data-original-message');
        if (!userContent) return;

        // 현재 메시지 이후의 다음 메시지(AI 응답) 찾기
        const nextMessageEl = userMessageEl.nextElementSibling as HTMLElement;
        const isNextMessageAssistant = nextMessageEl?.classList.contains('chatbot-message-assistant');
        
        // AI 응답의 원본 내용 가져오기
        const assistantContent = isNextMessageAssistant ? nextMessageEl.getAttribute('data-original-message') : null;

        // 확인 모달 표시
        const confirmModal = document.createElement('div');
        confirmModal.className = 'chatbot-modal-container';
        confirmModal.innerHTML = `
            <div class="chatbot-modal">
                <div class="chatbot-modal-bg"></div>
                <div class="chatbot-modal-content">
                    <div class="chatbot-modal-header">
                        <h2>대화쌍 삭제</h2>
                    </div>
                    <div class="chatbot-modal-body">
                        <p>이 대화쌍을 삭제하시겠습니까?</p>
                        <div style="background: var(--background-modifier-border); padding: 8px; border-radius: 4px; margin: 8px 0; font-size: 12px; max-height: 100px; overflow-y: auto;">
                            <strong>사용자:</strong> ${userContent}
                            ${assistantContent ? `<br><br><strong>AI:</strong> ${assistantContent.substring(0, 100)}${assistantContent.length > 100 ? '...' : ''}` : ''}
                        </div>
                        <p style="color: var(--text-muted); font-size: 12px;">이 작업은 되돌릴 수 없습니다.</p>
                    </div>
                    <div class="chatbot-modal-footer">
                        <button class="mod-cta" id="confirm-delete-pair">삭제</button>
                        <button id="cancel-delete-pair">취소</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(confirmModal);

        // 확인 버튼 클릭 이벤트
        const confirmBtn = confirmModal.querySelector('#confirm-delete-pair');
        const cancelBtn = confirmModal.querySelector('#cancel-delete-pair');

        confirmBtn?.addEventListener('click', () => {
            // 대화 기록에서 해당 메시지들 제거
            this.removeMessagePairFromHistory(userContent, assistantContent);
            
            // UI에서 메시지 제거
            userMessageEl.remove();
            if (isNextMessageAssistant && nextMessageEl) {
                nextMessageEl.remove();
            }
            
            new Notice("대화쌍이 삭제되었습니다.");
            document.body.removeChild(confirmModal);
        });

        // 취소 버튼 클릭 이벤트
        cancelBtn?.addEventListener('click', () => {
            document.body.removeChild(confirmModal);
        });

        // 배경 클릭 시 모달 닫기
        const modalBg = confirmModal.querySelector('.chatbot-modal-bg');
        modalBg?.addEventListener('click', () => {
            document.body.removeChild(confirmModal);
        });
    }

    // 대화 기록에서 특정 메시지 쌍 제거
    private removeMessagePairFromHistory(userMessage: string, assistantMessage: string | null) {
        const currentService = this.getCurrentService();
        const history = currentService.getHistory();
        const newHistory: ChatMessage[] = [];
        
        for (let i = 0; i < history.length; i++) {
            const current = history[i];
            const next = history[i + 1];
            
            // 사용자 메시지와 다음 AI 메시지가 삭제 대상인지 확인
            if (current.role === 'user' && current.content === userMessage) {
                if (assistantMessage && next && next.role === 'assistant' && next.content === assistantMessage) {
                    // 두 메시지 모두 건너뛰기
                    i++; // 다음 메시지(AI 응답)도 건너뛰기
                } else if (!assistantMessage) {
                    // 사용자 메시지만 건너뛰기
                }
                // 현재 메시지 건너뛰기
                continue;
            }
            
            newHistory.push(current);
        }
        
        // 새로운 히스토리로 교체
        currentService.clearHistory();
        newHistory.forEach(msg => {
            currentService.addMessage(msg.role, msg.content);
        });
    }

    // 현재 열린 탭들 가져오기 (노트 + 웹뷰)
    private getOpenTabs(limit: number = 10): Array<{name: string, path: string, type: 'note' | 'webview' | 'pdf', url?: string}> {
        const openTabs: Array<{name: string, path: string, type: 'note' | 'webview' | 'pdf', url?: string}> = [];
        
        console.log('=== Starting webview detection ==='); // 디버깅용
        
        // 모든 워크스페이스 리프 확인
        this.app.workspace.iterateAllLeaves((leaf) => {
            const viewType = leaf.view.getViewType();
            const view = leaf.view as any;
            
            console.log(`Analyzing leaf:`, {
                viewType: viewType,
                viewConstructorName: view.constructor.name,
                hasUrl: !!view.url,
                hasIframe: !!view.iframe,
                hasWebviewElement: !!view.webviewEl,
                hasContainer: !!view.containerEl,
                keys: Object.keys(view).filter(k => k.includes('url') || k.includes('web') || k.includes('src'))
            }); // Enhanced debugging
            
            if (viewType === 'markdown') {
                // 마크다운 노트
                const file = (view as any).file;
                if (file) {
                    openTabs.push({
                        name: file.basename,
                        path: file.path,
                        type: 'note'
                    });
                }
            } else if (viewType === 'pdf') {
                // PDF 뷰
                const file = (view as any).file;
                if (file) {
                    console.log(`Found PDF file: ${file.basename}`);
                    openTabs.push({
                        name: file.basename,
                        path: file.path,
                        type: 'pdf'
                    });
                }
            } else {
                // 웹뷰나 기타 뷰 타입은 별도 메서드에서 처리
                // (이 섹션은 detectKnownWebviewTypes에서 처리됨)
            }
        });
        
        // 별도의 웹뷰 감지 로직 실행
        const detectedWebviews = this.detectKnownWebviewTypes();
        openTabs.push(...detectedWebviews);
        
        console.log('All found tabs:', openTabs); // 디버깅용
        
        // 웹뷰 감지 완료
        const webviewCount = openTabs.filter(tab => tab.type === 'webview').length;
        console.log(`Found ${webviewCount} webview tabs`); // 디버깅용
        
        // 중복 제거 및 제한
        const uniqueTabs = openTabs.filter((tab, index, self) => 
            index === self.findIndex(t => t.path === tab.path)
        );
        
        console.log('Final unique tabs:', uniqueTabs); // 디버깅용
        console.log('=== Webview detection complete ==='); // 디버깅용
        
        return uniqueTabs.slice(0, limit);
    }

    // 최근 노트 가져오기 (폴백용)
    private getRecentNotes(limit: number = 10): Array<{name: string, path: string}> {
        const files = this.app.vault.getMarkdownFiles();
        
        // 최근 수정된 순서대로 정렬
        const sortedFiles = files.sort((a, b) => b.stat.mtime - a.stat.mtime);
        
        return sortedFiles.slice(0, limit).map(file => ({
            name: file.basename,
            path: file.path
        }));
    }

    // 노트 및 열린 탭 검색
    private searchNotesAndTabs(query: string): Array<{name: string, path: string, type?: 'note' | 'webview' | 'pdf', url?: string}> {
        console.log('searchNotesAndTabs called with query:', query); // 디버깅용
        
        const lowerQuery = query.toLowerCase();
        const results: Array<{name: string, path: string, type?: 'note' | 'webview' | 'pdf', url?: string}> = [];
        
        // 1. 먼저 열린 탭들에서 검색
        const openTabs = this.getOpenTabs();
        console.log('searchNotesAndTabs - openTabs:', openTabs); // 디버깅용
        
        const matchingTabs = openTabs.filter(tab => 
            tab.name.toLowerCase().includes(lowerQuery)
        );
        console.log('searchNotesAndTabs - matchingTabs:', matchingTabs); // 디버깅용
        results.push(...matchingTabs);
        
        // 2. 전체 노트에서 검색 (열린 탭에 없는 것들만)
        const files = this.app.vault.getMarkdownFiles();
        const openNotePaths = openTabs.filter(tab => tab.type === 'note').map(tab => tab.path);
        
        const matchingFiles = files
            .filter(file => 
                file.basename.toLowerCase().includes(lowerQuery) &&
                !openNotePaths.includes(file.path)
            )
            .slice(0, 5) // 열린 탭이 아닌 노트는 최대 5개까지만
            .map(file => ({
                name: file.basename,
                path: file.path,
                type: 'note' as const
            }));
        
        results.push(...matchingFiles);
        
        console.log('searchNotesAndTabs - final results:', results); // 디버깅용
        return results.slice(0, 10); // 전체 최대 10개
    }

    // 노트 자동완성 표시 (열린 탭 우선)
    private showNoteAutocomplete(query: string = '') {
        console.log('showNoteAutocomplete called with query:', query); // 디버깅용
        
        if (!this.messageInput) return;
        
        // 기존 자동완성 제거
        this.hideNoteAutocomplete();
        
        // 노트와 탭 가져오기
        const items = query ? this.searchNotesAndTabs(query) : this.getOpenTabs();
        console.log('showNoteAutocomplete - items:', items); // 디버깅용
        
        if (items.length === 0) {
            // 폴백: 최근 노트 표시
            const recentNotes = this.getRecentNotes();
            console.log('showNoteAutocomplete - fallback recentNotes:', recentNotes); // 디버깅용
            if (recentNotes.length === 0) {
                this.hideNoteAutocomplete();
                return;
            }
            this.showAutocompleteItems(recentNotes.map(note => ({...note, type: 'note' as const})), query);
            return;
        }
        
        this.showAutocompleteItems(items, query);
    }

    // 자동완성 아이템들을 실제로 표시하는 헬퍼 메서드
    private showAutocompleteItems(items: Array<{name: string, path: string, type?: 'note' | 'webview' | 'pdf', url?: string}>, query: string) {
        if (!this.messageInput) return;
        
        // 자동완성 컨테이너 생성
        const inputContainer = this.messageInput.parentElement;
        if (!inputContainer) return;
        
        this.noteAutocomplete = inputContainer.createEl('div', {
            cls: 'chatbot-note-autocomplete'
        });
        
        if (items.length === 0) {
            this.noteAutocomplete.createEl('div', {
                cls: 'chatbot-note-autocomplete-empty',
                text: query ? '검색 결과가 없습니다.' : '열린 탭이 없습니다.'
            });
        } else {
            items.forEach((item, index) => {
                const itemEl = this.noteAutocomplete!.createEl('div', {
                    cls: 'chatbot-note-autocomplete-item'
                });
                
                // 웹뷰 타입 표시를 위한 data 속성 추가
                if (item.type === 'webview') {
                    itemEl.setAttribute('data-type', 'webview');
                } else if (item.type === 'pdf') {
                    itemEl.setAttribute('data-type', 'pdf');
                }
                
                if (index === this.selectedNoteIndex) {
                    itemEl.addClass('selected');
                }
                
                // 아이콘 설정 (노트/웹뷰/PDF)
                let icon = '📝'; // 기본값: 노트
                if (item.type === 'webview') {
                    icon = '🌐';
                } else if (item.type === 'pdf') {
                    icon = '📄';
                }
                
                itemEl.createEl('span', {
                    cls: 'chatbot-note-autocomplete-item-icon',
                    text: icon
                });
                
                itemEl.createEl('span', {
                    cls: 'chatbot-note-autocomplete-item-title',
                    text: item.name
                });
                
                // 경로/URL 표시
                if (item.type === 'webview' && item.url) {
                    // 웹뷰의 경우 URL 표시
                    itemEl.createEl('span', {
                        cls: 'chatbot-note-autocomplete-item-path',
                        text: item.url
                    });
                } else if (item.type === 'pdf') {
                    // PDF의 경우 파일 경로 표시
                    itemEl.createEl('span', {
                        cls: 'chatbot-note-autocomplete-item-path',
                        text: item.path
                    });
                } else if (item.type === 'note' && item.path !== item.name + '.md') {
                    // 노트의 경우 파일 경로 표시 (기본 경로가 아닌 경우에만)
                    itemEl.createEl('span', {
                        cls: 'chatbot-note-autocomplete-item-path',
                        text: item.path
                    });
                }
                
                // 클릭 이벤트
                itemEl.addEventListener('click', () => {
                    this.selectNote(item.name, item);
                });
            });
        }
        
        this.isShowingNoteAutocomplete = true;
    }

    // 노트 자동완성 숨기기
    private hideNoteAutocomplete() {
        if (this.noteAutocomplete) {
            this.noteAutocomplete.remove();
            this.noteAutocomplete = null;
        }
        this.isShowingNoteAutocomplete = false;
        this.selectedNoteIndex = -1;
    }

    // 노트 선택 (웹뷰 지원)
    private selectNote(noteName: string, itemInfo?: {name: string, path: string, type?: 'note' | 'webview' | 'pdf', url?: string}) {
        if (!this.messageInput) return;
        
        const currentValue = this.messageInput.value;
        const cursorPos = this.messageInput.selectionStart || 0;
        
        // '@' 시작 위치부터 현재 커서 위치까지 교체
        const beforeMention = currentValue.substring(0, this.currentMentionStart);
        const afterMention = currentValue.substring(cursorPos);
        
        const newValue = beforeMention + `@${noteName} ` + afterMention;
        this.messageInput.value = newValue;
        
        // 커서 위치 조정
        const newCursorPos = beforeMention.length + noteName.length + 2; // @ + noteName + space
        this.messageInput.setSelectionRange(newCursorPos, newCursorPos);
        
        // 언급된 노트/웹뷰 추가
        if (!this.mentionedNotes.includes(noteName)) {
            this.mentionedNotes.push(noteName);
        }
        
        // 상세 정보 업데이트
        if (itemInfo) {
            const existingIndex = this.mentionedNotesInfo.findIndex(info => info.name === noteName);
            if (existingIndex === -1) {
                this.mentionedNotesInfo.push({
                    name: noteName,
                    path: itemInfo.path,
                    type: itemInfo.type,
                    url: itemInfo.url
                });
            }
        }
        
        this.hideNoteAutocomplete();
        this.messageInput.focus();
    }

    // 키보드 네비게이션
    private handleNoteAutocompleteNavigation(event: KeyboardEvent) {
        if (!this.isShowingNoteAutocomplete || !this.noteAutocomplete) return;
        
        const items = this.noteAutocomplete.querySelectorAll('.chatbot-note-autocomplete-item');
        if (items.length === 0) return;
        
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.selectedNoteIndex = Math.min(this.selectedNoteIndex + 1, items.length - 1);
                this.updateSelectedNote();
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.selectedNoteIndex = Math.max(this.selectedNoteIndex - 1, 0);
                this.updateSelectedNote();
                break;
            case 'Enter':
                event.preventDefault();
                if (this.selectedNoteIndex >= 0) {
                    const selectedItem = items[this.selectedNoteIndex];
                    const noteName = selectedItem.querySelector('.chatbot-note-autocomplete-item-title')?.textContent;
                    if (noteName) {
                        // 아이템 정보를 다시 구성해야 함 (DOM에서 정보 추출)
                        const isWebView = selectedItem.querySelector('.chatbot-note-autocomplete-item-icon')?.textContent === '🌐';
                        this.selectNote(noteName);
                    }
                }
                break;
            case 'Escape':
                event.preventDefault();
                this.hideNoteAutocomplete();
                break;
        }
    }

    // 선택된 노트 업데이트
    private updateSelectedNote() {
        if (!this.noteAutocomplete) return;
        
        const items = this.noteAutocomplete.querySelectorAll('.chatbot-note-autocomplete-item');
        items.forEach((item, index) => {
            if (index === this.selectedNoteIndex) {
                item.addClass('selected');
            } else {
                item.removeClass('selected');
            }
        });
    }

    // 입력 텍스트에서 '@' 언급 처리
    private handleMentionInput(event: Event) {
        if (!this.messageInput) return;
        
        const input = event.target as HTMLTextAreaElement;
        const cursorPos = input.selectionStart || 0;
        const text = input.value;
        
        // '@' 뒤의 텍스트 찾기
        let mentionStart = -1;
        for (let i = cursorPos - 1; i >= 0; i--) {
            if (text[i] === '@') {
                mentionStart = i;
                break;
            }
            if (text[i] === ' ' || text[i] === '\n') {
                break;
            }
        }
        
        if (mentionStart !== -1) {
            // '@' 뒤의 쿼리 추출
            const query = text.substring(mentionStart + 1, cursorPos);
            this.currentMentionStart = mentionStart;
            this.selectedNoteIndex = 0; // 첫 번째 항목 선택
            this.showNoteAutocomplete(query);
        } else {
            this.hideNoteAutocomplete();
        }
    }

    // 메시지에서 언급된 노트/웹뷰 추출
    private extractMentionedNotes(message: string) {
        const mentions = message.match(/@([^\s]+)/g);
        if (mentions) {
            const noteNames = mentions.map(mention => mention.substring(1)); // '@' 제거
            
            // 각 노트 이름에 해당하는 파일/웹뷰 찾기
            const mentionedItemInfo: MentionedItemInfo[] = [];
            
            noteNames.forEach(noteName => {
                // 1. 먼저 현재 열린 탭에서 찾기
                const openTabs = this.getOpenTabs();
                const openTab = openTabs.find(tab => tab.name === noteName);
                
                if (openTab) {
                    mentionedItemInfo.push({
                        name: noteName,
                        path: openTab.path,
                        type: openTab.type,
                        url: openTab.url
                    });
                } else {
                    // 2. 전체 vault에서 파일 찾기
                    const files = this.app.vault.getMarkdownFiles();
                    const matchingFile = files.find(file => file.basename === noteName);
                    
                    if (matchingFile) {
                        mentionedItemInfo.push({
                            name: noteName,
                            path: matchingFile.path,
                            type: 'note'
                        });
                    } else {
                        // 3. 파일을 찾을 수 없는 경우
                        mentionedItemInfo.push({
                            name: noteName,
                            path: `${noteName}.md (파일을 찾을 수 없음)`,
                            type: 'note'
                        });
                    }
                }
            });
            
            this.mentionedNotes = noteNames; // 기존 방식 유지 (호환성)
            this.mentionedNotesInfo = mentionedItemInfo; // 새로운 상세 정보 (웹뷰 포함)
        } else {
            this.mentionedNotes = [];
            this.mentionedNotesInfo = [];
        }
    }

    // 워크스페이스 상태 진단 메서드 (디버깅용)
    public diagnoseWebviews(): void {
        console.log('=== Workspace Diagnosis ===');
        
        const allLeaves: any[] = [];
        this.app.workspace.iterateAllLeaves((leaf) => {
            allLeaves.push({
                viewType: leaf.view.getViewType(),
                constructorName: leaf.view.constructor.name,
                view: leaf.view
            });
        });
        
        console.log('All workspace leaves:', allLeaves);
        
        // 열린 탭 진단
        const openTabs = this.getOpenTabs(20);
        console.log('Detected open tabs:', openTabs);
        
        // 워크스페이스 상태 정보
        console.log('Workspace info:', {
            activeLeaf: this.app.workspace.activeLeaf,
            leftSplit: this.app.workspace.leftSplit,
            rightSplit: this.app.workspace.rightSplit,
            rootSplit: this.app.workspace.rootSplit
        });
        
        // 플러그인 정보
        const plugins = (this.app as any).plugins;
        console.log('Installed plugins:', Object.keys(plugins.plugins || {}));
        
        console.log('=== Diagnosis Complete ===');
    }

    // 일반적인 웹뷰 플러그인들과 뷰 타입들을 확인하는 메서드
    private detectKnownWebviewTypes(): Array<{name: string, path: string, type: 'note' | 'webview' | 'pdf', url?: string}> {
        const webviews: Array<{name: string, path: string, type: 'note' | 'webview' | 'pdf', url?: string}> = [];
        
        // 알려진 웹뷰 타입들
        const knownWebviewTypes = [
            'web-view',
            'webview', 
            'browser',
            'iframe',
            'surfing-view', // Surfing plugin
            'webpage-html-view', // Webpage HTML Export plugin
            'obsidian-web-browser', // Web Browser plugin
            'obsidian-browser', // Browser plugin variations
            'external-link',
            'pdf',
            'image',
            'video'
        ];
        
        console.log('Searching for known webview types:', knownWebviewTypes);
        
        this.app.workspace.iterateAllLeaves((leaf) => {
            const viewType = leaf.view.getViewType();
            const view = leaf.view as any;
            
            // PDF 파일 처리
            if (viewType === 'pdf') {
                console.log(`Found PDF view: ${viewType}`);
                
                const file = view.file;
                if (file) {
                    webviews.push({
                        name: file.basename,
                        path: file.path,
                        type: 'pdf'
                    });
                }
            }
            // 정확한 타입 매칭
            else if (knownWebviewTypes.includes(viewType)) {
                console.log(`Found known webview type: ${viewType}`);
                
                let url = this.extractUrlFromView(view);
                let name = viewType; // 지구본 이모지 제거
                
                if (url) {
                    try {
                        const urlObj = new URL(url);
                        name = urlObj.hostname; // 호스트명만 표시
                    } catch (e) {
                        name = viewType;
                    }
                }
                
                webviews.push({
                    name: name,
                    path: url || `${viewType}-view`,
                    type: 'webview',
                    url: url
                });
            }
            
            // 부분 매칭 (더 유연한 검사)
            else if (viewType.includes('web') || 
                     viewType.includes('browser') || 
                     viewType.includes('iframe') ||
                     viewType.includes('http')) {
                console.log(`Found potential webview type: ${viewType}`);
                
                let url = this.extractUrlFromView(view);
                let name = viewType; // 지구본 이모지 제거
                
                if (url) {
                    try {
                        const urlObj = new URL(url);
                        name = urlObj.hostname; // 호스트명만 표시
                    } catch (e) {
                        name = viewType;
                    }
                }
                
                webviews.push({
                    name: name,
                    path: url || `${viewType}-view`,
                    type: 'webview',
                    url: url
                });
            }
        });
        
        return webviews;
    }
    
    // 뷰에서 URL을 추출하는 헬퍼 메서드
    private extractUrlFromView(view: any): string | undefined {
        // 다양한 방법으로 URL 추출 시도
        const possibleUrls = [
            view.url,
            view.getState?.()?.url,
            view.currentUrl,
            view.src,
            view.webviewEl?.src,
            view.iframe?.src,
            view.webview?.src,
            view.frame?.src,
            view.data?.url,
            view.file?.path,
        ];
        
        // DOM에서 URL 추출
        if (view.containerEl) {
            const iframe = view.containerEl.querySelector('iframe');
            const webviewEl = view.containerEl.querySelector('webview');
            const linkEl = view.containerEl.querySelector('a');
            
            if (iframe?.src) possibleUrls.push(iframe.src);
            if (webviewEl?.src) possibleUrls.push(webviewEl.src);
            if (linkEl?.href) possibleUrls.push(linkEl.href);
        }
        
        // 첫 번째로 유효한 URL 반환
        for (const url of possibleUrls) {
            if (url && typeof url === 'string' && url !== 'about:blank' && 
                (url.startsWith('http') || url.startsWith('file://'))) {
                return url;
            }
        }
        
        return undefined;
    }
}