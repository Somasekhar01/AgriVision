function getOpenAIHeaders() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey === "your_openai_api_key") {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const parts = [];

  for (const item of data?.output ?? []) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;

    for (const content of item.content) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

export async function createTextResponse({ model, instructions, input, maxOutputTokens = 500 }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: getOpenAIHeaders(),
    body: JSON.stringify({
      model,
      instructions,
      input,
      max_output_tokens: maxOutputTokens,
    }),
  });

  if (!response.ok) {
    throw new Error(await getOpenAIErrorMessage(response));
  }

  const data = await response.json();
  return {
    id: data.id ?? null,
    model: data.model ?? model,
    text: extractOutputText(data),
    raw: data,
  };
}

export async function createJsonChatCompletion({ model, systemPrompt, messages }) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: getOpenAIHeaders(),
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await getOpenAIErrorMessage(response));
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI returned an empty response");
  }

  return {
    id: data.id ?? null,
    model: data.model ?? model,
    json: JSON.parse(content),
  };
}

async function getOpenAIErrorMessage(response) {
  const body = await response.text();

  if (response.status === 401) {
    return "OPENAI_API_KEY is invalid. Add a valid key in backend/.env and restart the backend.";
  }

  if (response.status === 429) {
    return "OpenAI request limit or quota reached. Check your OpenAI billing and usage limits.";
  }

  return `OpenAI request failed with status ${response.status}: ${body}`;
}
