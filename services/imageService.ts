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
 * Generates a detailed, frame-by-frame storyboard for an animation.
 * This is the "logic" phase where the entire motion is planned out with deep analysis.
 * @param ai - The initialized GoogleGenAI client.
 * @param motionPrompt - A prompt describing an action or motion.
 * @param frameCount - The number of frames to generate.
 * @returns A promise that resolves to an array of strings, where each string is a detailed prompt for a frame.
 */
const generateStoryboard = async (ai: GoogleGenAI, motionPrompt: string, frameCount: number): Promise<string[]> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: `You are an expert animator, physicist, and kinesiologist. Your task is to perform a deep analysis of a motion concept and break it down into a series of distinct keyframes for a ${frameCount}-frame animation. You will generate a detailed, frame-by-frame script. For each frame, you must provide both technical notes analyzing the motion and a descriptive prompt for an AI image generator.

**DEEP ANALYSIS RULES:**
1.  **Establish a 3D Scene:** Imagine the scene in three dimensions. Define the subject's initial position and the camera's viewpoint.
2.  **Deconstruct the Motion:**
    *   **Primary Motion:** Identify the main arc of movement (e.g., the path of a sword swing).
    *   **Secondary Motion:** Analyze overlapping actions and follow-through (e.g., the rotation of the torso, the shift in body weight).
    *   **Physics & Kinesiology:** Consider gravity, momentum, inertia, and realistic body mechanics. How does the body shift to maintain balance? What muscles are engaged?
3.  **Frame-by-Frame Breakdown:** For each frame, provide:
    *   **Technical Notes:** A bullet-point list of the precise changes from the *previous* frame. Use quantitative data: angles in degrees, positions on an imaginary X/Y/Z grid, and percentages of completion for the overall motion. Describe the physics at play. This is your private "animator's notes".
    *   **Frame Description:** A vivid, descriptive prompt for the AI image generator. This description should be the culmination of your technical analysis, translated into artistic language. It must clearly state the subject's pose and the state of the action.

**OUTPUT FORMAT:**
You must provide a JSON object with a single key "storyboard". The value of "storyboard" must be an array of objects, with each object representing one frame. The array must contain exactly ${frameCount} elements. Each object must have two keys: 'technical_notes' and 'frame_description'.

**Motion Concept:** "${motionPrompt}"`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        storyboard: {
                            type: Type.ARRAY,
                            description: `An array of exactly ${frameCount} objects, where each object represents one frame.`,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    technical_notes: {
                                        type: Type.STRING,
                                        description: "Animator's technical analysis of the frame's motion, physics, and changes from the previous frame. Use quantitative details."
                                    },
                                    frame_description: {
                                        type: Type.STRING,
                                        description: "A vivid, descriptive prompt for an AI image generator, based on the technical analysis."
                                    }
                                },
                                required: ['technical_notes', 'frame_description']
                            }
                        }
                    },
                    required: ['storyboard']
                },
            },
        });

        const responseText = response.text.trim();
        const parsedJson = JSON.parse(responseText);
        
        interface StoryboardFrame {
            technical_notes: string;
            frame_description: string;
        }

        const storyboardFrames: StoryboardFrame[] = parsedJson.storyboard;


        if (!Array.isArray(storyboardFrames) || storyboardFrames.length !== frameCount) {
            console.error('AI storyboard response:', storyboardFrames);
            throw new Error(`Storyboard generation failed: AI returned an invalid format or wrong number of frames. Expected ${frameCount}, got ${storyboardFrames.length || 'none'}.`);
        }
        
        const frameDescriptions = storyboardFrames.map(frame => {
            if (typeof frame.frame_description !== 'string' || !frame.frame_description) {
                 throw new Error('Storyboard generation failed: A frame description was missing or not a string.');
            }
            return frame.frame_description;
        });

        return frameDescriptions;

    } catch (error) {
        console.error("Storyboard Generation Error:", error);
        if (error instanceof Error && error.message.includes('JSON.parse')) {
             throw new Error("Failed to generate animation storyboard. The planning AI returned an invalid JSON format.");
        }
        throw new Error("Failed to generate animation storyboard. The planning AI may be experiencing issues.");
    }
};


/**
 * Generates a specified number of animation frames from a single motion prompt.
 * This function first generates a detailed storyboard (the "deep logic") and then
 * executes that storyboard frame by frame to create the animation.
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
        onProgress?.('Analyzing motion and creating storyboard...');
        const storyboard = await generateStoryboard(ai, motionPrompt, frameCount);
        onProgress?.('Storyboard created. Starting frame generation...');

        let previousFrame: string | undefined = undefined;

        for (let i = 0; i < frameCount; i++) {
            const frameIndex = i + 1;
            onProgress?.(`Generating frame ${frameIndex} of ${frameCount}...`);

            const storyboardPrompt = storyboard[i];
            let currentFramePrompt = '';

            if (i === 0) {
                // First frame: Establish the scene from scratch using the storyboard's direction.
                currentFramePrompt = `${styleInstruction} This is the **first frame** of a ${frameCount}-frame animation. The detailed instruction for this frame is: "${storyboardPrompt}".`;
            } else {
                // Subsequent frames: Use the previous frame as a reference and apply the storyboard's instruction.
                currentFramePrompt = `${styleInstruction} This is frame ${frameIndex} of a ${frameCount}-frame animation. Using the provided image as the immediate previous frame, generate the very next logical step in the action. The precise instruction for this frame is: "${storyboardPrompt}". Ensure the transition is smooth and physically plausible.`;
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
