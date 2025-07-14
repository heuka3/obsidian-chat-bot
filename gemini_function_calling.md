# Gemini API Function Calling Guide 

This document explains how to use Gemini API’s function calling, focusing on JavaScript/TypeScript usage. It covers the concepts, setup, workflow, advanced features, best practices, and example code.

---

## 1. What is Function Calling?

Function calling lets Gemini models interact with external APIs or tools. Instead of just generating text, the model can decide to call a declared function and provide the needed arguments. Your app runs the function and sends the result back to Gemini, which then produces a final, user-friendly response.

**Main use cases:**
- **Augment Knowledge:** Fetch data from APIs, databases, etc.
- **Extend Capabilities:** Use external tools for calculations, charts, etc.
- **Take Actions:** Interact with APIs (e.g., scheduling, device control).

---

## 2. How Function Calling Works

**General flow:**
1. **Define function declarations** (name, description, parameters) in your code.
2. **Send user prompt and function declarations** to Gemini.
3. **Gemini decides** whether to call a function or reply in text.
4. **If function call is returned,** your app runs the function using the provided arguments.
5. **Send the result back** (with conversation history) to Gemini for a final response.

**Important:** Gemini is stateless. You must send the full conversation history with every request.

---

## 3. Step-by-Step Example (JavaScript/TypeScript)

```javascript
import { GoogleGenAI, Type } from '@google/genai';

// Step 1: Define the function declaration
const scheduleMeetingFunctionDeclaration = {
  name: 'schedule_meeting',
  description: 'Schedules a meeting with specified attendees at a given time and date.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      attendees: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'List of people attending the meeting.' },
      date: { type: Type.STRING, description: 'Date of the meeting (e.g., "2024-07-29")' },
      time: { type: Type.STRING, description: 'Time of the meeting (e.g., "15:00")' },
      topic: { type: Type.STRING, description: 'The subject or topic of the meeting.' },
    },
    required: ['attendees', 'date', 'time', 'topic'],
  },
};

// Step 2: Configure the client
const ai = new GoogleGenAI({});

// Step 3: Send the prompt with function declarations
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'Schedule a meeting with Bob and Alice for 03/27/2025 at 10:00 AM about the Q3 planning.',
  config: {
    tools: [{
      functionDeclarations: [scheduleMeetingFunctionDeclaration]
    }],
  },
});

// Step 4: Check for function call in the response
if (response.functionCalls && response.functionCalls.length > 0) {
  const functionCall = response.functionCalls[0];
  console.log(`Function to call: ${functionCall.name}`);
  console.log(`Arguments: ${JSON.stringify(functionCall.args)}`);
  // Execute the function here, then send the result back to Gemini for the final response
} else {
  console.log("No function call found in the response.");
  console.log(response.text);
}
```

---

## 4. Function Declaration Schema

A function declaration uses a subset of the OpenAPI schema:

- `name`: Unique function name (no spaces or special characters)
- `description`: Explains what the function does
- `parameters`: Object with each parameter’s type, description, and (optionally) enum for fixed values
- `required`: List of required parameters

Example:

```javascript
const setLightValuesFunctionDeclaration = {
  name: 'set_light_values',
  description: 'Sets the brightness and color temperature of a light.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      brightness: { type: Type.NUMBER, description: 'Light level from 0 to 100. Zero is off and 100 is full brightness' },
      color_temp: { type: Type.STRING, enum: ['daylight', 'cool', 'warm'], description: 'Color temperature of the light fixture.' },
    },
    required: ['brightness', 'color_temp'],
  },
};
```

---

## 5. Advanced Features

### Function Calling with "Thinking" (Thought Signatures)

- Enabling "thinking" lets Gemini reason before suggesting function calls.
- Gemini returns a `thoughtSignature` with its function call or text.
- Return this signature to Gemini with the function result so it can maintain context in multi-turn conversations.

### Parallel Function Calling

- Gemini can call multiple independent functions in one turn.
- Example: turning on a disco ball, starting music, and dimming lights at once.
- Declare all functions and set the function calling mode to allow parallel calls.
- Return the results in the same order as requested.

Example declarations:

```javascript
const powerDiscoBall = {
  name: 'power_disco_ball',
  description: 'Powers the spinning disco ball.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      power: { type: Type.BOOLEAN, description: 'Whether to turn the disco ball on or off.' }
    },
    required: ['power']
  }
};

const startMusic = {
  name: 'start_music',
  description: 'Play some music matching the specified parameters.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      energetic: { type: Type.BOOLEAN, description: 'Whether the music is energetic or not.' },
      loud: { type: Type.BOOLEAN, description: 'Whether the music is loud or not.' }
    },
    required: ['energetic', 'loud']
  }
};

const dimLights = {
  name: 'dim_lights',
  description: 'Dim the lights.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      brightness: { type: Type.NUMBER, description: 'The brightness of the lights, 0.0 is off, 1.0 is full.' }
    },
    required: ['brightness']
  }
};
```

