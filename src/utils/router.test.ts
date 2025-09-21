import { expect, test, describe, beforeEach } from "bun:test";
import { router } from "./router";

describe("bodyDelete functionality", () => {
  let mockReq: any;
  let mockRes: any;
  let mockContext: any;

  beforeEach(() => {
    mockReq = {
      body: {
        model: "openrouter,anthropic/claude-3.5-sonnet",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.7,
        reasoning: true,
        metadata: {}
      },
      log: {
        debug: () => {},
        info: () => {},
        error: () => {}
      }
    };
    mockRes = {};
    mockContext = {
      config: {
        Providers: [
          {
            name: "openrouter",
            models: ["anthropic/claude-3.5-sonnet"],
            bodyDelete: ["reasoning", "temperature"]
          }
        ],
        Router: {
          default: "openrouter,anthropic/claude-3.5-sonnet"
        }
      },
      event: {}
    };
  });

  test("should remove parameters specified in bodyDelete for openrouter provider", async () => {
    await router(mockReq, mockRes, mockContext);
    
    // Verify model is set correctly
    expect(mockReq.body.model).toBe("openrouter,anthropic/claude-3.5-sonnet");
    
    // Verify bodyDelete parameters are removed
    expect(mockReq.body.reasoning).toBeUndefined();
    expect(mockReq.body.temperature).toBeUndefined();
    
    // Verify other parameters are still present
    expect(mockReq.body.messages).toBeDefined();
  });

  test("should not remove parameters not specified in bodyDelete", async () => {
    mockReq.body.otherParam = "should remain";
    await router(mockReq, mockRes, mockContext);
    
    // Verify unspecified parameters remain
    expect(mockReq.body.otherParam).toBe("should remain");
    expect(mockReq.body.messages).toBeDefined();
    expect(mockReq.body.model).toBe("openrouter,anthropic/claude-3.5-sonnet");
  });

  test("should handle bodyDelete when parameter doesn't exist in body", async () => {
    delete mockReq.body.reasoning;
    await router(mockReq, mockRes, mockContext);
    
    // Should still remove temperature
    expect(mockReq.body.temperature).toBeUndefined();
    expect(mockReq.body.model).toBe("openrouter,anthropic/claude-3.5-sonnet");
  });
});

describe("OpenAI bodyDelete error scenario", () => {
  let mockReq: any;
  let mockRes: any;
  let mockContext: any;

  beforeEach(() => {
    mockReq = {
      body: {
        model: "openai,gpt-5",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.7,
        reasoning: true,
        metadata: {}
      },
      log: {
        debug: () => {},
        info: () => {},
        error: () => {}
      }
    };
    mockRes = {};
    mockContext = {
      config: {
        Providers: [
          {
            name: "openai",
            api_base_url: "https://api.openai.com/v1/chat/completions",
            api_key: "",
            bodyDelete: ["reasoning"]
          }
        ],
        Router: {
          default: "openai,gpt-5"
        }
      },
      event: {}
    };
  });

  test("should remove reasoning parameter for OpenAI provider", async () => {
    await router(mockReq, mockRes, mockContext);
    
    // Verify model is set correctly
    expect(mockReq.body.model).toBe("openai,gpt-5");
    
    // Verify bodyDelete parameter is removed
    expect(mockReq.body.reasoning).toBeUndefined();
    
    // Verify other parameters are still present
    expect(mockReq.body.messages).toBeDefined();
    expect(mockReq.body.temperature).toBeDefined();
  });

  test("should also remove thinking when reasoning is disallowed", async () => {
    // Simulate think mode input; bodyDelete has 'reasoning'
    mockReq.body.thinking = { type: "enabled", budget_tokens: 1024 };
    await router(mockReq, mockRes, mockContext);

    // Thinking is removed to avoid downstream injection of 'reasoning'
    expect(mockReq.body.thinking).toBeUndefined();
    expect(mockReq.body.enable_thinking).toBeUndefined();
  });
  
  test("should handle model names that are not in Providers.models array", async () => {
    // This replicates the actual issue - OpenAI provider doesn't have a models array
    // but the current logic expects to find the model in the provider's models array
    const mockReq2 = {
      body: {
        model: "openai,gpt-5",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.7,
        reasoning: true,
        metadata: {}
      },
      log: {
        debug: console.log,
        info: console.log,
        error: console.log
      }
    };
    
    const mockContext2 = {
      config: {
        Providers: [
          {
            name: "openai",
            // Note: no models array here, which is probably how it's configured in real usage
            api_base_url: "https://api.openai.com/v1/chat/completions",
            api_key: "",
            bodyDelete: ["reasoning"]
          }
        ],
        Router: {
          default: "openai,gpt-5"
        }
      },
      event: {}
    };
    
    await router(mockReq2, mockRes, mockContext2);
    
    // Verify bodyDelete still works even without models array
    expect(mockReq2.body.reasoning).toBeUndefined();
    expect(mockReq2.body.model).toBe("openai,gpt-5");
  });
});

describe("bodySet functionality", () => {
  let mockReq: any;
  let mockRes: any;
  let mockContext: any;

  beforeEach(() => {
    mockReq = {
      body: {
        model: "openai,gpt-5",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.7,
        metadata: {}
      },
      log: {
        debug: () => {},
        info: () => {},
        error: () => {}
      }
    };
    mockRes = {};
    mockContext = {
      config: {
        Providers: [
          {
            name: "openai",
            api_base_url: "https://api.openai.com/v1/chat/completions",
            api_key: "",
            bodySet: {
              "reasoning_effort": "high"
            }
          }
        ],
        Router: {
          default: "openai,gpt-5"
        }
      },
      event: {}
    };
  });

  test("should set parameters specified in bodySet for openai provider", async () => {
    await router(mockReq, mockRes, mockContext);
    
    // Verify model is set correctly
    expect(mockReq.body.model).toBe("openai,gpt-5");
    
    // Verify bodySet parameters are added
    expect(mockReq.body.reasoning_effort).toBe("high");
    
    // Verify existing parameters are still present
    expect(mockReq.body.messages).toBeDefined();
    expect(mockReq.body.temperature).toBeDefined();
  });

  test("should handle bodySet when provider doesn't exist", async () => {
    mockReq.body.model = "unknown,gpt-5";
    await router(mockReq, mockRes, mockContext);
    
    // Should still set model correctly
    expect(mockReq.body.model).toBe("unknown,gpt-5");
    
    // No bodySet parameters should be added since provider doesn't exist
    expect(mockReq.body.reasoning_effort).toBeUndefined();
  });
  
  test("should handle bodySet when provider has no bodySet configuration", async () => {
    mockContext.config.Providers[0].bodySet = undefined;
    await router(mockReq, mockRes, mockContext);
    
    // Verify model is set correctly
    expect(mockReq.body.model).toBe("openai,gpt-5");
    
    // No bodySet parameters should be added since there's no bodySet config
    expect(mockReq.body.reasoning_effort).toBeUndefined();
    
    // Existing parameters should still be present
    expect(mockReq.body.messages).toBeDefined();
    expect(mockReq.body.temperature).toBeDefined();
  });
});
