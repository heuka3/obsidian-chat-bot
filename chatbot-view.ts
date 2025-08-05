import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer, Menu } from "obsidian";
import { GeminiService } from "./src/gemini-service";
import { PlanProgressData, ChatMessage } from "./src/types";

export const VIEW_TYPE_CHATBOT = "chatbot-view";

type ExecutionMode = 'plan-execute' | 'single-tool' | 'no-tools';

// 멘션된 아이템 정보 타입 확장
interface MentionedItemInfo {
    name: string;
    path: string;
    type?: 'note' | 'webview' | 'pdf';
    url?: string;
}

export class ChatbotView extends ItemView {
    private geminiService: GeminiService;
    private currentProvider: 'gemini' = 'gemini';
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
    private executionMode: ExecutionMode = 'plan-execute'; // Default mode
    private updateExecutionModeButtonState: () => void = () => {}; // Plan & Execute 버튼 상태 업데이트 함수
    private mentionedFilesContainer: HTMLElement | null = null; // 멘션된 파일들 표시 컨테이너
    private planProgressContainer: HTMLElement | null = null; // Plan & Execute 진행 상황 컨테이너

    constructor(leaf: WorkspaceLeaf, plugin?: any) {
        super(leaf);
        this.geminiService = new GeminiService(undefined, this.app); // app 인스턴스 전달
        this.plugin = plugin;
        
        // 플러그인이 있으면 초기 설정
        if (this.plugin && this.plugin.settings) {
            this.currentProvider = 'gemini';
            this.geminiService.setApiKey(this.plugin.settings.geminiApiKey);
            
            // MCP 서버 설정은 onOpen에서만 수행
        }
    }

    // API 키 업데이트 메서드
    updateApiKey(apiKey: string, provider: 'gemini') {
        this.geminiService.setApiKey(apiKey);
        console.log(`${provider} API key updated in ChatbotView:`, apiKey ? 'Key set' : 'Key cleared');
    }

    // AI 제공자 업데이트 메서드 (Gemini만 지원)
    updateProvider(provider: 'gemini') {
        // provider는 항상 'gemini'이므로 별도 처리 불필요
        console.log('AI provider updated in ChatbotView:', provider);
        
        // 대화 기록은 이미 Gemini 서비스에 있으므로 별도 처리 불필요
        
        // MCP 서버 설정
        if (this.plugin?.settings?.mcpServers) {
            this.geminiService.updateMCPServers(this.plugin.settings.mcpServers).catch(error => {
                console.error('Error updating MCP servers on provider change:', error);
            });
        }
        
        // Plan & Execute 버튼 상태 업데이트
        this.updateExecutionModeButtonState();
    }

