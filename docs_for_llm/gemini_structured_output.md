# Using Structured Output with Gemini API in JavaScript/TypeScript

This document explains how to use the Google Gemini API to generate structured output (such as JSON or enum values) using JavaScript or TypeScript. Code samples and best practices are included.

---

## 1. Prerequisites

- Node.js 18 or higher is recommended.
- Install the Google GenAI SDK:

```bash
npm install @google/genai
```

---

## 2. Generating Structured JSON Output

### 2.1. Define a Schema in the Model (Recommended)

The following example shows how to receive a list of cookie recipes as JSON.

```typescript
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({});

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "List a few popular cookie recipes, and include the amounts of ingredients.",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            recipeName: { type: Type.STRING },
            ingredients: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          propertyOrdering: ["recipeName", "ingredients"],
        },
      },
    },
  });

  console.log(response.text); // JSON string
}

main();
```

**Key Points:**
- Set `responseMimeType` to `"application/json"`.
- Define your desired JSON structure in `responseSchema`.
- Use `propertyOrdering` to specify the order of fields (this should match your examples).

---

### 2.2. Provide a Schema in the Prompt (Not Recommended)

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

async function main() {
  const prompt = `
List a few popular cookie recipes, and include the amounts of ingredients.

Produce JSON matching this specification:

Recipe = { "recipeName": string, "ingredients": array<string> }
Return: array<Recipe>
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  console.log(response.text);
}

main();
```

> ⚠️ This method does not guarantee that the model will return JSON, so the output may be inconsistent or less accurate.

---

## 3. Generating Enum Values

You can constrain the model to select only one value from a specific set of options.

```typescript
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({});

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "What type of instrument is an oboe?",
    config: {
      responseMimeType: "text/x.enum",
      responseSchema: {
        type: Type.STRING,
        enum: ["Percussion", "String", "Woodwind", "Brass", "Keyboard"],
      },
    },
  });

  console.log(response.text); // Example: "Woodwind"
}

main();
```

---

## 4. Complex Schema Example

You can use enums within more complex JSON objects.

```typescript
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({});

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "List 10 home-baked cookie recipes and give them grades based on tastiness.",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            recipeName: { type: Type.STRING },
            rating: {
              type: Type.STRING,
              enum: ["a+", "a", "b", "c", "d", "f"],
            },
          },
          propertyOrdering: ["recipeName", "rating"],
        },
      },
    },
  });

  console.log(response.text);
}

main();
```

---

## 5. Tips & Best Practices

- The size of your response schema counts toward your input token limit.
- Always set `propertyOrdering` and make sure your examples match this order.
- Very complex schemas (many fields, deep nesting, large enums, etc.) can cause a 400 error.
- By default, fields are optional. Mark them as required if needed.
- If you do not get the results you expect, adjust both your prompt and your schema.

---

## 6. References

- [Official Gemini API Structured Output Documentation](https://ai.google.dev/gemini-api/docs/structured-output)
- [@google/genai SDK on npm](https://www.npmjs.com/package/@google/genai)

---

This guide provides practical examples and explanations for using Gemini API's structured output features in JavaScript/TypeScript projects.