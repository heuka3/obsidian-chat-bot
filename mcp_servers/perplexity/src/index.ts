import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Get API key from process arguments
function getApiKeyFromArgs() {
  const argPrefix = '--perplexity-api-key=';
  const arg = process.argv.find(a => a.startsWith(argPrefix));
  if (!arg) {
    throw new Error("PERPLEXITY_API_KEY must be provided as --perplexity-api-key=YOUR_KEY");
  }
  return arg.slice(argPrefix.length);
}

const PERPLEXITY_API_KEY = getApiKeyFromArgs();

// Create the MCP server instance
const server = new McpServer({
  name: "Perplexity AI Server",
  version: "1.0.0"
});

// Perplexity API 호출 함수 분리
async function callPerplexityAPI({ 
  model, 
  user_message, 
  system_message, 
  search_mode, 
  search_domain_filter, 
  return_related_questions, 
  search_after_date_filter
}: {
  model: string,
  user_message: string,
  system_message?: string,
  search_mode?: string,
  search_domain_filter?: string[],
  return_related_questions?: boolean,
  search_after_date_filter?: string
}) {
  try {
    // Build the messages array
    const messages = [];
    if (system_message) {
      messages.push({ role: "system", content: system_message });
    } else {
      messages.push({ role: "system", content: "Be precise and concise." });
    }
    messages.push({ role: "user", content: user_message });

    // Build the request body
    const requestBody: any = {
      model,
      messages
    };
    if (search_mode) {
      requestBody.search_mode = search_mode;
    }
    if (search_domain_filter && search_domain_filter.length > 0) {
      requestBody.search_domain_filter = search_domain_filter;
    }
    if (return_related_questions !== undefined) {
      requestBody.return_related_questions = return_related_questions;
    }
    if (search_after_date_filter) {
      requestBody.search_after_date_filter = search_after_date_filter;
    }

    // Make the API call
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || "No answer received";
    const searchResults = data.search_results?.map((result: any) => ({
      title: result.title,
      url: result.url
    })) || [];
    let outputText = `**Answer:**\n${answer}\n\n`;
    if (searchResults.length > 0) {
      outputText += `**Sources:**\n`;
      searchResults.forEach((result: any, index: number) => {
        outputText += `${index + 1}. [${result.title}](${result.url})\n`;
      });
    }
    return outputText;
  } catch (error) {
    return `Error querying Perplexity AI: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// Define the Perplexity search tool (함수 호출로 분리)
server.tool(
  'search',
  'Search and get answers using Perplexity AI with various filtering options',
  {
    // Original expensive models commented out to save API costs
    // model: z.enum(['sonar', 'sonar-pro', 'sonar-reasoning', 'sonar-reasoning-pro', 'sonar-deep-research'])
    //   .default('sonar')
    //   .describe("The Perplexity model to use: 'sonar' (lightweight, cost-effective for quick answers), 'sonar-pro' (advanced with deeper understanding and 2x more citations), 'sonar-reasoning' (Chain-of-Thought reasoning for structured analysis), 'sonar-reasoning-pro' (high-performance with multi-step CoT reasoning), 'sonar-deep-research' (exhaustive research across hundreds of sources with expert-level insights)"),
    model: z.enum(['sonar', 'sonar-reasoning', 'sonar-reasoning-pro'])
      .default('sonar')
      .describe("The Perplexity model to use: 'sonar' (lightweight, cost-effective for quick answers), 'sonar-reasoning' (Chain-of-Thought reasoning for structured analysis), 'sonar-reasoning-pro' (high-performance with multi-step CoT reasoning)"),
    user_message: z.string().describe("The user's question or query"),
    system_message: z.string().optional().describe("System message to guide the AI's behavior"),
    search_mode: z.enum(['academic', 'web']).optional().describe("Search mode - academic or web"),
    search_domain_filter: z.array(z.string()).optional().describe("Array of domains to filter search results"),
    return_related_questions: z.boolean().default(false).describe("Whether to return related questions"),
    search_after_date_filter: z.string().optional().describe("Date filter (%m/%d/%Y format, e.g. 3/1/2025) to search for content after this date")
  },
  async (params) => {
    const outputText = await callPerplexityAPI(params);
    return {
      content: [
        {
          type: "text",
          text: outputText
        }
      ]
    }
  }
);

// Set up communication over stdio
const transport = new StdioServerTransport();
server.connect(transport);