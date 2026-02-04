// Camera Manager - Handles camera access and photo capture

class CameraManager {
    constructor() {
        this.stream = null;
        this.videoElement = document.getElementById('cameraPreview');
        this.canvasElement = document.getElementById('photoCanvas');
        this.capturedPhotoData = null;
    }

    /**
     * Initialize and start camera
     */
    async startCamera() {
        try {
            Utils.log('Starting camera...');

            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: false
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);

            if (this.videoElement) {
                this.videoElement.srcObject = this.stream;
                Utils.log('Camera started successfully', 'success');
                return true;
            }

            return false;
        } catch (error) {
            Utils.log('Camera access denied: ' + error.message, 'error');
            return false;
        }
    }

    /**
     * Stop camera stream
     */
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;

            if (this.videoElement) {
                this.videoElement.srcObject = null;
            }

            Utils.log('Camera stopped');
        }
    }

    /**
     * Capture photo from video stream
     */
    capturePhoto() {
        if (!this.videoElement || !this.canvasElement) {
            Utils.log('Video or canvas element not found', 'error');
            return null;
        }

        try {
            const video = this.videoElement;
            const canvas = this.canvasElement;

            // Set canvas dimensions to match video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // Draw video frame to canvas
            const ctx = canvas.getContext('2d');

            // Flip horizontally to match mirror view
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Get image data
            this.capturedPhotoData = canvas.toDataURL('image/jpeg', 0.8);

            Utils.log('Photo captured successfully', 'success');
            Utils.playNotificationSound();

            return this.capturedPhotoData;
        } catch (error) {
            Utils.log('Error capturing photo: ' + error.message, 'error');
            return null;
        }
    }

    /**
     * Get captured photo data
     */
    getPhotoData() {
        return this.capturedPhotoData;
    }

    /**
     * Clear captured photo
     */
    clearPhoto() {
        this.capturedPhotoData = null;
    }

    /**
     * Check if camera is available
     */
    async checkCameraAvailability() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            return videoDevices.length > 0;
        } catch (error) {
            Utils.log('Error checking camera: ' + error.message, 'error');
            return false;
        }
    }

    /**
     * Simulate face recognition (for prototype)
     * In production, integrate with actual face recognition API
     */
    async recognizeFace(photoData) {
        // Simulate API call delay
        await Utils.delay(1000);

        // For prototype, try to match by phone number instead
        // In production, use actual face recognition service like:
        // - AWS Rekognition
        // - Azure Face API
        // - Google Cloud Vision API
        // - Face-API.js (client-side)

        Utils.log('Face recognition (simulated)');
        return null; // No match for prototype
    }
}

// Create global camera instance
const Camera = new CameraManager();
