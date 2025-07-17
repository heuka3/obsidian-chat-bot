# Obsidian AI Chatbot Plugin - Advanced Agentic Workflow Documentation

## Overview

This enhanced version of the Obsidian AI Cha### Performance Optimization

#### Execution Efficiency

- **Sequential Processing**: Steps executed in logical order
- **Context Preservation**: Previous results maintained for reference
- **Smart Skipping**: Unnecessary steps can be skipped dynamically
- **Timeout Management**: Prevents hanging on slow toolsgin introduces advanced agentic multi-tool planning and execution capabilities. The plugin now supports intelligent planning, sequential tool execution, and comprehensive note context integration.

## Key Features

### 1. **Plan & Execute Mode** 🧠
- **Intelligent Planning**: AI creates a detailed execution plan before taking action
- **Multi-Step Execution**: Sequential tool calling with context preservation
- **Dynamic Decision Making**: Each tool call considers previous results
- **Fallback Strategies**: Built-in error handling and alternative approaches

### 2. **Note Mention System** @
- **Real-time Note Suggestions**: Type `@` to see recent notes
- **Context Integration**: Mentioned notes provide both name and path to AI
- **Keyboard Navigation**: Arrow keys and Enter for quick selection
- **Smart Filtering**: Notes filtered by typing after `@`

### 3. **Enhanced Tool Management**
- **MCP Server Integration**: Support for Model Context Protocol servers
- **Google Search Integration**: Real-time web search capabilities
- **Intelligent Tool Selection**: AI-driven tool selection based on context
- **Robust Name Mapping**: Handles tool name conflicts and conversions

## Architecture

### Core Components

1. **GeminiService**: Main AI service with dual-mode support
2. **PlanToolSelectService**: Generates execution plans using structured output
3. **PlanExecutionService**: Executes plans step-by-step with context preservation
4. **GoogleSearchService**: Handles web search functionality
5. **ChatbotView**: Enhanced UI with mode toggles and note mentions

### Workflow Comparison

#### Legacy Mode (Traditional)
```
User Query → Direct Tool Call → Single Response
```

#### Plan & Execute Mode (Agentic)
```
User Query → Plan Generation → Tool Selection → Sequential Execution → Context Accumulation → Final Response
```

## Usage Guide

### Activating Plan & Execute Mode

1. **Switch to Gemini**: Plan & Execute mode requires Gemini provider
2. **Click Brain Icon** 🧠: Toggle button in the chat interface
3. **Active State**: Button turns blue when Plan & Execute is enabled
4. **Automatic Planning**: AI will now create execution plans for complex queries

### Using Note Mentions

1. **Type @**: Start typing `@` in any message
2. **Browse Notes**: Use arrow keys or mouse to navigate suggestions
3. **Select Note**: Press Enter or click to select a note
4. **Context Passed**: Note name and path are provided to AI for context

### Tool Selection Process

The AI intelligently selects tools based on:
- **Tool Names**: Analyzes tool names for relevance
- **Descriptions**: Reviews tool descriptions for appropriateness
- **Parameters**: Considers required and optional parameters
- **Context**: Uses conversation context to determine best tools

## Technical Implementation

### Structured Output Schema

The plugin uses Gemini's structured output capabilities with predefined JSON schemas:

```typescript
interface ExecutionPlan {
    overallGoal: string;
    plan: string; // 사용자 답변에 어떤 tool의 어떤 결과를 이용할지에 대한 계획
    steps: PlanStep[];
    finalResponseGuidance: string;
}

interface PlanStep {
    stepNumber: number;
    toolName: string;
    purpose: string;
    reasoning: string;
    expectedOutput: string;
}
```

### Tool Call Decision Process

For each step in the plan, the system:

1. **Analyzes Context**: Reviews previous step results
2. **Determines Parameters**: Uses structured output to decide tool parameters
3. **Executes Tool**: Calls the appropriate tool with determined parameters
4. **Processes Results**: Stores results for next step context
5. **Error Handling**: Manages failures and continues execution

### Google Search Integration

The GoogleSearchService provides:
- Real-time web search capabilities
- Structured result formatting
- Error handling with fallback responses
- Integration with the planning system

