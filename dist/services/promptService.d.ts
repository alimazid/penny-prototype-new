export interface PromptTemplate {
    content: string;
}
export declare class PromptService {
    private static instance;
    private promptCache;
    private basePromptPath;
    private constructor();
    static getInstance(): PromptService;
    /**
     * Load a prompt template from file system
     */
    loadPrompt(model: string, version: string, promptType: string): Promise<string>;
    /**
     * Render a prompt template with variables
     */
    renderPrompt(template: string, variables: Record<string, any>): string;
    /**
     * Get classification prompts for a specific model/version
     */
    getClassificationPrompts(model?: string, version?: string): Promise<{
        system: string;
        user: string;
    }>;
    /**
     * Get extraction prompts for a specific model/version
     */
    getExtractionPrompts(model?: string, version?: string): Promise<{
        system: string;
        user: string;
        creditCardRequirements?: string;
    }>;
    /**
     * Clear the prompt cache (useful for development/testing)
     */
    clearCache(): void;
    /**
     * Get available models and versions
     */
    getAvailableModels(): Promise<Record<string, string[]>>;
}
export declare const promptService: PromptService;
//# sourceMappingURL=promptService.d.ts.map