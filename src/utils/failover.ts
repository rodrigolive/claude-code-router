import { sessionUsageCache } from './cache';

export interface FailoverConfig {
  providers: string[];
  currentIndex: number;
  lastFailureTime: number;
  failureCount: number;
}

export class FailoverManager {
  private static instance: FailoverManager;
  private failoverConfigs: Map<string, FailoverConfig> = new Map();
  private readonly FAILURE_COOLDOWN_MS = 30000; // 30 seconds cooldown
  private readonly MAX_FAILURES = 3; // Max failures before marking provider as temporarily unavailable

  static getInstance(): FailoverManager {
    if (!FailoverManager.instance) {
      FailoverManager.instance = new FailoverManager();
    }
    return FailoverManager.instance;
  }

  /**
   * Get the next available provider from a list of providers
   * @param providers Array of provider+model strings
   * @param sessionId Session ID for tracking per-session failover
   * @returns The next available provider+model string
   */
  getNextProvider(providers: string[], sessionId?: string): string {
    if (!Array.isArray(providers) || providers.length === 0) {
      throw new Error('No providers available');
    }

    if (providers.length === 1) {
      return providers[0];
    }

    const configKey = sessionId ? `session_${sessionId}` : 'global';
    let config = this.failoverConfigs.get(configKey);

    if (!config) {
      config = {
        providers: [...providers],
        currentIndex: 0,
        lastFailureTime: 0,
        failureCount: 0
      };
      this.failoverConfigs.set(configKey, config);
    }

    // Find the next available provider
    const availableProviders = this.getAvailableProviders(config);
    
    if (availableProviders.length === 0) {
      // Reset all providers if none are available
      this.resetFailoverConfig(configKey);
      return providers[0];
    }

    // Get the next provider in rotation
    const nextIndex = config.currentIndex % availableProviders.length;
    const selectedProvider = availableProviders[nextIndex];
    
    // Update the current index for next time
    config.currentIndex = (config.currentIndex + 1) % availableProviders.length;

    return selectedProvider;
  }

  /**
   * Record a failure for a specific provider
   * @param provider Provider+model string that failed
   * @param sessionId Session ID for tracking per-session failover
   * @param error The error that occurred
   */
  recordFailure(provider: string, sessionId?: string, error?: any): void {
    const configKey = sessionId ? `session_${sessionId}` : 'global';
    const config = this.failoverConfigs.get(configKey);

    if (!config) {
      return;
    }

    const now = Date.now();
    
    // Check if this is a retryable error (429, 500, 502, 503, 504, timeout, etc.)
    const isRetryableError = this.isRetryableError(error);
    
    if (isRetryableError) {
      config.failureCount++;
      config.lastFailureTime = now;
      
      // Log the failure
      console.warn(`Provider ${provider} failed (${config.failureCount}/${this.MAX_FAILURES}):`, error?.message || error);
      
      // If we've hit max failures, temporarily mark this provider as unavailable
      if (config.failureCount >= this.MAX_FAILURES) {
        console.warn(`Provider ${provider} temporarily unavailable due to repeated failures`);
      }
    }
  }

  /**
   * Record a successful request for a provider
   * @param provider Provider+model string that succeeded
   * @param sessionId Session ID for tracking per-session failover
   */
  recordSuccess(provider: string, sessionId?: string): void {
    const configKey = sessionId ? `session_${sessionId}` : 'global';
    const config = this.failoverConfigs.get(configKey);

    if (!config) {
      return;
    }

    // Reset failure count on success
    config.failureCount = 0;
    config.lastFailureTime = 0;
  }

  /**
   * Reset failover configuration for a session or globally
   * @param sessionId Session ID, or undefined for global reset
   */
  resetFailoverConfig(sessionId?: string): void {
    const configKey = sessionId ? `session_${sessionId}` : 'global';
    this.failoverConfigs.delete(configKey);
  }

  /**
   * Get available providers (excluding those that are temporarily unavailable)
   */
  private getAvailableProviders(config: FailoverConfig): string[] {
    const now = Date.now();
    
    return config.providers.filter(provider => {
      // If we haven't had failures recently, provider is available
      if (config.failureCount === 0 || now - config.lastFailureTime > this.FAILURE_COOLDOWN_MS) {
        return true;
      }
      
      // If we've had failures but not too many, provider is still available
      return config.failureCount < this.MAX_FAILURES;
    });
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;

    // HTTP status codes that should trigger failover
    const retryableStatusCodes = [429, 500, 502, 503, 504, 408, 524];
    
    // Check for HTTP status codes
    if (error.status && retryableStatusCodes.includes(error.status)) {
      return true;
    }
    
    // Check for status in response
    if (error.response?.status && retryableStatusCodes.includes(error.response.status)) {
      return true;
    }
    
    // Check for timeout errors
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return true;
    }
    
    // Check for network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
      return true;
    }
    
    // Check for rate limiting in error message
    if (error.message?.toLowerCase().includes('rate limit') || 
        error.message?.toLowerCase().includes('too many requests')) {
      return true;
    }
    
    return false;
  }

  /**
   * Get current failover status for debugging
   */
  getStatus(): Record<string, FailoverConfig> {
    return Object.fromEntries(this.failoverConfigs);
  }
}

export const failoverManager = FailoverManager.getInstance();