Set up the config to allow parallel calls:

```javascript
const config = {
  tools: [{
    functionDeclarations: [powerDiscoBall, startMusic, dimLights]
  }],
  toolConfig: {
    functionCallingConfig: {
      mode: 'any'
    }
  }
};
```

---

### Compositional (Sequential) Function Calling

- Gemini can chain function calls, using the result of one as input to the next.
- Example: get location → get weather → set thermostat.
- Implemented as a loop: after each function call, run the function, send its result back, and repeat until Gemini returns a text response.

Example loop:

```javascript
const toolFunctions = {
  get_weather_forecast,
  set_thermostat_temperature,
};

const tools = [
  {
    functionDeclarations: [
      // ...your function declarations here
    ],
  },
];

let contents = [
  {
    role: "user",
    parts: [
      { text: "If it's warmer than 20°C in London, set the thermostat to 20°C, otherwise set it to 18°C." }
    ],
  },
];

while (true) {
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: { tools },
  });

  if (result.functionCalls && result.functionCalls.length > 0) {
    const functionCall = result.functionCalls[0];
    if (!toolFunctions[functionCall.name]) {
      throw new Error(`Unknown function call: ${functionCall.name}`);
    }
    // Run the function and get the response
    const toolResponse = toolFunctions[functionCall.name](functionCall.args);

    const functionResponsePart = {
      name: functionCall.name,
      response: { result: toolResponse }
    };

    // Add to the conversation history
    contents.push({ role: "model", parts: [{ functionCall: functionCall }] });
    contents.push({ role: "user", parts: [{ functionResponse: functionResponsePart }] });
  } else {
    console.log(result.text);
    break;
  }
}
```

---

## 6. Function Calling Modes

You can control Gemini’s function calling behavior:

- `AUTO` (default): Gemini decides whether to call a function or return text.
- `ANY`: Gemini must call one of the provided functions (no plain text responses).
- `NONE`: Gemini cannot call any functions.

Example:

```javascript
const toolConfig = {
  functionCallingConfig: {
    mode: 'any',
    allowedFunctionNames: ['get_current_temperature']
  }
};

const config = {
  tools: tools,
  toolConfig: toolConfig,
};
```

---

## 7. Multi-tool Use

- You can enable multiple tools (e.g., Google Search, code execution, function declarations) at the same time.
- This is currently a Live API feature.

Example:

```javascript
const tools = [
  { googleSearch: {} },
  { codeExecution: {} },
  { functionDeclarations: [turnOnTheLightsSchema, turnOffTheLightsSchema] }
];

// Usage example omitted for brevity
```

---

## 8. Supported Models

| Model                | Function Calling | Parallel | Compositional |
|----------------------|-----------------|----------|--------------|
| Gemini 2.5 Pro       | ✔               | ✔        | ✔            |
| Gemini 2.5 Flash     | ✔               | ✔        | ✔            |
| Gemini 2.5 Flash-Lite| ✔               | ✔        | ✔            |
| Gemini 2.0 Flash     | ✔               | ✔        | ✔            |
| Gemini 2.0 Flash-Lite| X               | X        | X            |

---

## 9. Best Practices

- Use clear, specific descriptions for functions and parameters.
- Use descriptive, unique function names.
- Strongly type parameters (use enums for fixed sets).
- Limit the number of active tools (ideally 10-20 at once).
- Provide context and instructions in prompts.
- Use low temperature for deterministic function calls.
- Validate important function calls with users.
- Implement robust error handling and security.
- Be aware of token limits (function schemas count toward input tokens).

---

## 10. Notes and Limitations

- Only a subset of OpenAPI schema is supported.
- Gemini is stateless: always send the full conversation history.
- For best results, always return any thought signatures if using "thinking" mode.
- Some features (like automatic function calling) are Python SDK only.

---

## 11. Example: Full Function Calling Flow

**User:** "Turn the lights down to a romantic level"  
**Gemini:** Returns function call: `set_light_values(brightness=25, color_temp='warm')`  
**App:** Executes the function, gets result, sends back to Gemini  
**Gemini:** Returns final response: "I've set the lights to a romantic setting."

---

For more details, refer to the official Gemini API documentation.