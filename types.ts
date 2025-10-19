
export interface OpenRouterImageResponse {
    created: number;
    data: {
        b64_json?: string;
        url?: string;
        revised_prompt?: string;
    }[];
}

export interface OpenRouterErrorResponse {
    error: {
        message: string;
        type: string;
        param: string | null;
        code: string;
    };
}
