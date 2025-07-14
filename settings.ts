import { PluginSettingTab, App, Setting, Notice } from "obsidian";
import { ChatbotPluginSettings } from "./types";

export const DEFAULT_SETTINGS: ChatbotPluginSettings = {
    aiProvider: "openai",
    openaiApiKey: "",
    geminiApiKey: "",
    model: "gpt-4o",
    maxTokens: 1000,
    chatHistoryFolder: "ChatHistory"
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
            .setDesc("사용할 AI 서비스를 선택하세요.")
            .addDropdown(dropdown => {
                dropdown
                    .addOption("openai", "OpenAI")
                    .addOption("gemini", "Google Gemini")
                    .setValue(this.plugin.settings.aiProvider || "openai")
                    .onChange(async (value: 'openai' | 'gemini') => {
                        this.plugin.settings.aiProvider = value;
                        await this.plugin.saveSettings();
                        
                        // 제공자 변경 시 플러그인에 알림
                        if (this.plugin.onProviderChanged) {
                            this.plugin.onProviderChanged(value);
                        }
                        
                        // 설정 UI 새로고침
                        this.display();
                    });
            });

        // OpenAI API Key 설정 (OpenAI 선택 시에만 표시)
        if (this.plugin.settings.aiProvider === 'openai') {
            new Setting(containerEl)
                .setName("OpenAI API Key")
                .setDesc("OpenAI API 키를 입력하세요.")
                .addText(text => {
                    text
                        .setPlaceholder("sk-...")
                        .setValue(this.plugin.settings.openaiApiKey || "")
                        .onChange(async (value) => {
                            const trimmedValue = value.trim();
                            this.plugin.settings.openaiApiKey = trimmedValue;
                            await this.plugin.saveSettings();
                            
                            // 플러그인에 API 키 변경 알림
                            if (this.plugin.onApiKeyChanged) {
                                this.plugin.onApiKeyChanged(trimmedValue, 'openai');
                            }
                            
                            if (trimmedValue) {
                                new Notice("OpenAI API 키가 저장되었습니다.");
                            }
                        });
                });
        }

        // Gemini API Key 설정 (Gemini 선택 시에만 표시)
        if (this.plugin.settings.aiProvider === 'gemini') {
            new Setting(containerEl)
                .setName("Gemini API Key")
                .setDesc("Google Gemini API 키를 입력하세요.")
                .addText(text => {
                    text
                        .setPlaceholder("AIza...")
                        .setValue(this.plugin.settings.geminiApiKey || "")
                        .onChange(async (value) => {
                            const trimmedValue = value.trim();
                            this.plugin.settings.geminiApiKey = trimmedValue;
                            await this.plugin.saveSettings();
                            
                            // 플러그인에 API 키 변경 알림
                            if (this.plugin.onApiKeyChanged) {
                                this.plugin.onApiKeyChanged(trimmedValue, 'gemini');
                            }
                            
                            if (trimmedValue) {
                                new Notice("Gemini API 키가 저장되었습니다.");
                            }
                        });
                });
        }

        // 모델 설정
        new Setting(containerEl)
            .setName("AI 모델")
            .setDesc("사용할 AI 모델을 선택하세요.")
            .addDropdown(dropdown => {
                // 선택된 제공자에 따라 모델 옵션 변경
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
                    .setValue(this.plugin.settings.model || (this.plugin.settings.aiProvider === 'openai' ? "gpt-4o" : "gemini-1.5-pro"))
                    .onChange(async (value) => {
                        this.plugin.settings.model = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 최대 토큰 설정
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

        // 대화 내역 저장 폴더 설정
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
    }
}
