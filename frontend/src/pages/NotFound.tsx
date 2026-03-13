// src/pages/NotFound.tsx
import { Link } from "react-router-dom";
export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
      <div className="font-display text-8xl text-gray-200 mb-4">404</div>
      <h1 className="font-display text-2xl text-gray-900 mb-2">Page not found</h1>
      <p className="text-gray-500 text-sm mb-6">That page doesn't exist or you don't have access.</p>
      <Link to="/" className="px-4 py-2 bg-brand-500 text-white rounded text-sm hover:bg-brand-600">Back to home</Link>
    </div>
  );
}
