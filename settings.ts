import { PluginSettingTab, App, Setting, Notice } from "obsidian";
import { ChatbotPluginSettings } from "./types";

export const DEFAULT_SETTINGS: ChatbotPluginSettings = {
    openaiApiKey: "",
    model: "gpt-4.1",
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

        containerEl.createEl("h2", { text: "OpenAI Chatbot 설정" });

        // API Key 설정
        new Setting(containerEl)
            .setName("OpenAI API Key")
            .setDesc("OpenAI API 키를 입력하세요.")
            .addText(text => {
                text
                    .setPlaceholder("sk-...")
                    .setValue(this.plugin.settings.openaiApiKey || "")
                    .onChange(async (value) => {    
                        //value는 사용자가 입력한 텍스트, change 이벤트 발생 시 호출됨
                        const trimmedValue = value.trim();
                        this.plugin.settings.openaiApiKey = trimmedValue;
                        //console.log("11 API 키가 변경되었습니다:", trimmedValue);
                        await this.plugin.saveSettings();
                        
                        // 플러그인에 API 키 변경 알림
                        if (this.plugin.onApiKeyChanged) {
                            //console.log("22 API 키가 변경되었습니다:", trimmedValue);
                            this.plugin.onApiKeyChanged(trimmedValue);
                        }
                        
                        if (trimmedValue) {
                            new Notice("API 키가 저장되었습니다.");
                        }
                    });
            });

        // 모델 설정
        new Setting(containerEl)
            .setName("AI 모델")
            .setDesc("사용할 OpenAI 모델을 선택하세요.")
            .addDropdown(dropdown => {
                dropdown
                    .addOption("gpt-4.1", "GPT-4.1")
                    .addOption("gpt-4o", "GPT-4o")
                    .setValue(this.plugin.settings.model || "gpt-4.1")
                    .onChange(async (value) => {
                        this.plugin.settings.model = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 최대 토큰 설정
        new Setting(containerEl)
            .setName("최대 토큰 수")
            .setDesc("응답의 최대 길이를 설정합니다. (100-4000)")
            .addSlider(slider => {
                slider
                    .setLimits(100, 4000, 100)
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
