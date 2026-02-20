import React, { useState, useEffect } from 'react';

/**
 * Windows 11 Blue Screen of Death (BSOD) Error Boundary Display
 * Shown when a React component tree crashes via ErrorBoundary.
 */
export default function BSOD({ errorMessage }) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  // Simulate the "collecting error info" percentage counter
  useEffect(() => {
    const duration = 4000; // 4 seconds to reach 100%
    const stepMs = 60;
    const increment = 100 / (duration / stepMs);

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(prev + increment, 100);
        if (next >= 100) {
          clearInterval(timer);
          setTimeout(() => setDone(true), 600);
        }
        return next;
      });
    }, stepMs);

    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col justify-between p-10 md:p-20 select-none"
      style={{ backgroundColor: '#0078D7', fontFamily: 'Segoe UI, system-ui, sans-serif' }}
    >
      {/* Top / Main Content */}
      <div className="flex-1 flex flex-col justify-center">
        {/* Sad face */}
        <h1
          className="text-[120px] font-light leading-none mb-6 text-white"
          style={{ fontWeight: 100 }}
        >
          :(
        </h1>

        {/* Main message */}
        <p className="text-2xl md:text-3xl font-light text-white max-w-3xl leading-snug mb-8">
          Your <strong>Web OS</strong> ran into a problem and needs to restart. We're just collecting
          some error info, and then we'll restart for you.
        </p>

        {/* Progress */}
        <p className="text-xl md:text-2xl text-white font-light mb-10">
          {Math.floor(progress)}% complete
        </p>

        {/* Restart Button (shows after completion) */}
        {done && (
          <button
            onClick={() => window.location.reload()}
            className="self-start px-8 py-3 bg-white text-[#0078D7] font-semibold text-base rounded hover:bg-blue-50 transition-colors shadow-lg"
          >
            Restart Now
          </button>
        )}
      </div>

      {/* Bottom / Details Section */}
      <div className="flex items-end gap-8 mt-8">
        {/* QR Code Placeholder */}
        <div className="shrink-0 w-28 h-28 bg-white rounded flex items-center justify-center">
          <svg viewBox="0 0 64 64" width="80" height="80" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Simple mock QR grid */}
            <rect x="4"  y="4"  width="24" height="24" rx="2" fill="#0078D7" />
            <rect x="8"  y="8"  width="16" height="16" rx="1" fill="white" />
            <rect x="11" y="11" width="10" height="10" fill="#0078D7" />
            <rect x="36" y="4"  width="24" height="24" rx="2" fill="#0078D7" />
            <rect x="40" y="8"  width="16" height="16" rx="1" fill="white" />
            <rect x="43" y="11" width="10" height="10" fill="#0078D7" />
            <rect x="4"  y="36" width="24" height="24" rx="2" fill="#0078D7" />
            <rect x="8"  y="40" width="16" height="16" rx="1" fill="white" />
            <rect x="11" y="43" width="10" height="10" fill="#0078D7" />
            {/* Random dots for QR data area */}
            <rect x="36" y="36" width="5" height="5" fill="#0078D7" />
            <rect x="43" y="36" width="5" height="5" fill="#0078D7" />
            <rect x="50" y="36" width="5" height="5" fill="#0078D7" />
            <rect x="36" y="43" width="5" height="5" fill="#0078D7" />
            <rect x="50" y="43" width="5" height="5" fill="#0078D7" />
            <rect x="36" y="50" width="5" height="5" fill="#0078D7" />
            <rect x="43" y="50" width="5" height="5" fill="#0078D7" />
          </svg>
        </div>

        {/* Support text */}
        <div className="text-white text-sm leading-relaxed font-light">
          <p className="mb-1">
            For more information about this issue and possible fixes, visit{' '}
            <span className="underline opacity-80">https://windows.com/stopcode</span>
          </p>
          <p className="mb-1">If you call a support person, give them this info:</p>
          <p className="mb-1">
            Stop code: <span className="font-semibold">REACT_COMPONENT_CRASH</span>
          </p>
          {errorMessage && (
            <p className="opacity-75 break-all max-w-xl text-xs mt-2">
              Error detail: {errorMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
