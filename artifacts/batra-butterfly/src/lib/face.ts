import * as faceapi from "@vladmandic/face-api";

let modelsLoaded = false;
let loadPromise: Promise<void> | null = null;

const MODEL_URL = `${import.meta.env.BASE_URL}models`;

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
  })();
  return loadPromise;
}

export type FaceCaptureResult = {
  descriptor: number[];
  detected: boolean;
};

/**
 * Detect a single face in the given media element and return its 128-d descriptor.
 * Returns detected=false when no face is found.
 */
export async function computeDescriptor(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): Promise<FaceCaptureResult> {
  await loadFaceModels();
  const detection = await faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    return { descriptor: [], detected: false };
  }
  return { descriptor: Array.from(detection.descriptor), detected: true };
}

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}
