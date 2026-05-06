import { signInWithGoogle, signInAsGuest } from '../lib/firebase';
import { Code2 } from 'lucide-react';
import { useState } from 'react';

export function AuthView() {
  const [error, setError] = useState('');

  const handleGuest = async () => {
    try {
      await signInAsGuest();
    } catch (err: any) {
      setError('Please enable Anonymous Authentication in the Firebase Console to use Guest Mode.');
    }
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[#1e1e1e] text-[#cccccc]">
      <div className="flex flex-col items-center justify-center space-y-6 rounded-lg bg-[#252526] p-10 shadow-lg outline outline-1 outline-[#333333]">
        <Code2 size={64} className="text-[#007acc]" />
        <h1 className="text-2xl font-semibold text-white">webJO</h1>
        <p className="text-center text-sm text-[#969696]">
          Sign in to save your workspaces securely<br /> in Firebase, or try it out as a guest.
        </p>
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-[#f48771] text-xs p-3 rounded text-center w-full max-w-sm">
            {error}
          </div>
        )}
        <div className="flex flex-col w-full space-y-3 mt-4">
          <button
            onClick={signInWithGoogle}
            className="flex items-center justify-center space-x-2 rounded bg-[#007acc] px-4 py-2 font-medium text-white transition-colors hover:bg-[#005f9e] w-full"
          >
            <span>Sign In with Google</span>
          </button>
          <button
            onClick={handleGuest}
            className="flex items-center justify-center space-x-2 rounded bg-transparent border border-[#007acc] px-4 py-2 font-medium text-[#007acc] transition-colors hover:bg-white/5 w-full"
          >
            <span>Continue as Guest</span>
          </button>
        </div>
      </div>
    </div>
  );
}
