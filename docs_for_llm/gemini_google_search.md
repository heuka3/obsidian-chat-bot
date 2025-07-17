# Using Google Search Grounding with Gemini API in JavaScript/TypeScript

This guide explains how to use Google Search grounding with the Gemini API in JavaScript or TypeScript. Grounding with Google Search allows your application to access real-time web information, increasing the factual accuracy of answers and providing verifiable citations.

## 1. Install and Import the Google GenAI SDK

First, install the SDK:

```
npm install @google/genai
```

Then import it in your project:

```javascript
import { GoogleGenAI } from "@google/genai";
```

## 2. Configure the Client

Create a new instance of the client:

```javascript
const ai = new GoogleGenAI({});
```

## 3. Define the Google Search Grounding Tool

Set up the grounding tool in your configuration:

```javascript
const groundingTool = {
  googleSearch: {},
};

const config = {
  tools: [groundingTool],
};
```

## 4. Make a Request with Google Search Grounding

Send a prompt to the Gemini API with the `googleSearch` tool enabled:

```javascript
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash", // Or another supported model
  contents: "Who won the euro 2024?",
  config,
});
console.log(response.text);
```

The model will automatically decide whether to use Google Search to improve the answer. If it does, the response will be based on real-time web data.

## 5. Handling Inline Citations

The response contains metadata that allows you to link statements to their sources. You can process this data to display inline, clickable citations.

Example function to add citations:

```javascript
function addCitations(response) {
    let text = response.text;
    const supports = response.candidates[0]?.groundingMetadata?.groundingSupports;
    const chunks = response.candidates[0]?.groundingMetadata?.groundingChunks;

    // Sort supports by endIndex in descending order to avoid shifting issues.
    const sortedSupports = [...supports].sort(
        (a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0),
    );

    for (const support of sortedSupports) {
        const endIndex = support.segment?.endIndex;
        if (endIndex === undefined || !support.groundingChunkIndices?.length) {
            continue;
        }

        const citationLinks = support.groundingChunkIndices
            .map(i => {
                const uri = chunks[i]?.web?.uri;
                if (uri) {
                    return `[${i + 1}](${uri})`;
                }
                return null;
            })
            .filter(Boolean);

        if (citationLinks.length > 0) {
            const citationString = citationLinks.join(", ");
            text = text.slice(0, endIndex) + citationString + text.slice(endIndex);
        }
    }

    return text;
}

const textWithCitations = addCitations(response);
console.log(textWithCitations);
```

## 6. Supported Models

Google Search grounding is available for the following models:
- Gemini 2.5 Pro
- Gemini 2.5 Flash
- Gemini 2.0 Flash
- Gemini 1.5 Pro
- Gemini 1.5 Flash

**Note:** For Gemini 1.5 models, a legacy tool called `googleSearchRetrieval` is used. For all new development, use the `googleSearch` tool as shown above.

## 7. Pricing

You are billed per API request that includes the Google Search tool, regardless of how many search queries the model performs in that request.

For more information, see the [Gemini API pricing page](https://ai.google.dev/gemini-api/pricing).

---

This guide helps you get started with Google Search grounding in JavaScript/TypeScript, so your applications can provide more accurate and trustworthy answers.