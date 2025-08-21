"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.promptService = exports.PromptService = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../utils/logger");
class PromptService {
    static instance;
    promptCache = new Map();
    basePromptPath;
    constructor() {
        this.basePromptPath = path_1.default.join(__dirname, '../prompts');
    }
    static getInstance() {
        if (!PromptService.instance) {
            PromptService.instance = new PromptService();
        }
        return PromptService.instance;
    }
    /**
     * Load a prompt template from file system
     */
    async loadPrompt(model, version, promptType) {
        const promptKey = `${model}/${version}/${promptType}`;
        // Check cache first
        if (this.promptCache.has(promptKey)) {
            return this.promptCache.get(promptKey);
        }
        try {
            const promptPath = path_1.default.join(this.basePromptPath, model, version, `${promptType}.txt`);
            const content = await promises_1.default.readFile(promptPath, 'utf-8');
            // Cache the prompt
            this.promptCache.set(promptKey, content);
            logger_1.logger.debug(`Loaded prompt: ${promptKey}`);
            return content;
        }
        catch (error) {
            logger_1.logger.error(`Failed to load prompt ${promptKey}:`, error);
            throw new Error(`Prompt not found: ${promptKey}`);
        }
    }
    /**
     * Render a prompt template with variables
     */
    renderPrompt(template, variables) {
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
    async getClassificationPrompts(model = 'gpt-4o-mini', version = 'v1') {
        const [system, user] = await Promise.all([
            this.loadPrompt(model, version, 'classification-system'),
            this.loadPrompt(model, version, 'classification-user'),
        ]);
        return { system, user };
    }
    /**
     * Get extraction prompts for a specific model/version
     */
    async getExtractionPrompts(model = 'gpt-4o-mini', version = 'v1') {
        const [system, user] = await Promise.all([
            this.loadPrompt(model, version, 'extraction-system'),
            this.loadPrompt(model, version, 'extraction-user'),
        ]);
        let creditCardRequirements;
        try {
            creditCardRequirements = await this.loadPrompt(model, version, 'credit-card-requirements');
        }
        catch (error) {
            // Optional file, don't error if missing
            logger_1.logger.debug('Credit card requirements file not found, using default');
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
    clearCache() {
        this.promptCache.clear();
        logger_1.logger.debug('Prompt cache cleared');
    }
    /**
     * Get available models and versions
     */
    async getAvailableModels() {
        try {
            const models = {};
            const modelDirs = await promises_1.default.readdir(this.basePromptPath);
            for (const modelDir of modelDirs) {
                const modelPath = path_1.default.join(this.basePromptPath, modelDir);
                const stat = await promises_1.default.stat(modelPath);
                if (stat.isDirectory()) {
                    const versions = await promises_1.default.readdir(modelPath);
                    models[modelDir] = versions.filter(async (version) => {
                        const versionPath = path_1.default.join(modelPath, version);
                        const versionStat = await promises_1.default.stat(versionPath);
                        return versionStat.isDirectory();
                    });
                }
            }
            return models;
        }
        catch (error) {
            logger_1.logger.error('Failed to get available models:', error);
            return {};
        }
    }
}
exports.PromptService = PromptService;
// Export singleton instance
exports.promptService = PromptService.getInstance();
//# sourceMappingURL=promptService.js.map