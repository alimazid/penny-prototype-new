import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';

export interface PromptTemplate {
  content: string;
}

export class PromptService {
  private static instance: PromptService;
  private promptCache: Map<string, string> = new Map();
  private basePromptPath: string;

  private constructor() {
    this.basePromptPath = path.join(__dirname, '../prompts');
  }

  static getInstance(): PromptService {
    if (!PromptService.instance) {
      PromptService.instance = new PromptService();
    }
    return PromptService.instance;
  }

  /**
   * Load a prompt template from file system
   */
  async loadPrompt(model: string, version: string, promptType: string): Promise<string> {
    const promptKey = `${model}/${version}/${promptType}`;
    
    // Check cache first
    if (this.promptCache.has(promptKey)) {
      return this.promptCache.get(promptKey)!;
    }

    try {
      const promptPath = path.join(this.basePromptPath, model, version, `${promptType}.txt`);
      const content = await fs.readFile(promptPath, 'utf-8');
      
      // Cache the prompt
      this.promptCache.set(promptKey, content);
      
      logger.debug(`Loaded prompt: ${promptKey}`);
      return content;
    } catch (error) {
      logger.error(`Failed to load prompt ${promptKey}:`, error);
      throw new Error(`Prompt not found: ${promptKey}`);
    }
  }

  /**
   * Render a prompt template with variables
   */
  renderPrompt(template: string, variables: Record<string, any>): string {
    let rendered = template;
    
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      rendered = rendered.replace(new RegExp(placeholder, 'g'), String(value));
    }
    
    return rendered;
  }

  /**
   * Get classification prompts for a specific model/version
   */
  async getClassificationPrompts(model: string = 'gpt-4o-mini', version: string = 'v1'): Promise<{
    system: string;
    user: string;
  }> {
    const [system, user] = await Promise.all([
      this.loadPrompt(model, version, 'classification-system'),
      this.loadPrompt(model, version, 'classification-user'),
    ]);

    return { system, user };
  }

  /**
   * Get extraction prompts for a specific model/version
   */
  async getExtractionPrompts(model: string = 'gpt-4o-mini', version: string = 'v1'): Promise<{
    system: string;
    user: string;
    creditCardRequirements?: string;
  }> {
    const [system, user] = await Promise.all([
      this.loadPrompt(model, version, 'extraction-system'),
      this.loadPrompt(model, version, 'extraction-user'),
    ]);

    let creditCardRequirements: string | undefined;
    try {
      creditCardRequirements = await this.loadPrompt(model, version, 'credit-card-requirements');
    } catch (error) {
      // Optional file, don't error if missing
      logger.debug('Credit card requirements file not found, using default');
    }

    return { 
      system, 
      user, 
      ...(creditCardRequirements && { creditCardRequirements })
    };
  }

  /**
   * Clear the prompt cache (useful for development/testing)
   */
  clearCache(): void {
    this.promptCache.clear();
    logger.debug('Prompt cache cleared');
  }

  /**
   * Get available models and versions
   */
  async getAvailableModels(): Promise<Record<string, string[]>> {
    try {
      const models: Record<string, string[]> = {};
      const modelDirs = await fs.readdir(this.basePromptPath);
      
      for (const modelDir of modelDirs) {
        const modelPath = path.join(this.basePromptPath, modelDir);
        const stat = await fs.stat(modelPath);
        
        if (stat.isDirectory()) {
          const versions = await fs.readdir(modelPath);
          models[modelDir] = versions.filter(async (version) => {
            const versionPath = path.join(modelPath, version);
            const versionStat = await fs.stat(versionPath);
            return versionStat.isDirectory();
          });
        }
      }
      
      return models;
    } catch (error) {
      logger.error('Failed to get available models:', error);
      return {};
    }
  }
}

// Export singleton instance
export const promptService = PromptService.getInstance();