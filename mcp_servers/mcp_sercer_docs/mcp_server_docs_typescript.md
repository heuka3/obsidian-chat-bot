# Quickstart: Building an MCP Server with TypeScript

This guide explains how to create a basic Model Context Protocol (MCP) server using TypeScript. You will learn how to set up your environment, write the server code, define tools, and run your MCP server locally.

---

## 1. Prerequisites

- Node.js (v16 or higher)
- npm (comes with Node.js)
- Basic TypeScript knowledge

---

## 2. Project Setup

Create a new directory and initialize your project:

```bash
mkdir mcp-weather-server
cd mcp-weather-server
npm init -y
```

---

## 3. Install Dependencies

Install the MCP SDK and Zod for schema validation:

```bash
npm install @modelcontextprotocol/sdk zod
```

If you want TypeScript type support, install the following as development dependencies:

```bash
npm install -D typescript @types/node
```

---

## 4. Configure TypeScript

Create a `tsconfig.json` file:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

---

## 5. Create the Server Code

Create a directory and your main TypeScript file:

```bash
mkdir src
touch src/index.ts
```

Open `src/index.ts` and add the following code:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create the MCP server instance
const server = new McpServer({
  name: "Weather Server",
  version: "1.0.0"
});

// Define a tool that returns the weather for a city (static example)
server.tool(
  'get-weather',
  'Tool to get the weather of a city',
  {
    city: z.string().describe("The name of the city to get the weather for")
  },
  async ({ city }) => {
    // For now, return a static response
    return {
      content: [
        {
          type: "text",
          text: `The weather in ${city} is sunny`
        }
      ]
    };
  }
);

// Set up communication over stdio
const transport = new StdioServerTransport();
server.connect(transport);
```

---

## 6. Build the Project

Add a build script to your `package.json`:

```json
"scripts": {
  "build": "tsc"
}
```

Then build your project:

```bash
npm run build
```

---

## 7. Run the MCP Server

After building, start your server using Node.js:

```bash
node build/index.js
```

Your MCP server is now running and ready to accept requests from any compatible MCP client or tool.

---

## Notes

- The example above returns a static weather message. You can expand the logic to call real weather APIs or add more tools using the same pattern.
- The server communicates over standard input/output (stdio), which is suitable for local development and integration with various MCP hosts.