import { PluginSettingTab, App, Setting, Notice } from "obsidian";
import { ChatbotPluginSettings } from "./types";

export const DEFAULT_SETTINGS: ChatbotPluginSettings = {
    aiProvider: "gemini",
    geminiApiKey: "",
    model: "gemini-2.5-flash",
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

        // Vault 이름 요구사항 경고
        const warningEl = containerEl.createEl("div", { 
            cls: "callout mod-warning",
            attr: { "data-callout": "warning" }
        });
        
        const warningContent = warningEl.createEl("div", { cls: "callout-content" });
        warningContent.createEl("p", { 
            text: "⚠️ 중요: 이 플러그인을 사용하려면 Obsidian Vault 이름이 다음 조건을 만족해야 합니다:"
        });
        
        const requirementsList = warningContent.createEl("ul");
        requirementsList.createEl("li", { text: "영어로만 구성되어야 합니다" });
        requirementsList.createEl("li", { text: "대문자는 사용할 수 없습니다 (소문자만 허용)" });
        requirementsList.createEl("li", { text: "특수문자와 띄어쓰기는 사용할 수 없습니다 (하이픈 '-'만 허용)" });
        
        warningContent.createEl("p", { 
            text: "예시: ✅ my-obsidian-vault, my-notes  |  ❌ My Vault, 내 볼트, my_vault, MyVault"
        });

        // Gemini API Key
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

        // 모델 선택
        new Setting(containerEl)
            .setName("AI 모델")
            .setDesc("사용할 Gemini 모델을 선택하세요.")
            .addDropdown(dropdown => {
                dropdown
                    .addOption("gemini-2.5-pro", "Gemini 2.5 Pro")
                    .addOption("gemini-2.5-flash", "Gemini 2.5 Flash")
                    .setValue(this.plugin.settings.model || "gemini-2.5-flash")
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

        // MCP 서버 설정
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
                    .setDesc(`경로: ${server.path}\n명령어: ${server.command || '미설정'}${server.args ? `\n인자: ${server.args}` : ''}`)
                    .addToggle(toggle => {
                        toggle
                            .setValue(server.enabled)
                            .onChange(async (value) => {
                                this.plugin.settings.mcpServers[index].enabled = value;
                                await this.plugin.saveSettings();
                                
                                // MCP 서버 설정 변경 알림
                                this.plugin.onMCPServersChanged();
                            });
                    })
                    .addButton(button => {
                        button
                            .setButtonText("편집")
                            .setTooltip("서버 설정 편집")
                            .onClick(() => {
                                this.showMCPServerModal(index);
                            });
                    })
                    .addButton(button => {
                        button
                            .setButtonText("삭제")
                            .setWarning()
                            .onClick(async () => {
                                this.plugin.settings.mcpServers.splice(index, 1);
                                await this.plugin.saveSettings();
                                
                                // MCP 서버 설정 변경 알림
                                this.plugin.onMCPServersChanged();
                                
                                this.display();
                            });
                    });
            });
        }
    }

    // MCP 서버 추가/편집 모달
    private showMCPServerModal(editIndex?: number) {
        const isEditing = editIndex !== undefined;
        const existingServer = isEditing ? this.plugin.settings.mcpServers[editIndex] : null;
        
        const modal = document.createElement('div');
        modal.className = 'chatbot-modal-container';
        modal.innerHTML = `
            <div class="chatbot-modal">
                <div class="chatbot-modal-bg"></div>
                <div class="chatbot-modal-content">
                    <div class="chatbot-modal-header">
                        <h2>${isEditing ? 'MCP 서버 편집' : 'MCP 서버 추가'}</h2>
                    </div>
                    <div class="chatbot-modal-body">
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 4px; font-weight: 500;">서버 이름:</label>
                            <input type="text" id="mcp-server-name" placeholder="예: weather-server" value="${existingServer?.name || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 4px; background: var(--background-primary); color: var(--text-normal);">
                        </div>
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 4px; font-weight: 500;">서버 경로:</label>
                            <input type="text" id="mcp-server-path" placeholder="예: /path/to/server.py" value="${existingServer?.path || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 4px; background: var(--background-primary); color: var(--text-normal);">
                        </div>
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 4px; font-weight: 500;">실행 명령어:</label>
                            <input type="text" id="mcp-server-command" placeholder="예: python, node, uv run python server.py" value="${existingServer?.command || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 4px; background: var(--background-primary); color: var(--text-normal);">
                        </div>
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 4px; font-weight: 500;">실행 인자 (선택사항):</label>
                            <input type="text" id="mcp-server-args" placeholder="예: --port 8080, --verbose, --config config.json" value="${existingServer?.args || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 4px; background: var(--background-primary); color: var(--text-normal);">
                        </div>
                        <p style="color: var(--text-muted); font-size: 12px; margin: 0 0 16px 0;">
                            MCP 서버를 실행하기 위한 명령어를 입력하세요. 서버는 해당 스크립트의 디렉토리에서 실행됩니다.<br>
                            <strong>예시:</strong><br>
                            • Python: <code>python</code><br>
                            • Node.js: <code>node</code><br>
                            • uv 환경: <code>uv run python</code><br>
                            • conda 환경: <code>conda run -n myenv python</code><br>
                            • 가상환경: <code>./venv/bin/python</code> 또는 <code>source venv/bin/activate && python</code><br>
                            <strong>실행 인자:</strong> 서버에 전달할 추가 인자들을 공백으로 구분하여 입력하세요.
                        </p>
                    </div>
                    <div class="chatbot-modal-footer">
                        <button type="button" class="mod-cta" id="add-mcp-server">${isEditing ? '수정' : '추가'}</button>
                        <button type="button" id="cancel-mcp-server">취소</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        const nameInput = modal.querySelector('#mcp-server-name') as HTMLInputElement;
        const pathInput = modal.querySelector('#mcp-server-path') as HTMLInputElement;
        const commandInput = modal.querySelector('#mcp-server-command') as HTMLInputElement;
        const argsInput = modal.querySelector('#mcp-server-args') as HTMLInputElement;
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
        
        // 추가/수정 버튼
        addBtn?.addEventListener('click', async (e) => {
            e.preventDefault();
            const name = nameInput.value.trim();
            const path = pathInput.value.trim();
            const command = commandInput.value.trim();
            const args = argsInput.value.trim();
            
            if (!name || !path || !command) {
                new Notice("서버 이름, 경로, 실행 명령어를 모두 입력해주세요.");
                return;
            }
            
            if (!path.endsWith('.js') && !path.endsWith('.py')) {
                new Notice("서버 경로는 .js 또는 .py 파일이어야 합니다.");
                return;
            }
            
            const existingServers = this.plugin.settings.mcpServers || [];
            
            // 편집 모드가 아닌 경우나, 편집 모드에서 이름이 변경된 경우에만 중복 체크
            if (!isEditing || (isEditing && existingServer?.name !== name)) {
                if (existingServers.some((server: any) => server.name === name)) {
                    new Notice("같은 이름의 서버가 이미 존재합니다.");
                    return;
                }
            }
            
            const serverData = { name, path, command, args: args || undefined, enabled: true };
            
            if (isEditing) {
                // 편집 모드: 기존 서버 정보 업데이트
                this.plugin.settings.mcpServers[editIndex] = {
                    ...this.plugin.settings.mcpServers[editIndex],
                    ...serverData
                };
                await this.plugin.saveSettings();
                
                // MCP 서버 설정 변경 알림
                this.plugin.onMCPServersChanged();
                
                new Notice(`MCP 서버 "${name}"이 수정되었습니다.`);
            } else {
                // 추가 모드: 새 서버 추가
                this.plugin.settings.mcpServers.push(serverData);
                await this.plugin.saveSettings();
                
                // MCP 서버 설정 변경 알림
                this.plugin.onMCPServersChanged();
                
                new Notice(`MCP 서버 "${name}"이 추가되었습니다.`);
            }
            
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
