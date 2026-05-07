"use client";

import { signInWithRedirect, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "./firebase";

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const handleLogin = async () => {
    try {
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isSafari || isMobile) {
        // 모바일/사파리 → 페이지 이동 방식
        await signInWithRedirect(auth, googleProvider);
      } else {
        // 데스크탑 크롬 등 → 팝업 방식
        await signInWithPopup(auth, googleProvider);
        onLogin();
      }
    } catch (e: unknown) {
      console.error(e);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#F7F8FA",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
    }}>
      <div style={{
        background: "white",
        borderRadius: "28px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
        padding: "48px 40px",
        width: "100%",
        maxWidth: "360px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "24px",
      }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "bold", color: "#191f28", marginBottom: "8px" }}>
            System Maker
          </h1>
          <p style={{ color: "#8A8178", fontSize: "14px", margin: 0 }}>
            나만의 업무 OS에 오신 걸 환영해요 😊
          </p>
        </div>

        <button
          onClick={handleLogin}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            background: "white",
            border: "1px solid #E8E1D8",
            borderRadius: "18px",
            padding: "16px 24px",
            color: "#191f28",
            fontWeight: "bold",
            fontSize: "15px",
            cursor: "pointer",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Google로 시작하기
        </button>

        <p style={{ color: "#B0A79E", fontSize: "12px", textAlign: "center", margin: 0 }}>
          로그인하면 데이터가 안전하게 저장돼요
        </p>
      </div>
    </div>
  );
}