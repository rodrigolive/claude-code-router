import {
  MessageCreateParamsBase,
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { get_encoding } from "tiktoken";
import { sessionUsageCache, Usage } from "./cache";
import { readFile } from 'fs/promises'
import { failoverManager } from "./failover";

const enc = get_encoding("cl100k_base");

/**
 * Get the appropriate model from router config, handling both strings and arrays
 * @param routerConfig Router configuration value (string or string[])
 * @param sessionId Session ID for failover tracking
 * @returns Selected model string
 */
const getModelFromConfig = (routerConfig: string | string[] | undefined, sessionId?: string): string => {
  if (!routerConfig) {
    throw new Error('No router configuration provided');
  }

  if (typeof routerConfig === 'string') {
    return routerConfig;
  }

  if (Array.isArray(routerConfig)) {
    if (routerConfig.length === 0) {
      throw new Error('Empty provider array');
    }
    return failoverManager.getNextProvider(routerConfig, sessionId);
  }

  throw new Error('Invalid router configuration type');
};

const calculateTokenCount = (
  messages: MessageParam[],
  system: any,
  tools: Tool[]
) => {
  let tokenCount = 0;
  if (Array.isArray(messages)) {
    messages.forEach((message) => {
      if (typeof message.content === "string") {
        tokenCount += enc.encode(message.content).length;
      } else if (Array.isArray(message.content)) {
        message.content.forEach((contentPart: any) => {
          if (contentPart.type === "text") {
            tokenCount += enc.encode(contentPart.text).length;
          } else if (contentPart.type === "tool_use") {
            tokenCount += enc.encode(JSON.stringify(contentPart.input)).length;
          } else if (contentPart.type === "tool_result") {
            tokenCount += enc.encode(
              typeof contentPart.content === "string"
                ? contentPart.content
                : JSON.stringify(contentPart.content)
            ).length;
          }
        });
      }
    });
  }
  if (typeof system === "string") {
    tokenCount += enc.encode(system).length;
  } else if (Array.isArray(system)) {
    system.forEach((item: any) => {
      if (item.type !== "text") return;
      if (typeof item.text === "string") {
        tokenCount += enc.encode(item.text).length;
      } else if (Array.isArray(item.text)) {
        item.text.forEach((textPart: any) => {
          tokenCount += enc.encode(textPart || "").length;
        });
      }
    });
  }
  if (tools) {
    tools.forEach((tool: Tool) => {
      if (tool.description) {
        tokenCount += enc.encode(tool.name + tool.description).length;
      }
      if (tool.input_schema) {
        tokenCount += enc.encode(JSON.stringify(tool.input_schema)).length;
      }
    });
  }
  return tokenCount;
};

const getUseModel = async (
  req: any,
  tokenCount: number,
  config: any,
  lastUsage?: Usage | undefined
) => {
  if (req.body.model.includes(",")) {
    const [provider, model] = req.body.model.split(",");
    const finalProvider = config.Providers.find(
        (p: any) => p.name.toLowerCase() === provider
    );
    const finalModel = finalProvider?.models?.find(
        (m: any) => m.toLowerCase() === model
    );
    if (finalProvider && finalModel) {
      return `${finalProvider.name},${finalModel}`;
    }
    return req.body.model;
  }

  // if tokenCount is greater than the configured threshold, use the long context model
  const longContextThreshold = config.Router.longContextThreshold || 60000;
  const lastUsageThreshold =
    lastUsage &&
    lastUsage.input_tokens > longContextThreshold &&
    tokenCount > 20000;
  const tokenCountThreshold = tokenCount > longContextThreshold;
  if (
    (lastUsageThreshold || tokenCountThreshold) &&
    config.Router.longContext
  ) {
        req.log.info(
      `Using long context model due to token count: ${tokenCount}, threshold: ${longContextThreshold}`
    );
    return getModelFromConfig(config.Router.longContext, req.sessionId);
  }
  if (
    req.body?.system?.length > 1 &&
    req.body?.system[1]?.text?.startsWith("<CCR-SUBAGENT-MODEL>")
  ) {
    const model = req.body?.system[1].text.match(
      /<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s
    );
    if (model) {
      req.body.system[1].text = req.body.system[1].text.replace(
        `<CCR-SUBAGENT-MODEL>${model[1]}</CCR-SUBAGENT-MODEL>`,
        ""
      );
      return model[1];
    }
  }
  // If the model is claude-3-5-haiku, use the background model
  if (
    req.body.model?.startsWith("claude-3-5-haiku") &&
    config.Router.background
  ) {
    req.log.info(`Using background model for ${req.body.model}`);
    return getModelFromConfig(config.Router.background, req.sessionId);
  }
  // if exits thinking, use the think model
  if (req.body.thinking && config.Router.think) {
    req.log.info(`Using think model for ${req.body.thinking}`);
    return getModelFromConfig(config.Router.think, req.sessionId);
  }
  if (
    Array.isArray(req.body.tools) &&
    req.body.tools.some((tool: any) => tool.type?.startsWith("web_search")) &&
    config.Router.webSearch
  ) {
    return getModelFromConfig(config.Router.webSearch, req.sessionId);
  }
  return getModelFromConfig(config.Router!.default, req.sessionId);
};

export const router = async (req: any, _res: any, context: any) => {
  const { config, event } = context;
  // Parse sessionId from metadata.user_id
  if (req.body.metadata?.user_id) {
    const parts = req.body.metadata.user_id.split("_session_");
    if (parts.length > 1) {
      req.sessionId = parts[1];
    }
  }
  const lastMessageUsage = sessionUsageCache.get(req.sessionId);
  const { messages, system = [], tools }: MessageCreateParamsBase = req.body;
  if (config.REWRITE_SYSTEM_PROMPT && system.length > 1 && system[1]?.text?.includes('<env>')) {
    const prompt = await readFile(config.REWRITE_SYSTEM_PROMPT, 'utf-8');
    system[1].text = `${prompt}<env>${system[1].text.split('<env>').pop()}`
  }

  try {
    const tokenCount = calculateTokenCount(
      messages as MessageParam[],
      system,
      tools as Tool[]
    );

    let model;
    if (config.CUSTOM_ROUTER_PATH) {
      try {
        const customRouter = require(config.CUSTOM_ROUTER_PATH);
        req.tokenCount = tokenCount; // Pass token count to custom router
        model = await customRouter(req, config, {
          event
        });
      } catch (e: any) {
        req.log.error(`failed to load custom router: ${e.message}`);
      }
    }
    if (!model) {
      model = await getUseModel(req, tokenCount, config, lastMessageUsage);
    }
    req.body.model = model;
    
    // Store the selected model for potential failover
    req.selectedModel = model;
  } catch (error: any) {
    req.log.error(`Error in router middleware: ${error.message}`);
    // Try to get a fallback model using failover
    try {
      req.body.model = getModelFromConfig(config.Router!.default, req.sessionId);
    } catch (fallbackError: any) {
      req.log.error(`Fallback model selection failed: ${fallbackError.message}`);
      // Last resort - use the first available provider
      if (Array.isArray(config.Router!.default) && config.Router!.default.length > 0) {
        req.body.model = config.Router!.default[0];
      } else {
        req.body.model = config.Router!.default;
      }
    }
  }
  return;
};
