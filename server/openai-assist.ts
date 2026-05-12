type OpenAiAssistClient = {
  responses: {
    create: (request: {
      model: string;
      input: Array<{ role: "system" | "user"; content: string }>;
      max_output_tokens: number;
    }) => Promise<unknown>;
  };
};

type OpenAiAssistRequest = {
  model: string;
  systemPrompt: string;
  message: string;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractTextFromContent(content: unknown): string[] {
  if (!Array.isArray(content)) return [];

  return content.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const candidate = part as {
      text?: unknown;
      type?: unknown;
    };

    if (typeof candidate.text === "string") {
      return cleanText(candidate.text) ? [candidate.text.trim()] : [];
    }

    if (candidate.text && typeof candidate.text === "object") {
      const nested = candidate.text as { value?: unknown };
      const value = cleanText(nested.value);
      return value ? [value] : [];
    }

    return [];
  });
}

export function extractOpenAiAssistantReply(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const candidate = response as {
    output_text?: unknown;
    output?: unknown;
    choices?: unknown;
  };

  const directText = cleanText(candidate.output_text);
  if (directText) return directText;

  if (Array.isArray(candidate.output)) {
    const outputText = candidate.output
      .flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        return extractTextFromContent((item as { content?: unknown }).content);
      })
      .join("\n")
      .trim();
    if (outputText) return outputText;
  }

  if (Array.isArray(candidate.choices)) {
    const choiceText = candidate.choices
      .flatMap((choice) => {
        if (!choice || typeof choice !== "object") return [];
        const message = (choice as { message?: { content?: unknown } }).message;
        if (typeof message?.content === "string") {
          const value = cleanText(message.content);
          return value ? [value] : [];
        }
        return extractTextFromContent(message?.content);
      })
      .join("\n")
      .trim();
    if (choiceText) return choiceText;
  }

  return null;
}

export async function createOpenAiAssistantReply(
  openai: OpenAiAssistClient,
  request: OpenAiAssistRequest,
): Promise<string | null> {
  const response = await openai.responses.create({
    model: request.model,
    input: [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.message },
    ],
    max_output_tokens: 350,
  });

  return extractOpenAiAssistantReply(response);
}
