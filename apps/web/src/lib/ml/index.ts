export { detectEngine, getOrtExecutionProviders } from './engineDetect';
export type { MLEngine, EngineCapabilities } from './engineDetect';

export { loadModel, getModelInfo, clearModelCache } from './modelLoader';

export { BirdTracker } from './tracker';
export type { BBox, Track, TrackerConfig } from './tracker';

export { BirdDetector } from './detector';
export type { DetectorResult } from './detector';

export { BirdClassifier, SimpleClassifier } from './classifier';
export type { ClassifierResult } from './classifier';

export { DetectionPipeline } from './pipeline';
export type { 
  Detection, 
  PipelineConfig, 
  PipelineStatus, 
  SightingEvent 
} from './pipeline';

export { ClipRecorder } from './clipRecorder';
export type { ClipRecorderConfig, ClipMetadata } from './clipRecorder';
