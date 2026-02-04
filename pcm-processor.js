class AudioWorkletProcessor { }

class PCMRecorder extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 4096;
        this.recordedFrames = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const channelData = input[0];

            // Just pass the data to the main thread
            // We need to convert Float32 to Int16 usually, but doing it in worklet
            // keeps main thread free.

            // Downsample or process if needed? 
            // Input is likely 44.1 or 48kHz. Live API expects 16kHz.
            // Simple downsampling is hard in worklet without buffering.
            // For now, let's send float32 chunks and handle resampling/conversion in main thread or rely on AudioContext sampleRate.

            this.port.postMessage(channelData);
        }
        return true;
    }
}

registerProcessor('pcm-recorder', PCMRecorder);
