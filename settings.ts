import { PluginSettingTab, App, Setting, Notice } from "obsidian";
import { ChatbotPluginSettings } from "./types";

export const DEFAULT_SETTINGS: ChatbotPluginSettings = {
    aiProvider: "openai",
    openaiApiKey: "",
    geminiApiKey: "",
    model: "gpt-4.1",
    maxTokens: 1000,
    chatHistoryFolder: "ChatHistory",
    mcpServers: []
};

export type { ChatbotPluginSettings };

export class ChatbotSettingTab extends PluginSettingTab {
    plugin: any;

    constructor(app: App, plugin: any) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "AI Chatbot 설정" });

        // AI 제공자 선택
        new Setting(containerEl)
            .setName("AI 제공자")
            .setDesc("사용할 AI 서비스를 선택하세요. 현재는 gemini만 MCP 연결 가능합니다.")
            .addDropdown(dropdown => {
                dropdown
                    .addOption("openai", "OpenAI")
                    .addOption("gemini", "Google Gemini")
                    .setValue(this.plugin.settings.aiProvider || "openai")
                    .onChange(async (value: 'openai' | 'gemini') => {
                        this.plugin.settings.aiProvider = value;
                        await this.plugin.saveSettings();
                        this.display();
                    });
            });

        // OpenAI API Key
        if (this.plugin.settings.aiProvider === 'openai') {
            new Setting(containerEl)
                .setName("OpenAI API Key")
                .setDesc("OpenAI API 키를 입력하세요.")
                .addText(text => {
                    text
                        .setPlaceholder("sk-...")
                        .setValue(this.plugin.settings.openaiApiKey || "")
                        .onChange(async (value) => {
                            this.plugin.settings.openaiApiKey = value.trim();
                            await this.plugin.saveSettings();
                        });
                });
        }

        // Gemini API Key
        if (this.plugin.settings.aiProvider === 'gemini') {
            new Setting(containerEl)
                .setName("Gemini API Key")
                .setDesc("Google Gemini API 키를 입력하세요.")
                .addText(text => {
                    text
                        .setPlaceholder("AIza...")
                        .setValue(this.plugin.settings.geminiApiKey || "")
                        .onChange(async (value) => {
                            this.plugin.settings.geminiApiKey = value.trim();
                            await this.plugin.saveSettings();
                        });
                });
        }

        // 모델 선택
        new Setting(containerEl)
            .setName("AI 모델")
            .setDesc("사용할 AI 모델을 선택하세요.")
            .addDropdown(dropdown => {
                if (this.plugin.settings.aiProvider === 'openai') {
                    dropdown
                        .addOption("gpt-4o", "GPT-4o")
                        .addOption("gpt-4.1", "GPT-4.1");
                } else {
                    dropdown
                        .addOption("gemini-2.5-pro", "Gemini 2.5 Pro")
                        .addOption("gemini-2.5-flash", "Gemini 2.5 Flash");
                }
                dropdown
                    .setValue(this.plugin.settings.model || (this.plugin.settings.aiProvider === 'openai' ? "gpt-4o" : "gemini-2.5-pro"))
                    .onChange(async (value) => {
                        this.plugin.settings.model = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 최대 토큰
        new Setting(containerEl)
            .setName("최대 토큰 수")
            .setDesc("응답의 최대 길이를 설정합니다. (100-10000)")
            .addSlider(slider => {
                slider
                    .setLimits(100, 10000, 100)
                    .setValue(this.plugin.settings.maxTokens || 1000)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.maxTokens = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 대화 내역 저장 폴더
        new Setting(containerEl)
            .setName("대화 내역 저장 폴더")
            .setDesc("대화 내역을 저장할 폴더명을 설정합니다.")
            .addText(text => {
                text
                    .setPlaceholder("ChatHistory")
                    .setValue(this.plugin.settings.chatHistoryFolder || "ChatHistory")
                    .onChange(async (value) => {
                        this.plugin.settings.chatHistoryFolder = value.trim() || "ChatHistory";
                        await this.plugin.saveSettings();
                    });
            });

        // MCP 서버 설정 (Gemini일 때만)
        if (this.plugin.settings.aiProvider === 'gemini') {
            containerEl.createEl("h3", { text: "MCP 서버 설정" });
            containerEl.createEl("p", { text: "MCP 서버를 등록하여 Gemini가 사용할 수 있는 도구를 확장할 수 있습니다.", cls: "setting-item-description" });

            new Setting(containerEl)
                .setName("MCP 서버 추가")
                .setDesc("새로운 MCP 서버를 추가합니다.")
                .addButton(button => {
                    button
                        .setButtonText("서버 추가")
                        .setCta()
                        .onClick(() => {
                            this.showMCPServerModal();
                        });
                });

            // 등록된 MCP 서버 목록
            const mcpServers = this.plugin.settings.mcpServers || [];
            if (mcpServers.length > 0) {
                containerEl.createEl("h4", { text: "등록된 MCP 서버" });
                mcpServers.forEach((server: any, index: number) => {
                    const serverContainer = containerEl.createEl("div", { cls: "mcp-server-item" });
                    new Setting(serverContainer)
                        .setName(server.name)
                        .setDesc(`경로: ${server.path}`)
                        .addToggle(toggle => {
                            toggle
                                .setValue(server.enabled)
                                .onChange(async (value) => {
                                    this.plugin.settings.mcpServers[index].enabled = value;
                                    await this.plugin.saveSettings();
                                });
                        })
                        .addButton(button => {
                            button
                                .setButtonText("삭제")
                                .setWarning()
                                .onClick(async () => {
                                    this.plugin.settings.mcpServers.splice(index, 1);
                                    await this.plugin.saveSettings();
                                    this.display();
                                });
                        });
                });
            }
        }
    }

    // MCP 서버 추가 모달
    private showMCPServerModal() {
        const modal = document.createElement('div');
        modal.className = 'chatbot-modal-container';
        modal.innerHTML = `
            <div class="chatbot-modal">
                <div class="chatbot-modal-bg"></div>
                <div class="chatbot-modal-content">
                    <div class="chatbot-modal-header">
                        <h2>MCP 서버 추가</h2>
                    </div>
                    <div class="chatbot-modal-body">
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 4px; font-weight: 500;">서버 이름:</label>
                            <input type="text" id="mcp-server-name" placeholder="예: weather-server" style="width: 100%; padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 4px; background: var(--background-primary); color: var(--text-normal);">
                        </div>
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 4px; font-weight: 500;">서버 경로:</label>
                            <input type="text" id="mcp-server-path" placeholder="예: /path/to/server.js" style="width: 100%; padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 4px; background: var(--background-primary); color: var(--text-normal);">
                        </div>
                        <p style="color: var(--text-muted); font-size: 12px; margin: 0;">로컬 MCP 서버의 .js 또는 .py 파일 경로를 입력하세요.</p>
                    </div>
                    <div class="chatbot-modal-footer">
                        <button type="button" class="mod-cta" id="add-mcp-server">추가</button>
                        <button type="button" id="cancel-mcp-server">취소</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        const nameInput = modal.querySelector('#mcp-server-name') as HTMLInputElement;
        const pathInput = modal.querySelector('#mcp-server-path') as HTMLInputElement;
        const addBtn = modal.querySelector('#add-mcp-server');
        const cancelBtn = modal.querySelector('#cancel-mcp-server');
        
        // 설정 컨테이너를 비활성화하여 포커스 이동 방지
        const settingsContainer = this.containerEl;
        settingsContainer.style.pointerEvents = 'none';
        settingsContainer.setAttribute('inert', '');
        
        // 포커스 트랩 - 모달 외부로 포커스가 이동하지 않도록 함
        const focusableElements = modal.querySelectorAll('input, button');
        const firstFocusable = focusableElements[0] as HTMLElement;
        const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;
        
        // 키보드 이벤트 핸들러
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeModal();
                return;
            }
            
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstFocusable) {
                        e.preventDefault();
                        lastFocusable.focus();
                    }
                } else {
                    if (document.activeElement === lastFocusable) {
                        e.preventDefault();
                        firstFocusable.focus();
                    }
                }
            }
        };
        
        // 모달 닫기 함수
        const closeModal = () => {
            document.removeEventListener('keydown', handleKeyDown);
            settingsContainer.style.pointerEvents = '';
            settingsContainer.removeAttribute('inert');
            document.body.removeChild(modal);
        };
        
        document.addEventListener('keydown', handleKeyDown);
        
        // 강제 포커스 유지 - 다른 요소가 포커스를 받으면 다시 모달로 이동
        const maintainFocus = () => {
            const activeElement = document.activeElement;
            if (activeElement && !modal.contains(activeElement)) {
                nameInput.focus();
            }
        };
        
        // 포커스 유지 인터벌
        const focusInterval = setInterval(maintainFocus, 100);
        
        // 모달이 뜨면 첫 입력란에 포커스
        setTimeout(() => { 
            nameInput.focus();
        }, 50);
        
        // 추가 버튼
        addBtn?.addEventListener('click', async (e) => {
            e.preventDefault();
            const name = nameInput.value.trim();
            const path = pathInput.value.trim();
            if (!name || !path) {
                new Notice("서버 이름과 경로를 모두 입력해주세요.");
                return;
            }
            if (!path.endsWith('.js') && !path.endsWith('.py')) {
                new Notice("서버 경로는 .js 또는 .py 파일이어야 합니다.");
                return;
            }
            const existingServers = this.plugin.settings.mcpServers || [];
            if (existingServers.some((server: any) => server.name === name)) {
                new Notice("같은 이름의 서버가 이미 존재합니다.");
                return;
            }
            this.plugin.settings.mcpServers.push({ name, path, enabled: true });
            await this.plugin.saveSettings();
            new Notice(`MCP 서버 "${name}"이 추가되었습니다.`);
            clearInterval(focusInterval);
            closeModal();
            this.display();
        });
        
        // 취소 버튼
        cancelBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            clearInterval(focusInterval);
            closeModal();
        });
        
        // 배경 클릭 시 닫기
        const modalBg = modal.querySelector('.chatbot-modal-bg');
        modalBg?.addEventListener('click', (e) => {
            e.preventDefault();
            clearInterval(focusInterval);
            closeModal();
        });
        
        // 모달 컨텐츠 클릭 시 이벤트 전파 차단
        const modalContent = modal.querySelector('.chatbot-modal-content');
        modalContent?.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
}
