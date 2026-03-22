import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { StepCreateDataset } from '../components/internal/upload/StepCreateDataset';
import { StepDataset } from '../components/internal/dataset/StepDataset';
import StepAnalysisSpatial from '../components/internal/map/StepAnalysisSpatial';

const STEPS = [
  { id: 1, name: 'Create Dataset', description: 'Search or upload patents' },
  { id: 2, name: 'Dataset', description: 'Preview patents' },
  { id: 3, name: 'Analysis', description: 'Market opportunity analysis' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpatialData = any;

interface InternalViewProps {
  onBack: () => void;
}

export default function InternalView({ onBack }: InternalViewProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [pipelineData, setPipelineData] = useState<SpatialData | null>(null);

  const handleDatasetCreated = (params: { file: File }) => {
    setUploadedFile(params.file);
    setCurrentStep(2);
  };

  const handleNewAnalysisComplete = (data: SpatialData) => {
    setPipelineData(data);
    setCurrentStep(3);
  };

  // Step 3: Full screen analysis
  if (currentStep === 3) {
    return (
      <div className="flex-1 w-full h-full">
        <StepAnalysisSpatial onBack={() => setCurrentStep(2)} liveData={pipelineData} uploadedFile={uploadedFile} />
      </div>
    );
  }

  return (
    <div className="flex-1 w-full flex flex-col h-full min-h-screen bg-gray-100 p-6">
      {/* Back link */}
      <button
        onClick={() => {
          if (currentStep === 2) {
            setCurrentStep(1);
          } else {
            onBack();
          }
        }}
        className="flex items-center text-gray-600 hover:text-gray-900 mb-6 w-fit"
      >
        <ArrowLeft size={18} className="mr-1" />
        <span className="text-sm">
          {currentStep === 2 ? 'Back to Create Dataset' : 'Back to Home'}
        </span>
      </button>

      {/* Main content card */}
      <div className="flex-1 bg-white rounded-lg shadow-sm p-6 flex flex-col overflow-hidden">
        {/* Stepper */}
        <div className="flex items-center justify-center mb-8 flex-shrink-0">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                    ${currentStep >= step.id
                      ? 'bg-[#0d3356] text-white'
                      : 'bg-gray-200 text-gray-500'
                    }`}
                >
                  {step.id}
                </div>
                <span
                  className={`text-xs mt-1 ${
                    currentStep >= step.id ? 'text-[#0d3356]' : 'text-gray-400'
                  }`}
                >
                  {step.name}
                </span>
              </div>

              {index < STEPS.length - 1 && (
                <div
                  className={`w-16 h-0.5 mx-2 ${
                    currentStep > step.id ? 'bg-[#0d3356]' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 flex flex-col items-center overflow-auto">
          {currentStep === 1 && (
            <StepCreateDataset onNext={handleDatasetCreated} initialFile={uploadedFile} />
          )}

          {currentStep === 2 && uploadedFile && (
            <StepDataset
              file={uploadedFile}
              onBack={() => setCurrentStep(1)}
              onNewAnalysis={handleNewAnalysisComplete}
            />

          )}
        </div>
      </div>
    </div>
  );
}