    // 현재 활성화된 AI 서비스 반환 (Gemini만 지원)
    private getCurrentService(): GeminiService {
        return this.geminiService;
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
            this.currentProvider = 'gemini';
            this.geminiService.setApiKey(this.plugin.settings.geminiApiKey);
            
            // Gemini 서비스에 MCP 서버 설정
            if (this.plugin.settings.mcpServers) {
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

        // 멘션된 파일들 표시 영역 추가
        const mentionedFilesContainer = inputContainer.createEl("div", {
            cls: "chatbot-mentioned-files-container",
            attr: { style: "display: none;" } // 기본적으로 숨김
        });
        
        // 클래스 멤버로 참조 저장
        this.mentionedFilesContainer = mentionedFilesContainer;

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

        // google-search 활성화 버튼
        const googleSearchButton = buttonContainer.createEl("button", {
            text: "🌐",
            cls: "chatbot-search-google-button"
        });

        // google-search 활성화 버튼 클릭 이벤트
        googleSearchButton.addEventListener("click", () => {
            if (this.geminiService.isGoogleSearchEnabled()) {
                this.geminiService.disableSearchTool('google-search');
                googleSearchButton.removeClass("active");
                googleSearchButton.title = "Google Search가 비활성화되었습니다.";
            } else {
                this.geminiService.enableSearchTool('google-search');
                googleSearchButton.addClass("active");
                googleSearchButton.title = "Google Search가 활성화되었습니다.";
            }
            new Notice(`Google Search가 ${this.geminiService.isGoogleSearchEnabled() ? '활성화' : '비활성화'}되었습니다.`);
        });

        // perplexity-search 활성화 버튼
        const perplexitySearchButton = buttonContainer.createEl("button", {
            text: "📚",
            cls: "chatbot-search-perplexity-button"
        });

        // perplexity-search 활성화 버튼 클릭 이벤트
        perplexitySearchButton.addEventListener("click", () => {
            if (this.geminiService.isPerplexitySearchEnabled()) {
                this.geminiService.disableSearchTool('perplexity-search');
                perplexitySearchButton.removeClass("active");
                perplexitySearchButton.title = "Perplexity Search가 비활성화되었습니다.";
            } else {
                this.geminiService.enableSearchTool('perplexity-search');
                perplexitySearchButton.addClass("active");
                perplexitySearchButton.title = "Perplexity Search가 활성화되었습니다.";
            }
            new Notice(`Perplexity Search가 ${this.geminiService.isPerplexitySearchEnabled() ? '활성화' : '비활성화'}되었습니다.`);
        });

        // Execution Mode Selection Button (Gemini only)
        const executionModeButton = buttonContainer.createEl("button", {
            text: "🧠", // Initial icon
            cls: "chatbot-execution-mode-button"
        });

        executionModeButton.addEventListener("click", (event: MouseEvent) => {
            const menu = new Menu();

            menu.addItem((item) =>
                item
                    .setTitle("Plan & Execute")
                    .setIcon("brain")
                    .onClick(() => {
                        this.executionMode = 'plan-execute';
                        this.updateExecutionModeButtonState();
                        new Notice("Execution mode set to: Plan & Execute");
                    }));

            menu.addItem((item) =>
                item
                    .setTitle("Single Tool")
                    .setIcon("wrench")
                    .onClick(() => {
                        this.executionMode = 'single-tool';
                        this.updateExecutionModeButtonState();
                        new Notice("Execution mode set to: Single Tool");
                    }));

            menu.addItem((item) =>
                item
                    .setTitle("No Tools")
                    .setIcon("pencil")
                    .onClick(() => {
                        this.executionMode = 'no-tools';
                        this.updateExecutionModeButtonState();
                        new Notice("Execution mode set to: No Tools");
                    }));

            menu.showAtMouseEvent(event);
        });

        const updateExecutionModeButton = () => {
            // Gemini는 항상 지원하므로 항상 표시
            executionModeButton.style.display = "block";
            let icon = "🧠";
            let title = "";
            switch (this.executionMode) {
                case 'plan-execute':
                    icon = "🧠";
                    title = "Plan & Execute Mode";
                    break;
                case 'single-tool':
                    icon = "🔧";
                    title = "Single Tool Mode";
                    break;
                case 'no-tools':
                    icon = "✍️";
                    title = "No Tools Mode";
                    break;
            }
            executionModeButton.setText(icon);
            executionModeButton.setAttribute("title", title);
        };

        updateExecutionModeButton();

        this.updateExecutionModeButtonState = updateExecutionModeButton;

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

        // 메시지 전송 함수 (중복 방지) - 개선된 멘션 처리
        const handleSendMessage = () => {
            let message = messageInput.value.trim();
            if (!message || this.isProcessing) return; // 중복 방지 조건 추가
            
            console.log('🔍 전송 전 상태:');
            console.log('  - 메시지:', message);
            console.log('  - 기존 mentionedNotesInfo:', this.mentionedNotesInfo);
            
            // 메시지에서 남은 @ 멘션 추출 (자동완성으로 선택하지 않은 것들)
            this.extractMentionedNotes(message);
            
            console.log('🔍 extractMentionedNotes 후 상태:');
            console.log('  - mentionedNotesInfo:', this.mentionedNotesInfo);
            
            // 메시지에서 @ 멘션 제거 (environment context로만 전달)
            message = this.removeMentionsFromMessage(message);
            
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
        
        // 초기 멘션된 파일 표시 업데이트
        this.updateMentionedFilesDisplay();
    }

    
    // Plan & Execute 진행 상황을 표시하는 메서드들
    private createPlanProgressMessage(messagesContainer: HTMLElement): HTMLElement {
        const progressEl = messagesContainer.createEl("div");
        
        // 중요한 인라인 스타일로 가시성 보장
        progressEl.style.cssText = `
            background: #fff !important;
            border: 2px solid #3498db !important;
            margin: 15px 0 !important;
            padding: 20px !important;
            border-radius: 8px !important;
            min-height: 100px !important;
            z-index: 99999 !important;
            position: relative !important;
            display: block !important;
            width: 100% !important;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
            overflow: visible !important;
            color: #2c3e50 !important;
            font-size: 14px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            line-height: 1.4 !important;
        `;

        progressEl.addClass("chatbot-message");
        progressEl.addClass("chatbot-message-assistant");
        progressEl.addClass("plan-progress-message");

        // 초기 상태 표시
        progressEl.innerHTML = `
            <div style="color: #2c3e50 !important; font-size: 16px !important; font-weight: bold !important; margin-bottom: 15px !important; display: flex !important; align-items: center !important;">
                🧠 Plan & Execute 모드
            </div>
            <div style="color: #e67e22 !important; font-size: 14px !important; font-weight: 600 !important;">
                🤔 계획 수립 중...
            </div>
        `;

        // 스크롤을 맨 아래로
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        return progressEl;
    }

    private updatePlanProgress(progressEl: HTMLElement, data: PlanProgressData) {
        // 상태 업데이트 - 완전한 UI 구성
        if (data.status) {
            let content = `
                <div style="color: #2c3e50 !important; font-size: 16px !important; font-weight: bold !important; margin-bottom: 15px !important; display: flex !important; align-items: center !important;">
                    🧠 Plan & Execute 모드
                </div>
                <div style="color: #e67e22 !important; font-size: 14px !important; font-weight: 600 !important; margin-bottom: 15px !important;">
                    ${data.status}
                </div>
            `;
            
            // 계획이 있으면 표시
            if (data.plan && data.plan.length > 0) {
                content += `
                    <div style="margin-bottom: 20px !important;">
                        <h4 style="color: #2c3e50 !important; font-size: 14px !important; font-weight: bold !important; margin-bottom: 10px !important; display: flex !important; align-items: center !important;">
                            📋 실행 계획
                        </h4>
                        <ol style="color: #2c3e50 !important; font-size: 13px !important; padding-left: 20px !important; margin: 0 !important;">
                `;
                
                data.plan.forEach((step, index) => {
                    const isCompleted = index < (data.currentStep || 0);
                    const isCurrent = index === (data.currentStep || 0);
                    
                    let stepStyle = '';
                    let stepIcon = '';
                    
                    if (isCompleted) {
                        stepStyle = 'color: #27ae60 !important; text-decoration: line-through !important;';
                        stepIcon = '✅ ';
                    } else if (isCurrent) {
                        stepStyle = 'color: #3498db !important; font-weight: bold !important;';
                        stepIcon = '🔄 ';
                    } else {
                        stepStyle = 'color: #7f8c8d !important;';
                        stepIcon = '⏳ ';
                    }
                    
                    content += `<li style="${stepStyle} margin-bottom: 6px !important; padding: 4px 0 !important;">${stepIcon}${step}</li>`;
                });
                
                content += `</ol></div>`;
            }
            
            // 현재 단계 설명
            if (data.currentStepDescription) {
                content += `
                    <div style="margin-bottom: 20px !important;">
                        <h4 style="color: #2c3e50 !important; font-size: 14px !important; font-weight: bold !important; margin-bottom: 10px !important; display: flex !important; align-items: center !important;">
                            ⚡ 현재 진행 중
                        </h4>
                        <div style="color: #2980b9 !important; font-size: 13px !important; padding: 12px !important; background: #ecf0f1 !important; border-radius: 6px !important; border-left: 4px solid #3498db !important;">
                            ${data.currentStepDescription}
                        </div>
                    </div>
                `;
            }
            
            // 도구 사용 정보
            if (data.toolUsed) {
                content += `
                    <div style="margin-bottom: 20px !important;">
                        <h4 style="color: #2c3e50 !important; font-size: 14px !important; font-weight: bold !important; margin-bottom: 10px !important; display: flex !important; align-items: center !important;">
                            🔧 도구 사용 중
                        </h4>
                        <div style="color: #8e44ad !important; font-size: 12px !important; font-weight: 600 !important; background: #f8f9fa !important; padding: 8px !important; border-radius: 4px !important; border-left: 3px solid #8e44ad !important;">
                            ${data.toolUsed}
                        </div>
                `;
                
                if (data.toolResult) {
                    const shortResult = data.toolResult.length > 150 ? data.toolResult.substring(0, 150) + '...' : data.toolResult;
                    content += `
                        <div style="color: #6c757d !important; font-size: 11px !important; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important; background: #f1f3f4 !important; padding: 8px !important; border-radius: 4px !important; margin-top: 8px !important; border: 1px solid #dee2e6 !important; white-space: pre-wrap !important;">
                            ${shortResult}
                        </div>
                    `;
                }
                
                content += `</div>`;
            }
            
            // 진행 바
            if (data.currentStep !== undefined && data.totalSteps !== undefined && data.totalSteps > 0) {
                const percentage = Math.round((data.currentStep / data.totalSteps) * 100);
                content += `
                    <div style="margin-top: 20px !important;">
                        <div style="display: flex !important; justify-content: space-between !important; align-items: center !important; margin-bottom: 8px !important;">
                            <span style="font-size: 12px !important; color: #6c757d !important; font-weight: 600 !important;">진행 상황</span>
                            <span style="font-size: 12px !important; color: #495057 !important; font-weight: bold !important;">${data.currentStep}/${data.totalSteps} 단계</span>
                        </div>
                        <div style="width: 100% !important; height: 8px !important; background: #e9ecef !important; border-radius: 4px !important; overflow: hidden !important; margin-bottom: 8px !important;">
                            <div style="height: 100% !important; background: linear-gradient(90deg, #3498db, #27ae60) !important; border-radius: 4px !important; width: ${percentage}% !important; transition: width 0.5s ease !important;"></div>
                        </div>
                        <div style="font-size: 11px !important; color: #6c757d !important; text-align: center !important;">
                            ${percentage}% 완료
                        </div>
                    </div>
                `;
            }
            
            progressEl.innerHTML = content;
            
            // 스크롤을 맨 아래로 유지
            const messagesContainer = progressEl.parentElement;
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }
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
                this.addMessage("assistant", `⚠️ Gemini API 키가 설정되지 않았습니다. 설정에서 API 키를 설정해주세요.`, messagesContainer);
                return;
            }

            // Plan & Execute 모드 여부 확인
            const isPlanExecuteMode = this.executionMode === 'plan-execute';
            console.log('🎯 Execution Mode:', this.executionMode);
            
            // 로딩 메시지 또는 Plan & Execute 진행 상황 표시
            let loadingMessage: HTMLElement;
            if (isPlanExecuteMode) {
                console.log('🎯 Plan & Execute 진행 상황 메시지 생성');
                loadingMessage = this.createPlanProgressMessage(messagesContainer);
                console.log('🎯 loadingMessage (Plan & Execute):', loadingMessage);
            } else {
                console.log('🎯 일반 로딩 메시지 생성');
                loadingMessage = this.addMessage("assistant", "🤔 생각중...", messagesContainer);
                console.log('🎯 loadingMessage (일반):', loadingMessage);
            }

            try {
                // 현재 설정된 모델 가져오기
                const model = this.plugin?.settings?.model || 'gemini-2.5-flash';
                
                // Gemini API 호출
                let response: string;
                console.log('🔍 Gemini로 전달하는 멘션 정보:', this.mentionedNotesInfo);
                
                switch (this.executionMode) {
                    case 'plan-execute':
                        response = await this.geminiService.sendMessageWithProgress(
                            model, 
                            this.mentionedNotesInfo,
                            (progressData: PlanProgressData) => {
                                this.updatePlanProgress(loadingMessage, progressData);
                            }
                        );
                        break;
                    case 'single-tool':
                        response = await this.geminiService.sendMessageLegacy(model, this.mentionedNotesInfo);
                        break;
                    case 'no-tools':
                        const lastUserMsg = this.geminiService.getHistory().slice(-1)[0];
                        const conversationContext = this.geminiService.getHistory().slice(0, -1).slice(-20).map(m => `${m.role}: ${m.content}`).join('\n');
                        response = await this.geminiService.sendMessageWithoutTools(model, lastUserMsg, conversationContext);
                        break;
                    default:
                        response = await this.geminiService.sendMessageLegacy(model, this.mentionedNotesInfo);
                }

                // 로딩 메시지 제거
                loadingMessage.remove();

                // AI 응답 추가 (UI)
                this.addMessage("assistant", response!, messagesContainer);
                // 대화 내역에 AI 응답 추가 (서비스)
                currentService.addMessage("assistant", response!);
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
            // 전송 완료 후 멘션된 파일들 클리어
            this.clearAllMentionedFiles();
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
        
        // 모든 워크스페이스 리프 확인
        this.app.workspace.iterateAllLeaves((leaf) => {
            const viewType = leaf.view.getViewType();
            const view = leaf.view as any;
            
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
                    openTabs.push({
                        name: file.basename,
                        path: this.getFileAbsolutePath(file.path),
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
        
        // 중복 제거 및 제한
        const uniqueTabs = openTabs.filter((tab, index, self) => 
            index === self.findIndex(t => t.path === tab.path)
        );
        
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
        const lowerQuery = query.toLowerCase();
        const results: Array<{name: string, path: string, type?: 'note' | 'webview' | 'pdf', url?: string}> = [];
        
        // 1. 먼저 열린 탭들에서 검색
        const openTabs = this.getOpenTabs();
        
        const matchingTabs = openTabs.filter(tab => 
            tab.name.toLowerCase().includes(lowerQuery)
        );
        results.push(...matchingTabs);
        
        // 2. 전체 마크다운 파일에서 검색 (열린 탭에 없는 것들만)
        const markdownFiles = this.app.vault.getMarkdownFiles();
        const openNotePaths = openTabs.filter(tab => tab.type === 'note').map(tab => tab.path);
        
        const matchingMarkdownFiles = markdownFiles
            .filter(file => 
                file.basename.toLowerCase().includes(lowerQuery) &&
                !openNotePaths.includes(file.path)
            )
            .slice(0, 3) // 마크다운 파일은 최대 3개
            .map(file => ({
                name: file.basename,
                path: file.path,
                type: 'note' as const
            }));
        
        results.push(...matchingMarkdownFiles);
        
        // 3. 전체 파일에서 PDF 검색 (열린 탭에 없는 것들만)
        const allFiles = this.app.vault.getFiles();
        const openPdfPaths = openTabs.filter(tab => tab.type === 'pdf').map(tab => tab.path);
        
        const matchingPdfFiles = allFiles
            .filter(file => 
                file.extension === 'pdf' &&
                file.basename.toLowerCase().includes(lowerQuery) &&
                !openPdfPaths.includes(this.getFileAbsolutePath(file.path))
            )
            .slice(0, 3) // PDF 파일은 최대 3개
            .map(file => ({
                name: file.basename,
                path: this.getFileAbsolutePath(file.path),
                type: 'pdf' as const
            }));
        
        results.push(...matchingPdfFiles);
        
        return results.slice(0, 10); // 전체 최대 10개
    }

    // 노트 자동완성 표시 (열린 탭 우선)
    private showNoteAutocomplete(query: string = '') {
        if (!this.messageInput) return;
        
        // 기존 자동완성 제거
        this.hideNoteAutocomplete();
        
        // 노트와 탭 가져오기
        const items = query ? this.searchNotesAndTabs(query) : this.getOpenTabs();
        
        if (items.length === 0) {
            // 폴백: 최근 노트 표시
            const recentNotes = this.getRecentNotes();
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
                
                // 원본 아이템 데이터를 DOM에 저장 (키보드 네비게이션용)
                (itemEl as any)._itemData = item;
                
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
                    text: item.type === 'pdf' ? `${item.name}.pdf` : 
                          item.type === 'note' ? `${item.name}.md` : item.name
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

    // 노트 선택 (웹뷰 지원) - 개선된 UI
    private selectNote(noteName: string, itemInfo?: {name: string, path: string, type?: 'note' | 'webview' | 'pdf', url?: string}) {
        if (!this.messageInput) return;
        
        console.log('🔍 selectNote 호출:', {
            noteName,
            itemInfo,
            hasItemInfo: !!itemInfo,
            itemInfoPath: itemInfo?.path,
            itemInfoType: itemInfo?.type
        });
        
        const currentValue = this.messageInput.value;
        const cursorPos = this.messageInput.selectionStart || 0;
        
        // '@' 시작 위치부터 현재 커서 위치까지 제거 (메시지에서 멘션 텍스트 삭제)
        const beforeMention = currentValue.substring(0, this.currentMentionStart);
        const afterMention = currentValue.substring(cursorPos);
        
        const newValue = beforeMention + afterMention;
        this.messageInput.value = newValue;
        
        // 커서 위치 조정 (멘션 시작 위치로)
        this.messageInput.setSelectionRange(this.currentMentionStart, this.currentMentionStart);
        
        // 언급된 노트/웹뷰 추가 (중복 방지 - 이름과 타입으로 구분)
        const existingItem = this.mentionedNotesInfo.find(item => 
            item.name === noteName && item.type === (itemInfo?.type || 'note')
        );
        
        if (!existingItem) {
            this.mentionedNotes.push(noteName);
            
            // 상세 정보 업데이트
            if (itemInfo) {
                console.log('🔍 itemInfo가 있음 - 경로 사용:', itemInfo.path);
                this.mentionedNotesInfo.push({
                    name: noteName,
                    path: itemInfo.path,
                    type: itemInfo.type,
                    url: itemInfo.url
                });
            } else {
                console.log('🔍 itemInfo가 없음 - 기본 경로 생성:', `${noteName}.md`);
                // 기본 정보 추가
                this.mentionedNotesInfo.push({
                    name: noteName,
                    path: `${noteName}.md`,
                    type: 'note'
                });
            }
            
            console.log('🔍 최종 mentionedNotesInfo:', this.mentionedNotesInfo);
            
            // 멘션된 파일들 UI 업데이트
            this.updateMentionedFilesDisplay();
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
                    
                    // DOM에 저장된 원본 아이템 데이터 사용
                    const itemData = (selectedItem as any)._itemData;
                    if (itemData) {
                        console.log('🔍 키보드 네비게이션 - 원본 아이템 데이터 사용:', itemData);
                        this.selectNote(itemData.name, itemData);
                    } else {
                        // 폴백: 기존 방식 (하지만 path 처리 개선)
                        const noteNameElement = selectedItem.querySelector('.chatbot-note-autocomplete-item-title');
                        if (noteNameElement) {
                            let displayName = noteNameElement.textContent || '';
                            
                            // DOM에서 타입 정보 추출
                            const iconElement = selectedItem.querySelector('.chatbot-note-autocomplete-item-icon');
                            const icon = iconElement?.textContent || '📝';
                            const pathElement = selectedItem.querySelector('.chatbot-note-autocomplete-item-path');
                            
                            let type: 'note' | 'webview' | 'pdf' = 'note';
                            let noteName = displayName;
                            let path = '';
                            
                            if (icon === '🌐') {
                                type = 'webview';
                                path = pathElement?.textContent || displayName;
                            } else if (icon === '📄') {
                                type = 'pdf';
                                // PDF인 경우 확장자 제거
                                if (displayName.endsWith('.pdf')) {
                                    noteName = displayName.slice(0, -4);
                                }
                                path = pathElement?.textContent || `${noteName}.pdf`;
                            } else {
                                // 노트인 경우 확장자 제거
                                if (displayName.endsWith('.md')) {
                                    noteName = displayName.slice(0, -3);
                                }
                                // path는 pathElement가 있으면 사용, 없으면 noteName + .md
                                path = pathElement?.textContent || `${noteName}.md`;
                            }
                            
                            // 아이템 정보 구성
                            const itemInfo = {
                                name: noteName,
                                path: path,
                                type: type,
                                url: type === 'webview' ? path : undefined
                            };
                            
                            console.log('🔍 키보드 네비게이션 - 폴백 모드:', itemInfo);
                            this.selectNote(noteName, itemInfo);
                        }
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
        
        // '@' 뒤의 텍스트 찾기 (공백 허용 - 다음 '@' 또는 줄바꿈까지)
        let mentionStart = -1;
        for (let i = cursorPos - 1; i >= 0; i--) {
            if (text[i] === '@') {
                mentionStart = i;
                break;
            }
            // 줄바꿈만 멘션을 중단하도록 변경 (공백은 허용)
            if (text[i] === '\n') {
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
        // 개선된 멘션 파싱: 공백이 포함된 파일명도 처리
        // @로 시작해서 다음 @ 또는 문자열 끝까지 매칭 (공백 포함)
        const mentions = [];
        const mentionRegex = /@([^@]+?)(?=\s@|$)/g;
        let match;
        
        while ((match = mentionRegex.exec(message)) !== null) {
            mentions.push(match[0]); // 전체 매치 (@포함)
        }
        
        // 폴백: 기존 방식도 시도 (호환성)
        if (mentions.length === 0) {
            const simpleMentions = message.match(/@([^\s]+)/g);
            if (simpleMentions) {
                mentions.push(...simpleMentions);
            }
        }
        

         if (mentions.length > 0) {
            const noteNames = mentions.map(mention => mention.substring(1).trim()); // '@' 제거 및 공백 정리
            
            // 각 노트 이름에 해당하는 파일/웹뷰 찾기
            const mentionedItemInfo: MentionedItemInfo[] = [];
            
            noteNames.forEach(noteName => {
                // 이미 멘션된 파일인지 확인 (중복 방지 - 이름과 타입으로 구분)
                // 타입을 알 수 없으므로 우선 note 타입으로 체크하고, 실제 찾은 타입으로 다시 체크
                
                // 1. 먼저 현재 열린 탭에서 찾기
                const openTabs = this.getOpenTabs();
                const openTab = openTabs.find(tab => tab.name === noteName);
                
                if (openTab) {
                    // 이미 같은 이름과 타입의 파일이 있는지 확인
                    const alreadyMentioned = this.mentionedNotesInfo.find(item => 
                        item.name === noteName && item.type === openTab.type
                    );
                    if (!alreadyMentioned) {
                        mentionedItemInfo.push({
                            name: noteName,
                            path: openTab.path,
                            type: openTab.type,
                            url: openTab.url
                        });
                    }
                } else {
                    // 2. 전체 vault에서 파일 찾기 (모든 파일 타입)
                    let foundFile = false;
                    
                    // 2-1. 마크다운 파일 검색
                    const markdownFiles = this.app.vault.getMarkdownFiles();
                    const matchingMarkdown = markdownFiles.find(file => file.basename === noteName);
                    
                    if (matchingMarkdown) {
                        const alreadyMentioned = this.mentionedNotesInfo.find(item => 
                            item.name === noteName && item.type === 'note'
                        );
                        if (!alreadyMentioned) {
                            console.log('🔍 extractMentionedNotes - 마크다운 파일 추가:', {
                                name: noteName,
                                path: matchingMarkdown.path,
                                type: 'note'
                            });
                            mentionedItemInfo.push({
                                name: noteName,
                                path: matchingMarkdown.path,
                                type: 'note'
                            });
                        }
                        foundFile = true;
                    }
                    
                    // 2-2. 모든 파일 검색 (PDF 포함) - 마크다운과 별도로 처리
                    const allFiles = this.app.vault.getFiles();
                    const matchingFile = allFiles.find(file => file.basename === noteName && file.extension === 'pdf');
                    
                    if (matchingFile) {
                        const alreadyMentioned = this.mentionedNotesInfo.find(item => 
                            item.name === noteName && item.type === 'pdf'
                        );
                        if (!alreadyMentioned) {
                            // 파일 확장자로 타입 결정
                            const fileType = matchingFile.extension === 'pdf' ? 'pdf' : 'note';
                            const filePath = fileType === 'pdf' ? this.getFileAbsolutePath(matchingFile.path) : matchingFile.path;
                            
                            mentionedItemInfo.push({
                                name: noteName,
                                path: filePath,
                                type: fileType
                            });
                        }
                        foundFile = true;
                    }
                    
                    // 3. 파일을 찾을 수 없는 경우
                    if (!foundFile) {
                        const alreadyMentioned = this.mentionedNotesInfo.find(item => 
                            item.name === noteName && item.type === 'note'
                        );
                        if (!alreadyMentioned) {
                            mentionedItemInfo.push({
                                name: noteName,
                                path: `${noteName}.md (파일을 찾을 수 없음)`,
                                type: 'note'
                            });
                        }
                    }
                }
            });
            
            // 기존 멘션된 파일들과 새로 찾은 파일들을 합치기
            const allNoteNames = [...new Set([...this.mentionedNotes, ...noteNames])]; // 중복 제거
            this.mentionedNotes = allNoteNames;
            this.mentionedNotesInfo = [...this.mentionedNotesInfo, ...mentionedItemInfo]; // 기존 것과 합치기
        }
        // mentions.length === 0일 때는 기존 멘션 정보를 유지 (지우지 않음)
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
                        path: this.getFileAbsolutePath(file.path),
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

    // 멘션된 아이템들에서 노트 정보를 추출
    private extractMentionedItemInfos(mentions: string[]): MentionedItemInfo[] {
        const itemInfos: MentionedItemInfo[] = [];
        
        mentions.forEach(mention => {
            const noteName = mention.startsWith('@') ? mention.slice(1) : mention;
            
            // 1. 먼저 현재 열린 탭에서 찾기
            const openTabs = this.getOpenTabs();
            const openTab = openTabs.find(tab => tab.name === noteName);
            
            if (openTab) {
                itemInfos.push({
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
                    itemInfos.push({
                        name: noteName,
                        path: matchingFile.path,
                        type: 'note'
                    });
                } else {
                    // 3. 파일을 찾을 수 없는 경우
                    itemInfos.push({
                        name: noteName,
                        path: `${noteName}.md (파일을 찾을 수 없음)`,
                        type: 'note'
                    });
                }
            }
        });
        
        return itemInfos;
    }

    // 멘션된 파일들 표시 UI 업데이트
    private updateMentionedFilesDisplay() {
        if (!this.mentionedFilesContainer) return;
        
        // 컨테이너 초기화
        this.mentionedFilesContainer.empty();
        
        if (this.mentionedNotesInfo.length === 0) {
            // 멘션된 파일이 없으면 숨기기
            this.mentionedFilesContainer.style.display = 'none';
            return;
        }
        
        // 멘션된 파일이 있으면 표시
        this.mentionedFilesContainer.style.display = 'block';
        
        // 파일 목록 컨테이너 (헤더 제거)
        const filesContainer = this.mentionedFilesContainer.createEl('div', {
            cls: 'chatbot-mentioned-files-list'
        });
        
        // 각 멘션된 파일에 대한 태그 생성
        this.mentionedNotesInfo.forEach((item, index) => {
            const fileTag = filesContainer.createEl('div', {
                cls: 'chatbot-mentioned-file-tag'
            });
            
            // 파일 타입 아이콘
            let icon = '📝'; // 기본값: 노트
            if (item.type === 'webview') {
                icon = '🌐';
            } else if (item.type === 'pdf') {
                icon = '📄';
            }
            
            // 아이콘과 파일명 (확장자 포함)
            const displayName = item.type === 'pdf' ? `${item.name}.pdf` : 
                               item.type === 'note' ? `${item.name}.md` : item.name;
            const fileInfo = fileTag.createEl('span', {
                cls: 'chatbot-mentioned-file-info',
                text: `${icon} ${displayName}`
            });
            
            // 삭제 버튼
            const removeBtn = fileTag.createEl('button', {
                cls: 'chatbot-mentioned-file-remove',
                text: '×',
                attr: { title: '첨부 해제' }
            });
            
            // 삭제 버튼 클릭 이벤트
            removeBtn.addEventListener('click', () => {
                this.removeMentionedFile(index);
            });
        });
    }
    
    // 멘션된 파일 제거
    private removeMentionedFile(index: number) {
        if (index >= 0 && index < this.mentionedNotesInfo.length) {
            // 배열에서 제거
            this.mentionedNotes.splice(index, 1);
            this.mentionedNotesInfo.splice(index, 1);
            
            // UI 업데이트
            this.updateMentionedFilesDisplay();
        }
    }
    
    // 모든 멘션된 파일 제거
    private clearAllMentionedFiles() {
        this.mentionedNotes = [];
        this.mentionedNotesInfo = [];
        this.updateMentionedFilesDisplay();
    }

    // 메시지에서 @ 멘션 제거 (environment context로만 전달)
    private removeMentionsFromMessage(message: string): string {
        // @ 멘션 패턴 제거
        return message
            .replace(/@([^@]+?)(?=\s@|$)/g, '') // 멘션 패턴 제거
            .replace(/@([^\s]+)/g, '') // 간단한 멘션도 제거
            .replace(/\s+/g, ' ') // 연속된 공백을 하나로
            .trim(); // 앞뒤 공백 제거
    }
}