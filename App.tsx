import React, { useState, useCallback, useEffect, useRef } from 'react';
import { generateAnimationFrames, enhancePrompt } from './services/imageService';

// TypeScript declaration for the GIF.js library loaded via script tag
declare var GIF: any;

const ProgressDisplay: React.FC<{ message: string }> = ({ message }) => (
    <div className="flex flex-col justify-center items-center text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
        <p className="text-purple-300 font-medium">{message}</p>
    </div>
);


const AnimationPlayer: React.FC<{ frames: string[], speed: number }> = ({ frames, speed }) => {
    const [currentFrame, setCurrentFrame] = useState(0);

    useEffect(() => {
        if (frames.length < 2) return;

        const intervalDuration = 1100 - speed;

        const intervalId = setInterval(() => {
            setCurrentFrame(prevFrame => (prevFrame + 1) % frames.length);
        }, intervalDuration); 

        return () => clearInterval(intervalId);
    }, [frames, speed]);

    if (!frames || frames.length === 0) {
        return null;
    }

    return (
        <img 
            src={frames[currentFrame]} 
            alt="Generated AI animation" 
            className="rounded-lg max-w-full h-auto shadow-lg shadow-purple-900/50" 
        />
    );
};

const App: React.FC = () => {
    const [prompt, setPrompt] = useState<string>('A knight drawing a sword from its sheath');
    const [frameCount, setFrameCount] = useState<number>(4);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(500);
    const [frames, setFrames] = useState<string[] | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
    const [isCreatingGif, setIsCreatingGif] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<string | null>(null);
    const [password, setPassword] = useState<string>('');
    const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
    const gifWorkerUrl = useRef<string | null>(null);


    // Pre-fetch the GIF worker script to avoid CORS issues.
    useEffect(() => {
        fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js')
            .then(res => res.text())
            .then(scriptText => {
                const blob = new Blob([scriptText], { type: 'application/javascript' });
                gifWorkerUrl.current = URL.createObjectURL(blob);
            })
            .catch(err => {
                console.error("Failed to fetch gif.worker.js:", err);
                setError("Could not initialize GIF downloader component.");
            });

        return () => {
            if (gifWorkerUrl.current) {
                URL.revokeObjectURL(gifWorkerUrl.current);
            }
        };
    }, []);

    const handleEnhancePrompt = useCallback(async () => {
        if (!prompt.trim()) {
            setError('Please enter a prompt to enhance.');
            return;
        }
        setIsEnhancing(true);
        setError(null);
        try {
            const enhanced = await enhancePrompt(prompt);
            setPrompt(enhanced);
        } catch (err) {
             if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('An unknown error occurred while enhancing the prompt.');
            }
        } finally {
            setIsEnhancing(false);
        }
    }, [prompt]);

    const handleGenerateAnimation = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) {
            setError('Please enter a prompt describing a motion.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setFrames(null);
        setProgress('Initializing...');

        try {
            const urls = await generateAnimationFrames(prompt, frameCount, (message) => {
                setProgress(message);
            });
            setFrames(urls);
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('An unknown error occurred.');
            }
        } finally {
            setIsLoading(false);
            setProgress(null);
        }
    }, [prompt, frameCount]);
    
    const handleDownload = useCallback(async () => {
        if (!frames || frames.length === 0 || !gifWorkerUrl.current) {
            setError(gifWorkerUrl.current ? 'No frames to create a GIF from.' : 'GIF downloader is not ready.');
            return;
        };

        setIsCreatingGif(true);
        setError(null);

        try {
            const gif = new GIF({
                workers: 2,
                quality: 10,
                workerScript: gifWorkerUrl.current
            });

            const imageLoadPromises = frames.map(frameSrc => 
                new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = "Anonymous";
                    img.src = frameSrc;
                    img.onload = () => resolve(img);
                    img.onerror = (err) => reject(new Error('Failed to load an image frame.'));
                })
            );

            const loadedImages = await Promise.all(imageLoadPromises);
            
            loadedImages.forEach(img => {
                gif.addFrame(img, { delay: 1100 - playbackSpeed });
            });
            
            gif.on('finished', (blob: Blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'animation.gif';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setIsCreatingGif(false);
            });
            
            gif.render();

        } catch (err) {
            if (err instanceof Error) {
                setError(`Failed to create GIF: ${err.message}`);
            } else {
                setError('An unknown error occurred during GIF creation.');
            }
            setIsCreatingGif(false);
        }
    }, [frames, playbackSpeed]);

    const handleUnlock = () => {
        if (password === '12121212') {
            setIsUnlocked(true);
            setError(null);
        } else {
            setError('Incorrect password.');
            setPassword('');
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center py-10 px-4 font-sans">
            <div className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
                {/* Left Column: Controls */}
                <div className="bg-gray-800/50 p-6 rounded-xl shadow-2xl border border-gray-700">
                    <header className="text-left mb-8">
                        <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                            AI Animation Studio
                        </h1>
                        <p className="text-gray-400 mt-2">Bring motion to life with AI.</p>
                    </header>

                    <form onSubmit={handleGenerateAnimation} className="space-y-6">
                        <div>
                            <label htmlFor="prompt" className="block text-lg font-semibold text-gray-200 mb-2">
                                Animation Prompt
                            </label>
                            <div className="relative">
                                <textarea
                                    id="prompt"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder="e.g., A rocket launching into space"
                                    className="w-full h-28 p-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 resize-none text-base"
                                    disabled={isLoading || isEnhancing}
                                />
                                <button
                                    type="button"
                                    onClick={handleEnhancePrompt}
                                    disabled={isLoading || isEnhancing}
                                    className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 bg-purple-600 text-white text-xs font-semibold rounded-md hover:bg-purple-700 disabled:bg-purple-900 disabled:cursor-not-allowed transition"
                                    title="Enhance prompt with AI"
                                >
                                    ✨ {isEnhancing ? 'Refining...' : 'Refine'}
                                </button>
                            </div>
                        </div>

                        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-6">
                            <h3 className="text-lg font-semibold text-gray-200">Settings</h3>
                            <div>
                                <label htmlFor="frameCount" className="block text-sm font-medium text-gray-300 mb-2">
                                    Number of Frames: <span className="font-bold text-purple-400 text-lg">{frameCount}</span>
                                </label>
                                <input
                                    id="frameCount"
                                    type="range"
                                    min="2"
                                    max={isUnlocked ? 200 : 30}
                                    value={frameCount}
                                    onChange={(e) => setFrameCount(Number(e.target.value))}
                                    disabled={isLoading}
                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                            </div>

                            {!isUnlocked && (
                               <div className="bg-gray-800 p-3 rounded-md border border-purple-800/50">
                                    <p className="text-xs text-purple-300 mb-2">Unlock up to 200 frames with password.</p>
                                    <div className="flex space-x-2">
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter password..."
                                            className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-sm focus:ring-1 focus:ring-purple-500"
                                            disabled={isLoading}
                                        />
                                        <button type="button" onClick={handleUnlock} className="px-4 py-2 bg-purple-600 rounded-md text-sm font-bold hover:bg-purple-700 transition">Unlock</button>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label htmlFor="playbackSpeed" className="block text-sm font-medium text-gray-300 mb-2">
                                    Playback Speed
                                </label>
                                <input
                                    id="playbackSpeed"
                                    type="range"
                                    min="100" // Corresponds to 1000ms interval (slow)
                                    max="1000" // Corresponds to 100ms interval (fast)
                                    step="50"
                                    value={playbackSpeed}
                                    onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                                <div className="flex justify-between text-xs text-gray-400 mt-1">
                                    <span>Slow</span>
                                    <span>Fast</span>
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading || isEnhancing}
                            className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-purple-600 text-white font-bold rounded-md hover:bg-purple-700 disabled:bg-purple-900 disabled:text-gray-400 disabled:cursor-not-allowed transition duration-200 text-lg"
                        >
                             <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                            {isLoading ? (progress || 'Generating...') : 'Generate Animation'}
                        </button>
                    </form>
                </div>

                {/* Right Column: Display */}
                <div className="w-full">
                    <div className="bg-gray-800/50 p-4 rounded-xl shadow-2xl border border-gray-700 aspect-square flex justify-center items-center">
                        {isLoading && progress && <ProgressDisplay message={progress} />}
                        {error && <p className="text-red-400 text-center px-4">{error}</p>}
                        {frames && !isLoading && <AnimationPlayer frames={frames} speed={playbackSpeed} />}
                        {!isLoading && !error && !frames && (
                            <div className="text-center text-gray-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-20 w-20" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M19.33,4.33a2,2,0,0,0-2.66-.33l-9,5A2,2,0,0,0,6.33,12l9,5a2,2,0,0,0,2.66-3.33L11.33,12l6.66-3.67A2,2,0,0,0,19.33,4.33Z"/>
                                  <path d="M4.67,6.33a2,2,0,0,0-2.67,0L.67,7A2,2,0,0,0,.67,10l1.33.67a2,2,0,0,0,2.67-1.34L6,7.67A2,2,0,0,0,4.67,6.33Z"/>
                                  <path d="M4.67,14.33a2,2,0,0,0-2.67,0L.67,15a2,2,0,0,0,0,3l1.33.67a2,2,0,0,0,2.67-1.34L6,15.67A2,2,0,0,0,4.67,14.33Z"/>
                                </svg>
                                <p className="mt-4 text-lg">Your animation will appear here.</p>
                                <p className="text-sm">Describe a motion and click generate.</p>
                            </div>
                        )}
                    </div>
                     {frames && !isLoading && (
                        <div className="mt-6 text-center">
                            <button
                                onClick={handleDownload}
                                disabled={isCreatingGif}
                                className="w-full max-w-xs mx-auto flex justify-center items-center gap-2 px-4 py-3 bg-green-600 text-white font-bold rounded-md hover:bg-green-700 disabled:bg-green-800 disabled:text-gray-400 disabled:cursor-not-allowed transition duration-200"
                            >
                               {isCreatingGif ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Creating GIF...
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                        Download as GIF
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;