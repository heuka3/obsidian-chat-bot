import { Plugin, WorkspaceLeaf } from 'obsidian';
import { ChatbotView, VIEW_TYPE_CHATBOT } from './chatbot-view';
import { ChatbotSettingTab, DEFAULT_SETTINGS, ChatbotPluginSettings } from './settings';

export default class ChatbotPlugin extends Plugin {
  settings: ChatbotPluginSettings;

  async onload() {
    console.log('loading plugin: chatbot-plugin')

    await this.loadSettings();
    this.addSettingTab(new ChatbotSettingTab(this.app, this));

    this.registerView(
      VIEW_TYPE_CHATBOT,
      (leaf: WorkspaceLeaf) => new ChatbotView(leaf, this)
    );

    this.addRibbonIcon('message-circle', 'Open AI Chatbot', () => {
      console.log('Activated chatbot view!');
      this.activateView();
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // API 키 변경 시 호출되는 메서드
  onApiKeyChanged(apiKey: string, provider: 'openai' | 'gemini') {
    console.log(`${provider} API key changed in plugin:`, apiKey ? 'Key set' : 'Key cleared');
    
    // 현재 열린 모든 ChatbotView 인스턴스에 API 키 업데이트
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHATBOT);
    leaves.forEach(leaf => {
      const view = leaf.view as ChatbotView;
      if (view && view.updateApiKey) {
        view.updateApiKey(apiKey, provider);
      }
    });
  }

  // AI 제공자 변경 시 호출되는 메서드
  onProviderChanged(provider: 'openai' | 'gemini') {
    console.log('AI provider changed to:', provider);
    
    // 현재 열린 모든 ChatbotView 인스턴스에 제공자 변경 알림
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHATBOT);
    leaves.forEach(leaf => {
      const view = leaf.view as ChatbotView;
      if (view && view.updateProvider) {
        view.updateProvider(provider);
      }
    });
  }

  // 모델 변경 시 호출되는 메서드
  onModelChanged(model: string) {
    console.log('AI model changed to:', model);
    
    // 현재 열린 모든 ChatbotView 인스턴스에 모델 변경 알림 (대화 내역 초기화)
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHATBOT);
    leaves.forEach(leaf => {
      const view = leaf.view as ChatbotView;
      if (view && view.onModelChanged) {
        view.onModelChanged(model);
      }
    });
  }

  // MCP 서버 변경 시 호출되는 메서드
  onMCPServersChanged() {
    console.log('MCP servers changed');
    
    // 현재 열린 모든 ChatbotView 인스턴스에 MCP 서버 변경 알림
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHATBOT);
    leaves.forEach(leaf => {
      const view = leaf.view as ChatbotView;
      if (view && view.updateMCPServers) {
        view.updateMCPServers();
      }
    });
  }

  async onunload() {
    console.log('unloading plugin: chatbot-plugin')
  }

  async activateView() {
    const {workspace} = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_CHATBOT);
    if (leaves.length>0) {
      leaf = leaves[0];
      console.log('Found existing chatbot leaf:', leaf);
      console.log('Number of chatbot leaves:', leaves.length);
    } else{
      leaf = workspace.getRightLeaf(false); 
      // 워크스페이스의 오른쪽에 새 leaf를 생성, false는 강제로 새 leaf를 생성하지 말고 기존의 빈 leaf를 사용하도록 함
      await leaf!.setViewState({ type: VIEW_TYPE_CHATBOT, active: true });
    }
    workspace.revealLeaf(leaf!);
  }
}

