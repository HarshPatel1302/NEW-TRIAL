class PCMStreamer {
    constructor(context) {
        this.context = context;
        this.audioQueue = [];
        this.isPlaying = false;
        this.scheduledTime = 0;
        this.gainNode = this.context.createGain();
        this.gainNode.connect(this.context.destination);
    }

    addPCM16(chunk) {
        // chunk is a base64 string or ArrayBuffer of 16-bit PCM at 24kHz
        const float32Array = this.convertPCM16ToFloat32(chunk);

        // Create audio buffer
        const audioBuffer = this.context.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);

        this.audioQueue.push(audioBuffer);
        this.scheduleNextBuffer();
    }

    convertPCM16ToFloat32(base64Data) {
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const int16Array = new Int16Array(bytes.buffer);
        const float32Array = new Float32Array(int16Array.length);

        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768;
        }
        return float32Array;
    }

    scheduleNextBuffer() {
        if (this.audioQueue.length === 0) return;

        // Ensure we don't schedule in the past
        const currentTime = this.context.currentTime;
        if (this.scheduledTime < currentTime) {
            this.scheduledTime = currentTime;
        }

        while (this.audioQueue.length > 0) {
            const buffer = this.audioQueue.shift();
            const source = this.context.createBufferSource();
            source.buffer = buffer;
            source.connect(this.gainNode);
            source.start(this.scheduledTime);
            this.scheduledTime += buffer.duration;
        }
    }

    stop() {
        this.audioQueue = [];
        this.scheduledTime = 0;
    }
}
