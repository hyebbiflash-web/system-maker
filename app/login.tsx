"use client";

import { signInWithRedirect, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "./firebase";

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const handleLogin = async () => {
    try {
      // 사파리/모바일은 redirect, 그 외는 popup
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isSafari || isMobile) {
        await signInWithRedirect(auth, googleProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
        onLogin();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-lg p-10 w-full max-w-sm flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[#191f28] mb-2">
            System Maker
          </h1>
          <p className="text-[#8A8178] text-sm">
            나만의 업무 OS에 오신 걸 환영해요 😊
          </p>
        </div>

        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 bg-white border border-[#E8E1D8] rounded-2xl px-6 py-4 text-[#191f28] font-bold text-base hover:bg-[#F8F6F1] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            <path fill="none" d="M0 0h48v48H0z"/>
          </svg>
          Google로 시작하기
        </button>

        <p className="text-[#B0A79E] text-xs text-center">
          로그인하면 데이터가 안전하게 저장돼요
        </p>
      </div>
    </div>
  );
}