## Configuration

### Configuration

- **API Keys**: Gemini API key required for all features
- **MCP Servers**: Configure Model Context Protocol servers
- **Default Mode**: Choose between Legacy and Plan & Execute
- **Search Results**: Configure number of search results (1-10)

### MCP Server Setup

1. **Install MCP Server**: Follow MCP server installation guide
2. **Configure Path**: Set correct server executable path
3. **Set Arguments**: Configure any required server arguments
4. **Test Connection**: Verify server connectivity in settings

## Performance Optimization

### Execution Efficiency

- **Parallel Processing**: Steps without dependencies can run in parallel
- **Context Caching**: Previous results cached for reference
- **Smart Skipping**: Unnecessary steps can be skipped dynamically
- **Timeout Management**: Prevents hanging on slow tools

### Memory Management

- **Result Pruning**: Old results removed after final response
- **Context Compression**: Large outputs summarized for next steps
- **Connection Pooling**: Reuse MCP server connections

## Advanced Features

### Dependency Management

Steps are executed in sequential order based on their step numbers, with each step having access to all previous results for context.

### Error Recovery

The system includes multiple error recovery mechanisms:

1. **Step-level Recovery**: Individual step failures don't stop execution
2. **Graceful Degradation**: Partial results when some tools fail
3. **User Notification**: Clear error messages and suggestions

### Execution Monitoring

- **Real-time Logging**: Detailed execution logs in console
- **Performance Metrics**: Execution time tracking
- **Success Rate**: Step success/failure statistics
- **Resource Usage**: Memory and processing monitoring

## Best Practices

### Writing Effective Queries

1. **Be Specific**: Clear queries lead to better plans
2. **Provide Context**: Use note mentions for relevant context
3. **Sequential Requests**: Break complex tasks into steps
4. **Verify Results**: Review AI responses for accuracy

### Tool Development

1. **Clear Descriptions**: Provide detailed tool descriptions
2. **Proper Schemas**: Use well-defined parameter schemas
3. **Error Handling**: Implement robust error responses
4. **Performance**: Optimize tool execution speed

## Troubleshooting

### Common Issues

1. **Plan Generation Fails**: Check API key and model availability
2. **Tool Not Found**: Verify MCP server connection and tool names
3. **Execution Timeout**: Increase timeout settings or optimize tools
4. **Memory Issues**: Clear chat history and restart plugin

### Debug Mode

Enable debug logging by:
1. Opening Developer Console (Ctrl+Shift+I)
2. Monitoring detailed execution logs
3. Checking error messages and stack traces
4. Verifying API responses and tool calls

## Future Enhancements

### Planned Features

- **Visual Plan Display**: Show execution plan in UI
- **Manual Plan Editing**: Allow users to modify plans
- **Tool Marketplace**: Easy tool discovery and installation
- **Performance Analytics**: Detailed execution statistics
- **Custom Workflows**: Save and reuse common plans

### Contributing

The plugin is open for contributions:
- Tool integrations
- UI improvements
- Performance optimizations
- Bug fixes and testing

## API Reference

### GeminiService Methods

```typescript
// Set Plan & Execute mode
setPlanExecuteMode(enabled: boolean): void

// Check current mode
isPlanExecuteMode(): boolean

// Call MCP tool directly
callMCPTool(toolName: string, args: any): Promise<any>

// Update available tools
updateMCPServers(servers: MCPServer[]): Promise<void>
```

### PlanToolSelectService Methods

```typescript
// Create execution plan
createExecutionPlan(query: string, context: string): Promise<ExecutionPlan>

// Update available tools
updateAvailableTools(tools: GeminiTool[], mapping: Map<string, any>): void

// Get tool information
getToolInfo(toolName: string): ToolInfo | undefined
```

### PlanExecutionService Methods

```typescript
// Execute plan
executePlan(query: string, plan: ExecutionPlan, context: string): Promise<string>
```

This documentation provides a comprehensive guide to the enhanced agentic capabilities of the Obsidian AI Chatbot plugin. The system now supports intelligent planning, multi-tool execution, and sophisticated context management for more powerful AI assistance.
