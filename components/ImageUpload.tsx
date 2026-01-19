
import React, { useRef, useState } from 'react';
import { IconCamera } from './Icons';

interface ImageUploadProps {
  onImageSelected: (base64: string) => void;
  isLoading: boolean;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ onImageSelected, isLoading }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setPreview(result);
        // Remove data URL prefix for API
        const base64 = result.split(',')[1];
        onImageSelected(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerCamera = () => {
    inputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerCamera();
    }
  };

  return (
    <div className="w-full">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={inputRef}
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      
      {!preview ? (
        <button
          onClick={triggerCamera}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          aria-label="Tap to scan food label with camera"
          className={`w-full h-48 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors focus:outline-none focus:ring-4 focus:ring-emerald-200
            ${isLoading ? 'bg-gray-50 border-gray-300 cursor-wait' : 'bg-white border-emerald-300 text-emerald-600 hover:bg-emerald-50 active:bg-emerald-100'}
          `}
        >
          {isLoading ? (
            <div className="flex flex-col items-center animate-pulse">
              <div className="h-8 w-8 bg-gray-300 rounded-full mb-2"></div>
              <span className="text-gray-400 font-medium">Analyzing label...</span>
            </div>
          ) : (
            <>
              <IconCamera className="w-8 h-8 mb-2" />
              <span className="font-semibold">Tap to Scan Food Label</span>
              <span className="text-xs text-gray-400 mt-1">OCR detects name & expiry</span>
            </>
          )}
        </button>
      ) : (
        <div className="relative w-full h-48 rounded-xl overflow-hidden shadow-sm group">
          <img src={preview} alt="Captured food preview" className="w-full h-full object-cover" />
          <button 
            onClick={() => {
              setPreview(null);
              if(inputRef.current) inputRef.current.value = '';
            }}
            aria-label="Remove image and retake"
            className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white"
          >
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          {isLoading && (
             <div className="absolute inset-0 bg-black/40 flex items-center justify-center" role="status" aria-label="Processing image">
                 <div className="text-white font-medium flex flex-col items-center">
                   <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mb-2"></div>
                   Processing...
                 </div>
             </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
