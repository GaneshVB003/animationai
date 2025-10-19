import { GoogleGenAI, Modality, Type } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

const getAI = () => {
    if (!aiInstance) {
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            throw new Error("API key is not configured. Please set the API_KEY environment variable.");
        }
        aiInstance = new GoogleGenAI({ apiKey });
    }
    return aiInstance;
};

/**
 * Takes a user's prompt and uses an AI to expand it into a more detailed,
 * visually rich description for better animation results.
 * @param prompt - The user's initial animation concept.
 * @returns A promise that resolves to the enhanced prompt string.
 */
export const enhancePrompt = async (prompt: string): Promise<string> => {
    const ai = getAI();
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: `You are a creative director specializing in animation. A user has provided a basic animation concept. Your task is to elevate it into a richer, more descriptive prompt that an AI image generator can use to create a compelling scene.

            **RULES:**
            1.  **Do Not Animate:** Do not describe the sequence of frames. Describe only the initial, static scene and the core action.
            2.  **Be Visually Specific:** Add details about the subject's appearance, the environment, lighting, and overall mood.
            3.  **Keep it Concise:** The output should be a single, dense paragraph.
            4.  **Focus on "What," not "How":** Describe the scene, not the animation steps. The storyboard AI will handle the breakdown.

            **User's Concept:** "${prompt}"

            **Enhanced Prompt:**`,
        });
        return response.text.trim();
    } catch (error) {
        console.error("Prompt Enhancement Error:", error);
        throw new Error("Failed to enhance prompt. The AI may be experiencing issues.");
    }
};


/**
 * Converts a base64 data URL into an inlineData part for the Gemini API.
 * @param base64Data - The base64 data URL (e.g., "data:image/png;base64,...").
 * @returns An object formatted for the Gemini API's `parts` array.
 */
const base64ToPart = (base64Data: string) => {
    const [header, data] = base64Data.split(',');
    if (!header || !data) {
        throw new Error("Invalid base64 data URL format.");
    }
    const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
    return { inlineData: { data, mimeType } };
};

/**
 * Generates a single animation frame based on a detailed text prompt and optionally, a reference image.
 * @param ai - The initialized GoogleGenAI client.
 * @param prompt - The text prompt describing the desired action/change.
 * @param referenceFrameB64 - Optional base64 data URL of a reference frame to guide the style and character.
 * @returns A promise that resolves to the base64 data URL of the newly generated frame.
 */
const generateFrame = async (ai: GoogleGenAI, prompt: string, referenceFrameB64?: string): Promise<string> => {
    const parts: any[] = [];
    if (referenceFrameB64) {
        parts.push(base64ToPart(referenceFrameB64));
    }
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
        }
    }
    throw new Error(`Image generation failed for prompt: "${prompt}"`);
};


/**
 * Generates a specified number of animation frames from a single motion prompt.
 * This function uses a sequential, frame-by-frame generation method with specific prompts
 * for the start and end frames to ensure a well-defined animation arc.
 * @param motionPrompt - A prompt describing an action or motion.
 * @param frameCount - The number of frames to generate.
 * @param onProgress - A callback function to report progress updates.
 * @returns A promise that resolves to an array of image data URLs.
 */
export const generateAnimationFrames = async (
    motionPrompt: string, 
    frameCount: number,
    onProgress?: (message: string) => void
): Promise<string[]> => {
    const ai = getAI();
    const allFrames: string[] = [];
    const styleInstruction = "Style: A raw, sketchy anime keyframe (genga). Emphasize dynamic, messy pencil lines and visible construction lines, capturing an energetic, in-progress feel. Plain white background.";

    if (frameCount < 1) {
        return [];
    }

    try {
        let previousFrame: string | undefined = undefined;

        for (let i = 1; i <= frameCount; i++) {
            onProgress?.(`Generating frame ${i} of ${frameCount}...`);

            let currentFramePrompt = '';

            if (i === 1) {
                // First frame: Establish the scene from scratch.
                currentFramePrompt = `${styleInstruction} This is the **first frame** of a ${frameCount}-frame animation. Depict the **absolute beginning** of the motion: "${motionPrompt}". The scene should be static, right before the main action starts.`;
            } else if (i === frameCount && frameCount > 1) {
                // Last frame: Conclude the motion, referencing the previous frame.
                currentFramePrompt = `${styleInstruction} This is the **final frame** of a ${frameCount}-frame animation of "${motionPrompt}". Using the provided image as the immediate previous frame, create the **absolute conclusion** of the motion. The action should be fully completed and settled.`;
            } else {
                // Intermediate frames: Use deep logic to create purposeful movement.
                currentFramePrompt = `${styleInstruction} This is frame ${i} of a ${frameCount}-frame animation of "${motionPrompt}".

**CRITICAL INSTRUCTION FOR AN EXPERT ANIMATOR:** Your task is to generate the very next logical step in the action, using the provided image as the immediate previous frame. The movement MUST be clear, purposeful, and dynamic—avoiding any static or idle appearance.

1.  **Analyze Motion Arc:** Deconstruct the core action: "${motionPrompt}". Consider the physics, momentum, and the primary arc of movement.
2.  **Calculate Next Pose:** For this specific frame, advance the subject's pose significantly. Think in terms of angles, trigonometry, and kinetics. For instance, if a character is "drawing a sword," calculate the new angle of the elbow, the rotation of the shoulder, and the precise new position of the hand and blade.
3.  **Generate with Precision:** Create a frame that flawlessly illustrates this calculated next step. The progression from the previous frame must be obvious, smooth, and contribute meaningfully to the overall animation's energy and flow.`;
            }
            
            const nextFrame = await generateFrame(ai, currentFramePrompt, previousFrame);
            allFrames.push(nextFrame);
            previousFrame = nextFrame; // Update the reference for the next iteration.
        }

        onProgress?.('Generation complete!');
        return allFrames;

    } catch (error) {
        console.error("Animation Generation Error:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to generate animation: ${error.message}`);
        }
        throw new Error('An unknown error occurred while generating the animation.');
    }
};